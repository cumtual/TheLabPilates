// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Auditoría de inscripciones, EXCLUSIVA de admin
 * (SPEC-CANCELLATION-AUDIT-AND-TERMS §3.5, TASK-CA-SEC-01).
 */

vi.mock('@/db', () => ({ db: { select: vi.fn() } }));

import { db } from '@/db';
import {
  AdminAuditForbiddenError,
  assertAdminViewer,
  getClassEnrollmentAudit,
  toAuditLabels,
} from '@/lib/queries/admin-enrollment-audit';

/** Cadena Drizzle falsa: cualquier método encadena y el `await` resuelve `rows`. */
function chain(rows: unknown[]) {
  const target: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get(_, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(rows);
      return () => proxy;
    },
  });
  return proxy;
}

const BOOKED = new Date('2026-09-24T15:00:00Z'); // 09:00 AM CDMX
const CANCELLED = new Date('2026-09-24T16:15:00Z'); // 10:15 AM CDMX

beforeEach(() => {
  vi.clearAllMocks();
});

describe('control de acceso', () => {
  it.each([
    ['coach', { role: 'coach' as const }],
    ['client', { role: 'client' as const }],
    ['sin sesión', null],
    ['undefined', undefined],
  ])('%s → AdminAuditForbiddenError sin consultar la BD', async (_, viewer) => {
    await expect(getClassEnrollmentAudit('class-1', viewer)).rejects.toBeInstanceOf(AdminAuditForbiddenError);
    expect(db.select).not.toHaveBeenCalled();
    expect(() => assertAdminViewer(viewer)).toThrow(AdminAuditForbiddenError);
  });

  it('admin sí pasa la aserción', () => {
    expect(() => assertAdminViewer({ role: 'admin' })).not.toThrow();
  });
});

describe('toAuditLabels — cancelled_at solo para inscripciones canceladas', () => {
  it.each(['cancelled', 'late_cancelled'] as const)('%s expone la fecha de cancelación', (status) => {
    expect(toAuditLabels(status, BOOKED, CANCELLED)).toEqual({
      bookedAt: '24/09/2026, 09:00 AM',
      cancelledAt: '24/09/2026, 10:15 AM',
    });
  });

  it('cancelada sin timestamp histórico → "Sin registro"', () => {
    expect(toAuditLabels('cancelled', BOOKED, null).cancelledAt).toBe('Sin registro');
  });

  it.each(['pending', 'attended', 'absent', null] as const)(
    '%s NUNCA expone cancelledAt aunque la BD traiga un valor',
    (status) => {
      expect(toAuditLabels(status, BOOKED, CANCELLED).cancelledAt).toBeNull();
    }
  );
});

describe('getClassEnrollmentAudit (admin)', () => {
  it('devuelve titulares e invitados con fechas CDMX formateadas', async () => {
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(
        chain([
          { enrollmentId: 'e-1', status: 'late_cancelled', createdAt: BOOKED, cancelledAt: CANCELLED, name: 'Ana', email: 'ana@test.com' },
          { enrollmentId: 'e-2', status: 'pending', createdAt: BOOKED, cancelledAt: CANCELLED, name: null, email: 'x@test.com' },
        ])
      )
      .mockReturnValueOnce(
        chain([
          { enrollmentId: 'g-1', status: 'cancelled', createdAt: BOOKED, cancelledAt: null, name: 'Invitada', registeredByName: 'Ana' },
        ])
      );

    const rows = await getClassEnrollmentAudit('class-1', { role: 'admin' });

    expect(rows).toEqual([
      { kind: 'titular', enrollmentId: 'e-1', name: 'Ana', detail: 'ana@test.com', status: 'late_cancelled', bookedAt: '24/09/2026, 09:00 AM', cancelledAt: '24/09/2026, 10:15 AM' },
      { kind: 'titular', enrollmentId: 'e-2', name: 'x@test.com', detail: 'x@test.com', status: 'pending', bookedAt: '24/09/2026, 09:00 AM', cancelledAt: null },
      { kind: 'guest', enrollmentId: 'g-1', name: 'Invitada', detail: 'Invitado de Ana', status: 'cancelled', bookedAt: '24/09/2026, 09:00 AM', cancelledAt: 'Sin registro' },
    ]);
    expect(db.select).toHaveBeenCalledTimes(2);
  });
});
