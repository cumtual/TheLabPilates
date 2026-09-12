// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock modules before importing the action
vi.mock('@/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { createClassAction } from '../coach';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

/**
 * Helper: format a Date as a local datetime-local string (YYYY-MM-DDTHH:mm)
 * This matches what HTML <input type="datetime-local"> produces.
 */
function toLocalDatetimeString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Property 22: Class Creation Validation
 *
 * For any class creation request, the operation SHALL succeed if and only if
 * the provided class_date > now AND 1 <= capacity <= 20.
 * Invalid inputs SHALL be rejected with no record created.
 *
 * **Validates: Requirements 8.2**
 */
describe('Property 22: Class Creation Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: 'coach-uuid-123',
      role: 'coach',
      email: 'coach@test.com',
    });
  });

  it('succeeds iff class_date > now AND 1 <= capacity <= 20', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Boolean to decide future vs past date
        fc.boolean(),
        // Days offset (at least 1 day to be clearly past/future, avoids boundary)
        fc.integer({ min: 1, max: 365 }),
        // capacity: range covers invalid (< 1 and > 20) and valid (1-20)
        fc.integer({ min: -5, max: 25 }),
        // Always use a valid classType to isolate the date+capacity property
        fc.constantFrom('yoga', 'mat_pilates', 'barre'),
        async (shouldBeFuture, daysOffset, capacity, classType) => {
          // Reset mocks for each iteration
          vi.clearAllMocks();
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
            sub: 'coach-uuid-123',
            role: 'coach',
            email: 'coach@test.com',
          });
          (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          });

          // Build a date that's clearly in the future or clearly in the past
          const now = new Date();
          const targetDate = new Date(now);
          if (shouldBeFuture) {
            targetDate.setDate(now.getDate() + daysOffset);
          } else {
            targetDate.setDate(now.getDate() - daysOffset);
          }

          // Format as local datetime-local string (matches form input behavior)
          const dateStr = toLocalDatetimeString(targetDate);
          const isValidCapacity = capacity >= 1 && capacity <= 20;

          const formData = new FormData();
          formData.set('classDate', dateStr);
          formData.set('capacity', capacity.toString());
          formData.set('classType', classType);

          const result = await createClassAction(null, formData);

          if (shouldBeFuture && isValidCapacity) {
            // Valid inputs: class should be created
            expect(result.success).toBe(true);
            expect(db.insert).toHaveBeenCalled();
          } else {
            // Invalid inputs: class should NOT be created
            expect(result.success).toBe(false);
            expect(db.insert).not.toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
