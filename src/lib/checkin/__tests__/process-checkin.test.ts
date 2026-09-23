// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('@/db', () => ({ db: { transaction: vi.fn() } }));

import { processCheckin, type CheckinActor } from '@/lib/checkin/process-checkin';
import { getClassDisplayName } from '@/lib/utils/class-type';
import {
  ADMIN_ID,
  CLASS_DATE,
  COACH_ID,
  OTHER_COACH_ID,
  VALID_TOKEN,
  buildEnrollment,
  createFakeCheckinStore,
} from './fakes';

const coach: CheckinActor = { id: COACH_ID, role: 'coach' };
const otherCoach: CheckinActor = { id: OTHER_COACH_ID, role: 'coach' };
const admin: CheckinActor = { id: ADMIN_ID, role: 'admin' };
const client: CheckinActor = { id: 'client-id', role: 'client' };

/** Hoy = 2026-09-22 10:00 CDMX (la clase fue a las 09:00). */
const NOW = new Date('2026-09-22T10:00:00.000-06:00');

describe('processCheckin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('autenticación y rol (sin tocar la BD)', () => {
    it('sin sesión → UNAUTHENTICATED', async () => {
      const store = createFakeCheckinStore([buildEnrollment()]);
      const result = await processCheckin({ token: VALID_TOKEN, actor: null }, store.runInTransaction);
      expect(result).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
      expect(store.transactionCount()).toBe(0);
    });

    it('rol client → FORBIDDEN_ROLE (bloqueo 403)', async () => {
      const store = createFakeCheckinStore([buildEnrollment()]);
      const result = await processCheckin({ token: VALID_TOKEN, actor: client }, store.runInTransaction);
      expect(result).toEqual({ ok: false, code: 'FORBIDDEN_ROLE' });
      expect(store.transactionCount()).toBe(0);
      expect(store.enrollments[0].status).toBe('pending');
    });

    it('token con formato inválido → TOKEN_NOT_FOUND sin consultar la BD', async () => {
      const store = createFakeCheckinStore([buildEnrollment()]);
      const result = await processCheckin({ token: 'no-es-un-token', actor: coach }, store.runInTransaction);
      expect(result).toEqual({ ok: false, code: 'TOKEN_NOT_FOUND' });
      expect(store.transactionCount()).toBe(0);
    });
  });

  describe('validación coach/admin', () => {
    it('coach titular → attended, token anulado y checked_in_at registrado', async () => {
      const store = createFakeCheckinStore([buildEnrollment()]);

      const result = await processCheckin({ token: VALID_TOKEN, actor: coach }, store.runInTransaction);

      expect(result).toEqual({
        ok: true,
        data: {
          enrollmentId: 'enrollment-1',
          studentName: 'Ana',
          className: getClassDisplayName('mat_pilates', null),
          classDate: CLASS_DATE.toISOString(),
          checkedInAt: expect.any(String),
        },
      });
      expect(store.enrollments[0]).toMatchObject({ status: 'attended', checkinToken: null });
      expect(store.enrollments[0].checkedInAt).toBeInstanceOf(Date);
      expect(store.transactionCount()).toBe(1);
    });

    it('coach que no es titular → NOT_CLASS_COACH sin modificar la reserva', async () => {
      const store = createFakeCheckinStore([buildEnrollment()]);
      const result = await processCheckin({ token: VALID_TOKEN, actor: otherCoach }, store.runInTransaction);
      expect(result).toEqual({ ok: false, code: 'NOT_CLASS_COACH' });
      expect(store.enrollments[0]).toMatchObject({ status: 'pending', checkinToken: VALID_TOKEN });
    });

    it('admin puede registrar la asistencia de cualquier clase', async () => {
      const store = createFakeCheckinStore([buildEnrollment({ coachUserId: OTHER_COACH_ID })]);
      const result = await processCheckin({ token: VALID_TOKEN, actor: admin }, store.runInTransaction);
      expect(result.ok).toBe(true);
      expect(store.enrollments[0].status).toBe('attended');
    });

    it('la titularidad se evalúa antes de revelar el estado de la reserva', async () => {
      const store = createFakeCheckinStore([buildEnrollment({ status: 'cancelled' })]);
      const result = await processCheckin({ token: VALID_TOKEN, actor: otherCoach }, store.runInTransaction);
      expect(result).toEqual({ ok: false, code: 'NOT_CLASS_COACH' });
    });
  });

  describe('estado de la reserva y de la clase', () => {
    it('token inexistente → TOKEN_NOT_FOUND', async () => {
      const store = createFakeCheckinStore([buildEnrollment()]);
      const result = await processCheckin({ token: 'b'.repeat(64), actor: coach }, store.runInTransaction);
      expect(result).toEqual({ ok: false, code: 'TOKEN_NOT_FOUND' });
    });

    it('propiedad: reserva que no está pending → ENROLLMENT_NOT_PENDING sin mutar', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('attended', 'absent', 'cancelled', 'late_cancelled' as const),
          async (status) => {
            const store = createFakeCheckinStore([buildEnrollment({ status })]);
            const result = await processCheckin({ token: VALID_TOKEN, actor: coach }, store.runInTransaction);
            expect(result).toEqual({ ok: false, code: 'ENROLLMENT_NOT_PENDING', details: { status } });
            expect(store.enrollments[0].status).toBe(status);
          }
        )
      );
    });

    it('clase cancelada → CLASS_CANCELLED', async () => {
      const store = createFakeCheckinStore([buildEnrollment({ classStatus: 'cancelled' })]);
      const result = await processCheckin({ token: VALID_TOKEN, actor: coach }, store.runInTransaction);
      expect(result).toEqual({ ok: false, code: 'CLASS_CANCELLED' });
    });

    it.each([
      ['mañana', new Date('2026-09-23T09:00:00.000-06:00')],
      ['ayer', new Date('2026-09-21T09:00:00.000-06:00')],
    ])('clase de %s → OUTSIDE_ATTENDANCE_WINDOW', async (_label, classDate) => {
      const store = createFakeCheckinStore([buildEnrollment({ classDate })]);
      const result = await processCheckin({ token: VALID_TOKEN, actor: coach }, store.runInTransaction);
      expect(result).toEqual({
        ok: false,
        code: 'OUTSIDE_ATTENDANCE_WINDOW',
        details: { classDate: classDate.toISOString() },
      });
      expect(store.enrollments[0].status).toBe('pending');
    });

    it('frontera CDMX: 23:59:59.999 del día de la clase se acepta; 00:00 del día siguiente no', async () => {
      const lastMoment = createFakeCheckinStore([buildEnrollment()]);
      const ok = await processCheckin(
        { token: VALID_TOKEN, actor: coach, now: new Date('2026-09-22T23:59:59.999-06:00') },
        lastMoment.runInTransaction
      );
      expect(ok.ok).toBe(true);

      const nextDay = createFakeCheckinStore([buildEnrollment()]);
      const late = await processCheckin(
        { token: VALID_TOKEN, actor: coach, now: new Date('2026-09-23T00:00:00.000-06:00') },
        nextDay.runInTransaction
      );
      expect(late).toMatchObject({ ok: false, code: 'OUTSIDE_ATTENDANCE_WINDOW' });
    });
  });

  describe('reuso y concurrencia', () => {
    it('reuso: el segundo escaneo del mismo token → TOKEN_NOT_FOUND', async () => {
      const store = createFakeCheckinStore([buildEnrollment()]);

      const first = await processCheckin({ token: VALID_TOKEN, actor: coach }, store.runInTransaction);
      const second = await processCheckin({ token: VALID_TOKEN, actor: coach }, store.runInTransaction);

      expect(first.ok).toBe(true);
      expect(second).toEqual({ ok: false, code: 'TOKEN_NOT_FOUND' });
      expect(store.enrollments.filter((e) => e.status === 'attended')).toHaveLength(1);
    });

    it('carrera: si el UPDATE con guardas no afecta filas, nunca reporta éxito', async () => {
      const store = createFakeCheckinStore([buildEnrollment()]);
      store.repository.markAttended = vi.fn().mockResolvedValue(null);

      const result = await processCheckin({ token: VALID_TOKEN, actor: coach }, store.runInTransaction);

      expect(result).toEqual({ ok: false, code: 'TOKEN_NOT_FOUND' });
    });
  });
});
