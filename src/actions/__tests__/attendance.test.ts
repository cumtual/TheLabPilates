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

import { updateAttendanceAction } from '../coach';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

function mockCoachClass(classDate: Date) {
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
