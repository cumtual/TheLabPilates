// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Bug Condition Exploration Test
 *
 * **Property 1: Bug Condition** - Admin Class Creation Silent Failure
 *
 * This test encodes the EXPECTED (correct) behavior. It is expected to FAIL
 * on unfixed code, confirming that the bugs exist.
 *
 * Bug condition: isBugCondition(X) = dbInsertThrows(X) OR timezoneMismatchCausesRejection(X)
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 */

// Mock modules before importing the action
vi.mock('@/db', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(),
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

vi.mock('@/lib/email/service', () => ({
  sendEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendClassCancellationEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentRejectedEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  sql: vi.fn(),
}));

import { adminCreateClassAction } from '@/actions/admin';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

// ============================================================
// Bug Condition 1: db.insert() throws → function throws unhandled
// ============================================================
describe('Bug Condition 1: db.insert() throws → adminCreateClassAction should return ActionResult (not throw)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock admin session
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: 'admin-uuid-123',
      role: 'admin',
      email: 'admin@test.com',
    });

    // Mock coach validation to pass (coach exists, active, has coach role)
    (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'coach-uuid-456',
      role: 'coach',
      deletedAt: null,
      email: 'coach@test.com',
      username: 'TestCoach',
    });
  });

  it('PROPERTY: For all valid form data where db.insert() throws, adminCreateClassAction returns { success: false } without throwing', async () => {
    const dbErrors = [
      new Error('connection refused'),
      new Error('unique constraint violated'),
      new Error('timeout exceeded'),
      new Error('disk full'),
      new Error('ECONNRESET'),
    ];

    await fc.assert(
      fc.asyncProperty(
        // Generate future dates (at least 1 day from now to avoid edge cases)
        fc.integer({ min: 1, max: 365 }).map((daysAhead) => {
          const date = new Date();
          date.setDate(date.getDate() + daysAhead);
          date.setHours(10, 0, 0, 0);
          return date.toISOString();
        }),
        // Generate valid capacity 1-20
        fc.integer({ min: 1, max: 20 }),
        // Generate valid class type
        fc.constantFrom('yoga', 'mat_pilates', 'barre'),
        // Generate valid coach UUID
        fc.uuid(),
        // Pick a random DB error
        fc.constantFrom(...dbErrors),
        async (classDate, capacity, classType, coachId, dbError) => {
          vi.clearAllMocks();

          // Mock admin session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
            sub: 'admin-uuid-123',
            role: 'admin',
            email: 'admin@test.com',
          });

          // Mock coach validation to pass
          (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: coachId,
            role: 'coach',
            deletedAt: null,
            email: 'coach@test.com',
            username: 'TestCoach',
          });

          // Mock db.insert() to throw the error
          (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
            values: vi.fn().mockRejectedValue(dbError),
          });

          // Build form data
          const formData = new FormData();
          formData.set('classDate', classDate);
          formData.set('capacity', capacity.toString());
          formData.set('classType', classType);
          formData.set('coachId', coachId);

          // The EXPECTED behavior: function returns ActionResult without throwing
          // The ACTUAL behavior on unfixed code: function throws the db error
          const result = await adminCreateClassAction(null, formData);

          // Should return a structured error (not throw)
          expect(result).toBeDefined();
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe('Error al crear la clase. Intenta de nuevo.');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================
// Bug Condition 2: Timezone mismatch causes valid future date rejection
// ============================================================
describe('Bug Condition 2: Timezone mismatch → valid future datetime-local should not be rejected', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock admin session
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: 'admin-uuid-123',
      role: 'admin',
      email: 'admin@test.com',
    });

    // Mock coach validation to pass
    (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'coach-uuid-456',
      role: 'coach',
      deletedAt: null,
      email: 'coach@test.com',
      username: 'TestCoach',
    });

    // Mock db.insert() to succeed (we're testing date validation, not db errors)
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('PROPERTY: datetime-local string "2025-07-15T10:00" interpreted as Mexico City time is correctly handled', async () => {
    // After the timezone fix, datetime-local values are interpreted as America/Mexico_City.
    // "2025-07-15T10:00" → 10:00 AM Mexico City = 16:00 UTC (CDT, UTC-5 in summer)
    // When server time is 2025-07-15T11:00Z, 16:00 UTC is in the FUTURE.
    // This is CORRECT behavior — the date should be ACCEPTED.

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-07-15T11:00:00Z'));

    // Mock db.insert() to succeed since we expect the date to pass validation
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const formData = new FormData();
    formData.set('classDate', '2025-07-15T10:00'); // No Z suffix - datetime-local format
    formData.set('capacity', '10');
    formData.set('classType', 'yoga');
    formData.set('coachId', 'coach-uuid-456');

    const result = await adminCreateClassAction(null, formData);

    // EXPECTED behavior after timezone fix: The datetime-local is interpreted as Mexico City time.
    // 10:00 Mexico City = 16:00 UTC, which is after 11:00 UTC (current time) → future → accepted
    expect(result.success).toBe(true);

    vi.useRealTimers();
  });

  it('PROPERTY: For all datetime-local strings representing times 1-6 hours in the future (UTC), no timezone-based rejection', async () => {
    vi.useFakeTimers();

    await fc.assert(
      fc.asyncProperty(
        // Generate hours offset (1-6 hours in the future from "now")
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 59 }), // minutes
        async (hoursAhead, minutes) => {
          vi.clearAllMocks();

          // Set a fixed "now" time
          const now = new Date('2025-07-15T12:00:00Z');
          vi.setSystemTime(now);

          // Mock admin session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
            sub: 'admin-uuid-123',
            role: 'admin',
            email: 'admin@test.com',
          });

          // Mock coach validation to pass
          (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'coach-uuid-456',
            role: 'coach',
            deletedAt: null,
            email: 'coach@test.com',
            username: 'TestCoach',
          });

          // Mock db.insert() to succeed
          (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          });

          // Create a datetime-local string that represents a time in the future
          // in UTC but format it WITHOUT 'Z' suffix (as datetime-local does)
          const futureDate = new Date(now.getTime() + hoursAhead * 3600000 + minutes * 60000);
          const year = futureDate.getUTCFullYear();
          const month = String(futureDate.getUTCMonth() + 1).padStart(2, '0');
          const day = String(futureDate.getUTCDate()).padStart(2, '0');
          const hour = String(futureDate.getUTCHours()).padStart(2, '0');
          const min = String(futureDate.getUTCMinutes()).padStart(2, '0');
          // datetime-local format without timezone suffix
          const dateTimeLocal = `${year}-${month}-${day}T${hour}:${min}`;

          const formData = new FormData();
          formData.set('classDate', dateTimeLocal);
          formData.set('capacity', '10');
          formData.set('classType', 'yoga');
          formData.set('coachId', 'coach-uuid-456');

          const result = await adminCreateClassAction(null, formData);

          // EXPECTED: Should not be rejected as "past date"
          // These dates ARE in the future, just formatted without Z suffix
          if (!result.success) {
            expect(result.error).not.toBe('La fecha debe ser en el futuro.');
          }
        }
      ),
      { numRuns: 30 }
    );

    vi.useRealTimers();
  });
});
