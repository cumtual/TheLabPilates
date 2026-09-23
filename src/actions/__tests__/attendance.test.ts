// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// Mock modules before importing the action
vi.mock('@/db', () => ({
  db: {
    query: {
      openClasses: { findFirst: vi.fn() },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  }),
}));

import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { updateAttendanceAction } from '../coach';
import { db } from '@/db';
import { classEnrollments, guestEnrollments } from '@/db/schema';
import { getSession } from '@/lib/auth/session';

type MembershipRow = { id: string; status: string };

/**
 * Enrollments that belong to the class, per table. The action checks membership
 * with db.select().from(table).where(...) before writing anything.
 */
function mockMembership(titulares: MembershipRow[], guests: MembershipRow[] = []) {
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    from: (table: unknown) => ({
      where: vi.fn().mockResolvedValue(table === classEnrollments ? titulares : guests),
    }),
  }));
}

function mockCoachClass(classDate: Date) {
  mockMembership([{ id: 'enrollment-1', status: 'pending' }]);
  // Writes run inside db.transaction; the tx exposes the same update() mock
  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => cb(db)
  );

  (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    sub: 'coach-uuid-123',
    role: 'coach',
    email: 'coach@test.com',
  });

  (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'class-uuid-123',
    coachUserId: 'coach-uuid-123',
    classDate,
    status: 'scheduled',
    capacity: 10,
  });

  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });
}

/**
 * Property 23 (updated): Attendance Day Window Guard
 *
 * Attendance is enabled only during the class calendar day in America/Mexico_City
 * (00:00:00 to 23:59:59.999). Classes on any other calendar day (past or future)
 * SHALL be blocked with no enrollment statuses modified.
 */
describe('Property 23: Attendance Day Window Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks classes outside the class calendar day (past or future)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        // Boolean to decide past vs future class date
        fc.boolean(),
        // Days offset from now (at least 2 days to avoid same-day boundaries)
        fc.integer({ min: 2, max: 365 }),
        async (classId, isPast, daysOffset) => {
          vi.clearAllMocks();

          const classDate = new Date();
          if (isPast) {
            classDate.setDate(classDate.getDate() - daysOffset);
          } else {
            classDate.setDate(classDate.getDate() + daysOffset);
          }

          mockCoachClass(classDate);

          const result = await updateAttendanceAction(classId, [
            { enrollmentId: 'enrollment-1', status: 'attended' },
          ]);

          expect(result.success).toBe(false);
          expect(db.update).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Attendance End-of-Day Window (America/Mexico_City)
 *
 * Deterministic cases using fixed CDMX instants:
 * - Same class day (even before the class start time) → allowed.
 * - After midnight CDMX of the next day → blocked with the "period finished" message.
 * - Before the class calendar day → blocked with the "before the class day" message.
 */
describe('Attendance End-of-Day Window (CDMX)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows attendance at 23:30 CDMX on the class day', async () => {
    vi.setSystemTime(new Date('2026-09-15T23:30:00-06:00'));
    mockCoachClass(new Date('2026-09-15T20:00:00-06:00'));

    const result = await updateAttendanceAction('class-uuid-123', [
      { enrollmentId: 'enrollment-1', status: 'attended' },
    ]);

    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it('blocks attendance after midnight CDMX of the next day', async () => {
    vi.setSystemTime(new Date('2026-09-16T00:01:00-06:00'));
    mockCoachClass(new Date('2026-09-15T20:00:00-06:00'));

    const result = await updateAttendanceAction('class-uuid-123', [
      { enrollmentId: 'enrollment-1', status: 'attended' },
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        'El periodo para registrar asistencia de esta clase ha finalizado.'
      );
    }
    expect(db.update).not.toHaveBeenCalled();
  });

  it('blocks attendance before the class calendar day', async () => {
    vi.setSystemTime(new Date('2026-09-14T10:00:00-06:00'));
    mockCoachClass(new Date('2026-09-15T20:00:00-06:00'));

    const result = await updateAttendanceAction('class-uuid-123', [
      { enrollmentId: 'enrollment-1', status: 'attended' },
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        'No puedes registrar asistencia antes del día de la clase.'
      );
    }
    expect(db.update).not.toHaveBeenCalled();
  });
});

/**
 * QR check-in consistency + hardening (TASK-QR-BE-08)
 *
 * - attended keeps the first check-in time (coalesce) and voids the QR token.
 * - absent clears checked_in_at and voids the QR token.
 * - Every enrollment must belong to the class and be pending/attended/absent;
 *   otherwise nothing is written (no cross-class writes, no reactivating cancellations).
 * - All writes run in a single transaction.
 */
describe('Manual attendance: QR consistency and hardening', () => {
  const dialect = new PgDialect();
  let setMock: ReturnType<typeof vi.fn>;
  let whereMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T10:00:00-06:00'));
    mockCoachClass(new Date('2026-09-15T09:00:00-06:00'));
    whereMock = vi.fn().mockResolvedValue(undefined);
    setMock = vi.fn().mockReturnValue({ where: whereMock });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: setMock });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('attended keeps the first check-in time and voids the token', async () => {
    const result = await updateAttendanceAction('class-uuid-123', [
      { enrollmentId: 'enrollment-1', status: 'attended' },
    ]);

    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalledWith(classEnrollments);
    const values = setMock.mock.calls[0][0];
    expect(values.status).toBe('attended');
    expect(values.checkinToken).toBeNull();
    expect(dialect.sqlToQuery(values.checkedInAt as SQL).sql).toBe(
      'coalesce("class_enrolleds"."checked_in_at", now())'
    );
  });

  it('absent clears checked_in_at and voids the token', async () => {
    await updateAttendanceAction('class-uuid-123', [
      { enrollmentId: 'enrollment-1', status: 'absent' },
    ]);

    expect(setMock).toHaveBeenCalledWith({ status: 'absent', checkedInAt: null, checkinToken: null });
  });

  it('scopes every write to the class', async () => {
    await updateAttendanceAction('class-uuid-123', [
      { enrollmentId: 'enrollment-1', status: 'attended' },
    ]);

    const { sql, params } = dialect.sqlToQuery(whereMock.mock.calls[0][0] as SQL);
    expect(sql).toContain('"class_enrolleds"."open_class_id" = $2');
    expect(params).toEqual(['enrollment-1', 'class-uuid-123']);
  });

  it('rejects an enrollment from another class without writing', async () => {
    const result = await updateAttendanceAction('class-uuid-123', [
      { enrollmentId: 'enrollment-1', status: 'attended' },
      { enrollmentId: 'enrollment-of-other-class', status: 'absent' },
    ]);

    expect(result.success).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'late_cancelled'])('does not reactivate a %s enrollment', async (status) => {
    mockMembership([{ id: 'enrollment-1', status }]);

    const result = await updateAttendanceAction('class-uuid-123', [
      { enrollmentId: 'enrollment-1', status: 'attended' },
    ]);

    expect(result.success).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates guest enrollments in their own table, inside one transaction', async () => {
    mockMembership(
      [{ id: 'enrollment-1', status: 'pending' }],
      [{ id: 'guest-1', status: 'pending' }]
    );

    const result = await updateAttendanceAction('class-uuid-123', [
      { enrollmentId: 'enrollment-1', status: 'attended' },
      { enrollmentId: 'guest-1', status: 'absent' },
    ]);

    expect(result.success).toBe(true);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenNthCalledWith(2, guestEnrollments);
    expect(setMock).toHaveBeenNthCalledWith(2, { status: 'absent' });
  });
});
