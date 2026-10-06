// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Las consultas compartidas con el coach NO deben proyectar timestamps de
 * auditoría (SPEC-CANCELLATION-AUDIT-AND-TERMS §3.5, TASK-CA-SEC-01).
 */

vi.mock('@/db', () => ({ db: { select: vi.fn() } }));

import { db } from '@/db';
import { getClassEnrollments, getCancelledEnrollments } from '@/lib/queries/coach';

function captureProjection() {
  const projections: Record<string, unknown>[] = [];
  (db.select as ReturnType<typeof vi.fn>).mockImplementation((projection: Record<string, unknown>) => {
    projections.push(projection);
    const target: Record<string, unknown> = {};
    const proxy: unknown = new Proxy(target, {
      get(_, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve([]);
        return () => proxy;
      },
    });
    return proxy;
  });
  return projections;
}

beforeEach(() => vi.clearAllMocks());

describe.each([
  ['getClassEnrollments', getClassEnrollments, ['enrollmentId', 'status', 'studentEmail', 'studentName', 'userId']],
  ['getCancelledEnrollments', getCancelledEnrollments, ['enrollmentId', 'status', 'studentEmail', 'studentName']],
] as const)('%s (coach + admin)', (_, query, allowedKeys) => {
  it('proyecta solo las llaves permitidas, sin timestamps de auditoría', async () => {
    const projections = captureProjection();
    await query('class-1');

    expect(projections).toHaveLength(1);
    const keys = Object.keys(projections[0]).sort();
    expect(keys).toEqual([...allowedKeys]);
    expect(keys).not.toContain('cancelledAt');
    expect(keys).not.toContain('createdAt');
  });
});
