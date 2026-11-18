import { describe, it, expect } from 'vitest';
import { checkInGuestByToken } from '../use-cases/check-in-guest';
import { guestRow, inMemoryDeps, NOW, TOKEN } from './in-memory';

const admin = { id: 'admin-1', role: 'admin' as const };
const titularCoach = { id: 'coach-1', role: 'coach' as const };

describe('checkInGuestByToken', () => {
  it('sin sesión → UNAUTHENTICATED; client → FORBIDDEN_ROLE, sin abrir la transacción', async () => {
    const { deps, calls } = inMemoryDeps([guestRow()]);
    expect(await checkInGuestByToken({ token: TOKEN, actor: null }, deps)).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(await checkInGuestByToken({ token: TOKEN, actor: { id: 'c', role: 'client' } }, deps)).toEqual({
      ok: false,
      code: 'FORBIDDEN_ROLE',
    });
    expect(calls.transactions).toBe(0);
  });

  it('token con formato inválido → TOKEN_NOT_FOUND sin consultar la BD', async () => {
    const { deps, calls } = inMemoryDeps([guestRow()]);
    for (const token of ['', 'abc', 'A'.repeat(64), 42, null]) {
      expect(await checkInGuestByToken({ token, actor: admin }, deps)).toEqual({ ok: false, code: 'TOKEN_NOT_FOUND' });
    }
    expect(calls.transactions).toBe(0);
  });

  it('el coach titular registra la asistencia: attended, momento, actor y token anulado', async () => {
    const { deps, rows } = inMemoryDeps([guestRow()]);
    const result = await checkInGuestByToken({ token: TOKEN, actor: titularCoach }, deps);

    expect(result).toEqual({
      ok: true,
      data: {
        guestEnrollmentId: 'guest-1',
        guestName: 'María López',
        invitedByName: 'Admin Studio',
        className: 'Mat Pilates',
        classDate: '2026-11-20T15:00:00.000Z',
        checkedInAt: NOW.toISOString(),
      },
    });
    expect(rows[0]).toMatchObject({ status: 'attended', checkedInById: 'coach-1', checkinToken: null, checkedInAt: NOW });
  });

  it('un segundo uso del mismo token → TOKEN_NOT_FOUND (un solo uso)', async () => {
    const { deps } = inMemoryDeps([guestRow()]);
    expect((await checkInGuestByToken({ token: TOKEN, actor: admin }, deps)).ok).toBe(true);
    expect(await checkInGuestByToken({ token: TOKEN, actor: admin }, deps)).toEqual({ ok: false, code: 'TOKEN_NOT_FOUND' });
  });

  it('si el UPDATE no afecta filas (otro escaneo ganó) → TOKEN_NOT_FOUND', async () => {
    const { deps, repository } = inMemoryDeps([guestRow()]);
    repository.markAttended = async () => null;
    expect(await checkInGuestByToken({ token: TOKEN, actor: admin }, deps)).toEqual({ ok: false, code: 'TOKEN_NOT_FOUND' });
  });

  it('aplica las reglas de dominio: coach ajeno, fuera de la ventana', async () => {
    const { deps, rows } = inMemoryDeps([guestRow()], { windowOpen: false });
    expect(await checkInGuestByToken({ token: TOKEN, actor: { id: 'coach-2', role: 'coach' } }, deps)).toEqual({
      ok: false,
      code: 'NOT_CLASS_COACH',
    });
    expect(await checkInGuestByToken({ token: TOKEN, actor: admin }, deps)).toEqual({
      ok: false,
      code: 'OUTSIDE_ATTENDANCE_WINDOW',
      details: { classDate: '2026-11-20T15:00:00.000Z' },
    });
    expect(rows[0].status).toBe('pending');
    expect(rows[0].checkinToken).toBe(TOKEN);
  });
});
