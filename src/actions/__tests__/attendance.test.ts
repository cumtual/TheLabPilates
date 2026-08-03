// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

/**
 * Property 23: Attendance Date Guard
 *
 * For any attendance update request, the operation SHALL succeed only if the
 * class's class_date is in the past. Attempting attendance for a future class
 * SHALL be blocked with no enrollment statuses modified.
 *
 * **Validates: Requirements 8.4, 8.5**
 */
describe('Property 23: Attendance Date Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('succeeds only if class_date is in the past', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a UUID-like classId
        fc.uuid(),
        // Boolean to decide past vs future class date
        fc.boolean(),
        // Days offset from now (at least 1 day to avoid boundary)
        fc.integer({ min: 1, max: 365 }),
        async (classId, isPast, daysOffset) => {
          // Reset mocks for each iteration
          vi.clearAllMocks();

          // Mock authenticated coach session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
            sub: 'coach-uuid-123',
            role: 'coach',
            email: 'coach@test.com',
          });

          // Build a class date that is clearly in the past or future
          const classDate = new Date();
          if (isPast) {
            classDate.setDate(classDate.getDate() - daysOffset);
          } else {
            classDate.setDate(classDate.getDate() + daysOffset);
          }

          // Mock the class lookup — class exists and belongs to this coach
          (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: classId,
            coachUserId: 'coach-uuid-123',
            classDate,
            status: 'scheduled',
            capacity: 10,
          });

          // Mock db.update chain for enrollment status updates and class completion
          const mockWhere = vi.fn().mockResolvedValue(undefined);
          const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
          (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

          const result = await updateAttendanceAction(classId, [
            { enrollmentId: 'enrollment-1', status: 'attended' },
          ]);

          if (isPast) {
            // Class date is in the past: attendance should succeed
            expect(result.success).toBe(true);
            expect(db.update).toHaveBeenCalled();
          } else {
            // Class date is in the future: attendance should be blocked
            expect(result.success).toBe(false);
            expect(db.update).not.toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
