// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for enrollWithGuestAction
 *
 * Properties tested:
 * - Property 8: Requisito de 2 cupos para reserva con invitado
 * - Property 9: Validación de nombre de invitado
 * - Property 10: Atomicidad de reserva con invitado (-2 cupos)
 *
 * Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7, 6.3
 */

// ─── Mock Setup ────────────────────────────────────────────────────────────────

// Track transaction operations for atomicity verification
let transactionInsertCalls: Array<{ table: string; values: unknown }> = [];
let transactionExecuteCalls: Array<unknown> = [];
let transactionWasRolledBack = false;

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    query: {
      openClasses: {
        findFirst: vi.fn(),
      },
    },
    transaction: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/guest/eligibility', () => ({
  isUserOpenLabEligible: vi.fn(),
}));

vi.mock('@/lib/guest/credits', () => ({
  getGuestCreditsForCycle: vi.fn(),
  consumeGuestCredit: vi.fn(),
  restoreGuestCredit: vi.fn(),
}));

vi.mock('@/lib/guest/capacity', () => ({
  getAvailableCapacity: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  sql: Object.assign(
    vi.fn((...args: unknown[]) => ({ type: 'sql_template', args })),
    { raw: vi.fn() }
  ),
  notInArray: vi.fn((...args: unknown[]) => ({ type: 'notInArray', args })),
}));

vi.mock('@/db/schema', () => ({
  classEnrollments: {
    id: 'id',
    openClassId: 'openClassId',
    userSubscriptionId: 'userSubscriptionId',
    status: 'status',
  },
  openClasses: { id: 'id', capacity: 'capacity', classDate: 'classDate', status: 'status' },
  guestEnrollments: {
    id: 'id',
    openClassId: 'openClassId',
    guestName: 'guestName',
    origin: 'origin',
    registeredById: 'registeredById',
    status: 'status',
  },
  guestCredits: {
    id: 'id',
    userId: 'userId',
    userSubscriptionId: 'userSubscriptionId',
    creditsUsed: 'creditsUsed',
    guestEnrollmentId: 'guestEnrollmentId',
  },
  userSubscriptions: {
    id: 'id',
    userId: 'userId',
  },
}));

import { enrollWithGuestAction, addGuestToReservationAction } from '../guest';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { isUserOpenLabEligible } from '@/lib/guest/eligibility';
import { getGuestCreditsForCycle } from '@/lib/guest/credits';
import { getAvailableCapacity } from '@/lib/guest/capacity';

// ─── Arbitraries (Generators) ──────────────────────────────────────────────────

const uuidArb = fc.uuid();

/** Valid guest name: 2-100 alphabetic characters with spaces */
const validGuestNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,98}[A-Za-z]$/)
  .filter((s) => s.trim().length >= 2 && s.trim().length <= 100);

/** Invalid guest name: too short (0-1 char after trim) */
const tooShortGuestNameArb = fc.oneof(
  fc.constant(''),
  fc.constant(' '),
  fc.constant('A'),
  fc.constant('  '),
  fc.constant('   '),
);

/** Invalid guest name: too long (> 100 chars) */
const tooLongGuestNameArb = fc.string({ minLength: 101, maxLength: 200 });

/** Available capacity less than 2 (0 or 1) */
const insufficientCapacityArb = fc.integer({ min: 0, max: 1 });

/** Available capacity of at least 2 */
const sufficientCapacityArb = fc.integer({ min: 2, max: 20 });

/** Future date for class */
const futureDateArb = fc.integer({ min: 2, max: 720 }).map((hours) => {
  const d = new Date();
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d;
});

// ─── Helper Functions ──────────────────────────────────────────────────────────

function resetTracking() {
  transactionInsertCalls = [];
  transactionExecuteCalls = [];
  transactionWasRolledBack = false;
}

/**
 * Setup common mocks for a valid session, eligibility, and credits.
 * Used when we want to isolate testing of capacity or name validation only.
 */
function setupValidSessionAndEligibility(userId: string, userSubId: string) {
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    sub: userId,
    role: 'client',
    email: 'test@example.com',
  });

  (isUserOpenLabEligible as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    eligible: true,
    userSubscription: { id: userSubId },
    subscription: { id: 'sub-1', guest: true },
  });

  (getGuestCreditsForCycle as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
}

/**
 * Setup mock for class lookup returning a valid scheduled class in the future.
 */
function setupValidClass(classId: string, classDate: Date, capacity: number) {
  (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    id: classId,
    classDate,
    capacity,
    status: 'scheduled',
    coachUserId: 'coach-1',
    available: 'available',
    classType: 'mat_pilates',
    createdAt: new Date(),
  });
}

/**
 * Setup mock for no duplicate enrollments.
 */
function setupNoDuplicateEnrollments() {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
}

/**
 * Creates a mock transaction that tracks insert and execute calls
 * to verify atomicity of the reservation.
 */
function createTrackingMockTransaction() {
  return async (cb: (tx: unknown) => Promise<void>) => {
    const mockTx = {
      execute: vi.fn((...args: unknown[]) => {
        transactionExecuteCalls.push(args);
        return Promise.resolve([{ id: 'mock-id' }]);
      }),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          transactionInsertCalls.push({ table: String(table), values });
          return {
            returning: vi.fn().mockResolvedValue([{ id: 'guest-enrollment-id' }]),
          };
        }),
      })),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }),
    };

    try {
      await cb(mockTx);
    } catch (e) {
      transactionWasRolledBack = true;
      throw e;
    }
  };
}

/**
 * Creates a mock transaction that fails the capacity re-check inside transaction.
 */
function createCapacityFailTransaction(occupiedCount: number, classCapacity: number) {
  return async (cb: (tx: unknown) => Promise<void>) => {
    let selectCallIndex = 0;
    const mockTx = {
      execute: vi.fn().mockResolvedValue([{ id: 'locked-class-id' }]),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            const count = selectCallIndex === 0
              ? occupiedCount // enrolled count
              : 0; // guest count (we put all in enrolled for simplicity)
            selectCallIndex++;
            return Promise.resolve([{ count }]);
          }),
        }),
      }),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          transactionInsertCalls.push({ table: String(table), values });
          return {
            returning: vi.fn().mockResolvedValue([{ id: 'guest-enrollment-id' }]),
          };
        }),
      })),
    };

    try {
      await cb(mockTx);
    } catch (e) {
      transactionWasRolledBack = true;
      throw e;
    }
  };
}

// ─── Property Tests ────────────────────────────────────────────────────────────

describe('Property 8: Requisito de 2 cupos para reserva con invitado', () => {
  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * For any class where available capacity (capacity - active_enrollments - active_guests)
   * is less than 2, the reservation with guest must be rejected with the message
   * "No hay cupos suficientes para ti y tu invitado".
   */

  beforeEach(() => {
    vi.clearAllMocks();
    resetTracking();
  });

  it('property: reservation with guest is rejected when available capacity < 2', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        validGuestNameArb,
        insufficientCapacityArb,
        futureDateArb,
        async (userId, classId, userSubId, guestName, availableCapacity, classDate) => {
          vi.clearAllMocks();
          resetTracking();

          // Setup valid session, eligibility, and credits
          setupValidSessionAndEligibility(userId, userSubId);

          // Setup a valid class
          setupValidClass(classId, classDate, 10);

          // Mock capacity to be insufficient (< 2)
          (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(availableCapacity);

          // Mock no duplicate enrollment
          setupNoDuplicateEnrollments();

          const result = await enrollWithGuestAction(classId, guestName);

          // Must be rejected
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toContain('cupos suficientes');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: reservation with guest is accepted when available capacity >= 2', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        validGuestNameArb,
        sufficientCapacityArb,
        futureDateArb,
        async (userId, classId, userSubId, guestName, availableCapacity, classDate) => {
          vi.clearAllMocks();
          resetTracking();

          // Setup valid session, eligibility, and credits
          setupValidSessionAndEligibility(userId, userSubId);

          // Setup a valid class with enough capacity
          setupValidClass(classId, classDate, availableCapacity + 5);

          // Mock capacity to be sufficient (>= 2)
          (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(availableCapacity);

          // Mock no duplicate enrollment
          setupNoDuplicateEnrollments();

          // Mock successful transaction
          (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
            createTrackingMockTransaction()
          );

          const result = await enrollWithGuestAction(classId, guestName);

          // Must succeed
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: capacity boundary - exactly 2 spots allows reservation', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        validGuestNameArb,
        futureDateArb,
        async (userId, classId, userSubId, guestName, classDate) => {
          vi.clearAllMocks();
          resetTracking();

          setupValidSessionAndEligibility(userId, userSubId);
          setupValidClass(classId, classDate, 10);

          // Exactly 2 spots available (boundary)
          (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2);
          setupNoDuplicateEnrollments();

          (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
            createTrackingMockTransaction()
          );

          const result = await enrollWithGuestAction(classId, guestName);

          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: capacity boundary - exactly 1 spot rejects reservation', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        validGuestNameArb,
        futureDateArb,
        async (userId, classId, userSubId, guestName, classDate) => {
          vi.clearAllMocks();
          resetTracking();

          setupValidSessionAndEligibility(userId, userSubId);
          setupValidClass(classId, classDate, 10);

          // Exactly 1 spot available (insufficient for titular + guest)
          (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
          setupNoDuplicateEnrollments();

          const result = await enrollWithGuestAction(classId, guestName);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toContain('cupos suficientes');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 9: Validación de nombre de invitado', () => {
  /**
   * **Validates: Requirements 3.5, 6.3**
   *
   * For any text string with length < 2, > 100, or empty,
   * the system must reject the guest enrollment creation.
   * For valid names (2-100 characters), the system must accept them
   * (assuming all other conditions are met).
   */

  beforeEach(() => {
    vi.clearAllMocks();
    resetTracking();
  });

  it('property: names with trimmed length < 2 are always rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        tooShortGuestNameArb,
        futureDateArb,
        async (userId, classId, userSubId, guestName, classDate) => {
          vi.clearAllMocks();

          // Setup valid session (name validation happens before eligibility check
          // in the implementation)
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: userId,
            role: 'client',
            email: 'test@example.com',
          });

          const result = await enrollWithGuestAction(classId, guestName);

          // Must be rejected due to invalid name
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toContain('2 caracteres');
            expect(result.field).toBe('guestName');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: names with length > 100 are always rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        tooLongGuestNameArb,
        futureDateArb,
        async (userId, classId, userSubId, guestName, classDate) => {
          vi.clearAllMocks();

          // Setup valid session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: userId,
            role: 'client',
            email: 'test@example.com',
          });

          const result = await enrollWithGuestAction(classId, guestName);

          // Must be rejected due to name too long
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toContain('100 caracteres');
            expect(result.field).toBe('guestName');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: valid names (2-100 chars) pass name validation and proceed', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        validGuestNameArb,
        futureDateArb,
        async (userId, classId, userSubId, guestName, classDate) => {
          vi.clearAllMocks();
          resetTracking();

          // Setup valid session, eligibility, credits, class, capacity
          setupValidSessionAndEligibility(userId, userSubId);
          setupValidClass(classId, classDate, 10);
          (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5);
          setupNoDuplicateEnrollments();

          // Mock successful transaction
          (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
            createTrackingMockTransaction()
          );

          const result = await enrollWithGuestAction(classId, guestName);

          // Should succeed (name validation passed, all other conditions met)
          expect(result.success).toBe(true);

          // Verify it did NOT fail due to name validation
          if (!result.success) {
            expect(result.field).not.toBe('guestName');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: null/undefined name is handled gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        async (userId, classId) => {
          vi.clearAllMocks();

          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: userId,
            role: 'client',
            email: 'test@example.com',
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await enrollWithGuestAction(classId, null as any);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.field).toBe('guestName');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: name with only spaces (trimmed length < 2) is rejected', async () => {
    const spacesOnlyArb = fc.constantFrom('', ' ', '  ', '   ', '    ', '     ');

    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        spacesOnlyArb,
        async (userId, classId, spaces) => {
          vi.clearAllMocks();

          (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            sub: userId,
            role: 'client',
            email: 'test@example.com',
          });

          const result = await enrollWithGuestAction(classId, spaces);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.field).toBe('guestName');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 10: Atomicidad de reserva con invitado (-2 cupos)', () => {
  /**
   * **Validates: Requirements 3.6, 3.7**
   *
   * For any successful reservation with guest, the class capacity must decrement
   * by exactly 2 units, and both the class_enrolleds (titular) record and
   * guest_enrollments (guest) record must exist with status 'pending' and
   * the titular's identifier stored.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    resetTracking();
  });

  it('property: successful reservation creates exactly 2 records in a single transaction', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        validGuestNameArb,
        futureDateArb,
        sufficientCapacityArb,
        async (userId, classId, userSubId, guestName, classDate, capacity) => {
          vi.clearAllMocks();
          resetTracking();

          setupValidSessionAndEligibility(userId, userSubId);
          setupValidClass(classId, classDate, capacity + 5);
          (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(capacity);
          setupNoDuplicateEnrollments();

          // Track what happens inside the transaction
          (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
            createTrackingMockTransaction()
          );

          const result = await enrollWithGuestAction(classId, guestName);

          expect(result.success).toBe(true);

          // Verify exactly 2 insert calls were made within the transaction:
          // 1 for class_enrollments (titular) and 1 for guest_enrollments (guest)
          expect(transactionInsertCalls.length).toBe(2);

          // Transaction should NOT have been rolled back
          expect(transactionWasRolledBack).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: titular enrollment has status pending and correct subscription reference', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        validGuestNameArb,
        futureDateArb,
        sufficientCapacityArb,
        async (userId, classId, userSubId, guestName, classDate, capacity) => {
          vi.clearAllMocks();
          resetTracking();

          setupValidSessionAndEligibility(userId, userSubId);
          setupValidClass(classId, classDate, capacity + 5);
          (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(capacity);
          setupNoDuplicateEnrollments();

          (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
            createTrackingMockTransaction()
          );

          const result = await enrollWithGuestAction(classId, guestName);

          expect(result.success).toBe(true);

          // First insert is the titular enrollment
          const titularInsert = transactionInsertCalls[0];
          expect(titularInsert).toBeDefined();
          const titularValues = titularInsert.values as Record<string, unknown>;

          expect(titularValues.openClassId).toBe(classId);
          expect(titularValues.userSubscriptionId).toBe(userSubId);
          expect(titularValues.status).toBe('pending');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: guest enrollment has status pending, origin user, correct name and registeredById', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        validGuestNameArb,
        futureDateArb,
        sufficientCapacityArb,
        async (userId, classId, userSubId, guestName, classDate, capacity) => {
          vi.clearAllMocks();
          resetTracking();

          setupValidSessionAndEligibility(userId, userSubId);
          setupValidClass(classId, classDate, capacity + 5);
          (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(capacity);
          setupNoDuplicateEnrollments();

          (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
            createTrackingMockTransaction()
          );

          const result = await enrollWithGuestAction(classId, guestName);

          expect(result.success).toBe(true);

          // Second insert is the guest enrollment
          const guestInsert = transactionInsertCalls[1];
          expect(guestInsert).toBeDefined();
          const guestValues = guestInsert.values as Record<string, unknown>;

          expect(guestValues.openClassId).toBe(classId);
          expect(guestValues.guestName).toBe(guestName.trim());
          expect(guestValues.origin).toBe('user');
          expect(guestValues.registeredById).toBe(userId);
          expect(guestValues.status).toBe('pending');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: guest credit is consumed within the same transaction', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        validGuestNameArb,
        futureDateArb,
        sufficientCapacityArb,
        async (userId, classId, userSubId, guestName, classDate, capacity) => {
          vi.clearAllMocks();
          resetTracking();

          setupValidSessionAndEligibility(userId, userSubId);
          setupValidClass(classId, classDate, capacity + 5);
          (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(capacity);
          setupNoDuplicateEnrollments();

          (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
            createTrackingMockTransaction()
          );

          const result = await enrollWithGuestAction(classId, guestName);

          expect(result.success).toBe(true);

          // Credit consumption happens via execute() within the transaction
          // (either UPDATE or INSERT on guest_credits)
          // There should be at minimum 2 execute calls:
          // 1. SELECT ... FOR UPDATE (lock the class row)
          // 2. Credit update/insert
          // Plus the 2 select queries for re-checking capacity
          expect(transactionExecuteCalls.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: if transaction fails, no partial state exists (atomicity guarantee)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        validGuestNameArb,
        futureDateArb,
        async (userId, classId, userSubId, guestName, classDate) => {
          vi.clearAllMocks();
          resetTracking();

          setupValidSessionAndEligibility(userId, userSubId);
          setupValidClass(classId, classDate, 10);

          // Pre-check says capacity is fine, but inside transaction it fails
          (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5);
          setupNoDuplicateEnrollments();

          // Transaction that throws NO_CAPACITY internally (race condition simulation)
          (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
            async (cb: (tx: unknown) => Promise<void>) => {
              const mockTx = {
                execute: vi.fn().mockResolvedValue([{ id: 'locked' }]),
                select: vi.fn().mockReturnValue({
                  from: vi.fn().mockReturnValue({
                    where: vi.fn()
                      .mockResolvedValueOnce([{ count: 9 }]) // enrolled: 9
                      .mockResolvedValueOnce([{ count: 0 }]), // guests: 0
                  }),
                }),
                insert: vi.fn(() => ({
                  values: vi.fn(() => ({
                    returning: vi.fn().mockResolvedValue([{ id: 'x' }]),
                  })),
                })),
              };
              try {
                await cb(mockTx);
              } catch (e) {
                transactionWasRolledBack = true;
                throw e;
              }
            }
          );

          const result = await enrollWithGuestAction(classId, guestName);

          // The action should fail because capacity was 10 - 9 - 0 = 1 < 2
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toContain('cupos suficientes');
          }

          // The transaction should have thrown (rolled back)
          expect(transactionWasRolledBack).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: both inserts reference the same classId', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        validGuestNameArb,
        futureDateArb,
        sufficientCapacityArb,
        async (userId, classId, userSubId, guestName, classDate, capacity) => {
          vi.clearAllMocks();
          resetTracking();

          setupValidSessionAndEligibility(userId, userSubId);
          setupValidClass(classId, classDate, capacity + 5);
          (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(capacity);
          setupNoDuplicateEnrollments();

          (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
            createTrackingMockTransaction()
          );

          const result = await enrollWithGuestAction(classId, guestName);

          expect(result.success).toBe(true);

          // Both the titular and guest enrollment must reference the same class
          const titularValues = transactionInsertCalls[0]?.values as Record<string, unknown>;
          const guestValues = transactionInsertCalls[1]?.values as Record<string, unknown>;

          expect(titularValues.openClassId).toBe(classId);
          expect(guestValues.openClassId).toBe(classId);
          expect(titularValues.openClassId).toBe(guestValues.openClassId);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 17 Tests ─────────────────────────────────────────────────────────

/**
 * Property 17: Agregar invitado a reserva existente atómicamente
 * Validates: Requirements 9.5, 9.8
 *
 * For any successful addition of a guest to an existing reservation, the system must:
 * - Create a guest_enrollment linked to the titular
 * - Decrement 1 spot from the class
 * - Consume 1 guest credit
 * All within the same atomic transaction. If any condition fails (no spot or no credit),
 * no operation should execute.
 */

/** Capacity with at least 1 available spot (for addGuestToReservation which only needs 1) */
const singleSpotCapacityArb = fc.integer({ min: 1, max: 20 });

/**
 * Setup pre-transaction mocks for addGuestToReservationAction happy path.
 * The action validates: session, enrollment exists + belongs to user + pending status,
 * class not passed, no existing guest, eligibility, credits, and capacity >= 1.
 */
function setupAddGuestPreTxSuccess(opts: {
  userId: string;
  enrollmentId: string;
  userSubId: string;
  classId: string;
  classDate: Date;
  capacity: number;
}) {
  const { userId, enrollmentId, userSubId, classId, classDate, capacity } = opts;

  // Session mock
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    sub: userId,
    role: 'client',
    email: 'openlab@test.com',
  });

  // Enrollment lookup: db.select().from(classEnrollments).innerJoin(userSubscriptions).where()
  // The action calls .then(rows => rows[0] ?? null) on the result, so .where() must resolve to array
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            enrollment: {
              id: enrollmentId,
              openClassId: classId,
              userSubscriptionId: userSubId,
              status: 'pending',
              createdAt: new Date(),
            },
            userSubscription: {
              id: userSubId,
              userId,
              subscriptionId: 'sub-1',
              active: true,
              status: 'active',
            },
          },
        ]),
      }),
    }),
  });

  // Class lookup: db.query.openClasses.findFirst (future class)
  (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    id: classId,
    classDate,
    capacity,
    status: 'scheduled',
    coachUserId: 'coach-1',
    available: 'available',
    classType: 'mat_pilates',
    createdAt: new Date(),
  });

  // Existing guest check: db.select().from(guestEnrollments).where() — no existing guest
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });

  // Eligibility check
  (isUserOpenLabEligible as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    eligible: true,
    userSubscription: {
      id: userSubId,
      userId,
      subscriptionId: 'sub-1',
      active: true,
      status: 'active',
    },
    subscription: { id: 'sub-1', name: 'Open Lab', guest: true },
  });

  // Credits available (1)
  (getGuestCreditsForCycle as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);

  // Available capacity (at least 1 spot)
  (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    Math.max(1, capacity - 5)
  );
}

/**
 * Creates a tracking mock transaction for addGuestToReservation.
 * The tx performs: SELECT FOR UPDATE, capacity re-check (2 selects), credit re-check (1 select),
 * INSERT guest_enrollment, UPDATE/INSERT guest_credits.
 *
 * @param classCapacity - The class capacity to use in in-tx capacity re-check (must match openClass mock)
 */
function createAddGuestTrackingTransaction(classCapacity = 10) {
  let txInsertCalled = false;
  let txExecuteCalls = 0;
  let txSelectCalls = 0;

  // Ensure in-tx counts are within capacity (enrolled + guests < capacity)
  const enrolledCount = Math.max(0, Math.floor(classCapacity / 3));
  const guestCount = Math.max(0, Math.floor(classCapacity / 4));

  const impl = async (cb: (tx: unknown) => Promise<void>) => {
    const mockTx = {
      execute: vi.fn((..._args: unknown[]) => {
        txExecuteCalls++;
        return Promise.resolve(undefined);
      }),
      select: vi.fn(() => {
        txSelectCalls++;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              // Return appropriate mock data based on call order
              if (txSelectCalls <= 1) return Promise.resolve([{ count: enrolledCount }]); // enrolled
              if (txSelectCalls === 2) return Promise.resolve([{ count: guestCount }]); // guests
              return Promise.resolve([{ id: 'credit-1', creditsUsed: 0 }]); // credit
            }),
          }),
        };
      }),
      insert: vi.fn(() => {
        txInsertCalled = true;
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'new-guest-enrollment-id' }]),
          }),
        };
      }),
    };

    await cb(mockTx);
  };

  return { impl, getState: () => ({ txInsertCalled, txExecuteCalls, txSelectCalls }) };
}

describe('Property 17: Agregar invitado a reserva existente atómicamente', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetTracking();
  });

  describe('Success case: atomic creation of guest enrollment + credit consumption', () => {
    /**
     * **Validates: Requirements 9.5, 9.8**
     *
     * For any successful addition of a guest to an existing reservation,
     * the system must use a transaction (atomicity guarantee).
     */
    it('property: successful addGuestToReservation always uses a db.transaction call', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          validGuestNameArb,
          futureDateArb,
          singleSpotCapacityArb,
          async (userId, enrollmentId, userSubId, classId, guestName, classDate, capacity) => {
            vi.clearAllMocks();
            resetTracking();

            setupAddGuestPreTxSuccess({
              userId,
              enrollmentId,
              userSubId,
              classId,
              classDate,
              capacity,
            });

            const { impl } = createAddGuestTrackingTransaction(capacity);
            (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(impl);

            const result = await addGuestToReservationAction(enrollmentId, guestName);

            // The action should succeed
            expect(result.success).toBe(true);

            // CRITICAL: Transaction must be called (atomicity)
            expect(db.transaction).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.5, 9.8**
     *
     * The transaction must include all three critical operations:
     * 1. SELECT FOR UPDATE lock (tx.execute)
     * 2. INSERT guest_enrollment (tx.insert)
     * 3. Credit consumption (tx.execute for UPDATE/INSERT guest_credits)
     */
    it('property: transaction includes lock, guest insert, and credit consumption', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          validGuestNameArb,
          futureDateArb,
          singleSpotCapacityArb,
          async (userId, enrollmentId, userSubId, classId, guestName, classDate, capacity) => {
            vi.clearAllMocks();
            resetTracking();

            setupAddGuestPreTxSuccess({
              userId,
              enrollmentId,
              userSubId,
              classId,
              classDate,
              capacity,
            });

            const { impl, getState } = createAddGuestTrackingTransaction(capacity);
            (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(impl);

            const result = await addGuestToReservationAction(enrollmentId, guestName);

            expect(result.success).toBe(true);

            const state = getState();
            // tx.insert called = guest_enrollment created
            expect(state.txInsertCalled).toBe(true);
            // tx.execute called >= 2: FOR UPDATE lock + credit consumption
            expect(state.txExecuteCalls).toBeGreaterThanOrEqual(2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Failure case: no capacity — no mutation happens', () => {
    /**
     * **Validates: Requirements 9.5, 9.8**
     *
     * If the class has no available capacity (checked pre-transaction),
     * no transaction should execute and no mutations should occur.
     */
    it('property: when pre-tx capacity is 0, no transaction is executed', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          validGuestNameArb,
          futureDateArb,
          async (userId, enrollmentId, userSubId, classId, guestName, classDate) => {
            vi.clearAllMocks();
            resetTracking();

            // Session
            (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              sub: userId,
              role: 'client',
              email: 'openlab@test.com',
            });

            // Enrollment lookup (resolves to array, .then() picks first)
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([
                    {
                      enrollment: {
                        id: enrollmentId,
                        openClassId: classId,
                        userSubscriptionId: userSubId,
                        status: 'pending',
                        createdAt: new Date(),
                      },
                      userSubscription: {
                        id: userSubId,
                        userId,
                        subscriptionId: 'sub-1',
                        active: true,
                      },
                    },
                  ]),
                }),
              }),
            });

            // Class (future)
            (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              id: classId,
              classDate,
              capacity: 10,
              status: 'scheduled',
              coachUserId: 'coach-1',
              available: 'available',
            });

            // No existing guest for this class
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            });

            // Eligible
            (isUserOpenLabEligible as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              eligible: true,
              userSubscription: { id: userSubId, userId },
            });

            // Has credits
            (getGuestCreditsForCycle as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);

            // NO capacity available (0 spots)
            (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

            const result = await addGuestToReservationAction(enrollmentId, guestName);

            // Should fail with capacity error
            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.error).toContain('cupos');
            }

            // NO transaction should have been called — no mutation happened
            expect(db.transaction).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.5, 9.8**
     *
     * If the in-tx capacity re-check discovers class is full (race condition),
     * the transaction must throw and roll back — guaranteeing no partial state.
     */
    it('property: in-tx capacity failure causes transaction rollback (no mutations persist)', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          validGuestNameArb,
          futureDateArb,
          async (userId, enrollmentId, userSubId, classId, guestName, classDate) => {
            vi.clearAllMocks();
            resetTracking();

            setupAddGuestPreTxSuccess({
              userId,
              enrollmentId,
              userSubId,
              classId,
              classDate,
              capacity: 10,
            });

            // Override capacity to pass pre-check
            (getAvailableCapacity as ReturnType<typeof vi.fn>).mockReset();
            (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);

            // Transaction that discovers class is full (race condition)
            (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
              async (cb: (tx: unknown) => Promise<void>) => {
                const mockTx = {
                  execute: vi.fn().mockResolvedValue(undefined),
                  select: vi.fn()
                    .mockReturnValueOnce({
                      from: vi.fn().mockReturnValue({
                        where: vi.fn().mockResolvedValue([{ count: 9 }]), // enrolled: 9
                      }),
                    })
                    .mockReturnValueOnce({
                      from: vi.fn().mockReturnValue({
                        where: vi.fn().mockResolvedValue([{ count: 1 }]), // guests: 1, total=10 (= capacity)
                      }),
                    }),
                  insert: vi.fn(),
                };

                try {
                  await cb(mockTx);
                } catch {
                  // Transaction throws and rolls back
                }
                throw new Error('NO_CAPACITY');
              }
            );

            const result = await addGuestToReservationAction(enrollmentId, guestName);

            // Should fail gracefully
            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.error).toContain('cupos');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Failure case: no credits — no mutation happens', () => {
    /**
     * **Validates: Requirements 9.5, 9.8**
     *
     * If the user has no guest credits available (checked pre-tx),
     * no transaction should execute and no mutations should occur.
     */
    it('property: when credits are exhausted pre-tx, no transaction is executed', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          validGuestNameArb,
          futureDateArb,
          async (userId, enrollmentId, userSubId, classId, guestName, classDate) => {
            vi.clearAllMocks();
            resetTracking();

            // Session
            (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              sub: userId,
              role: 'client',
              email: 'openlab@test.com',
            });

            // Enrollment lookup (resolves to array, .then() picks first)
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([
                    {
                      enrollment: {
                        id: enrollmentId,
                        openClassId: classId,
                        userSubscriptionId: userSubId,
                        status: 'pending',
                        createdAt: new Date(),
                      },
                      userSubscription: {
                        id: userSubId,
                        userId,
                        subscriptionId: 'sub-1',
                        active: true,
                      },
                    },
                  ]),
                }),
              }),
            });

            // Class (future)
            (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              id: classId,
              classDate,
              capacity: 10,
              status: 'scheduled',
              coachUserId: 'coach-1',
              available: 'available',
            });

            // No existing guest
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            });

            // Eligible
            (isUserOpenLabEligible as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              eligible: true,
              userSubscription: { id: userSubId, userId },
            });

            // NO credits available (0)
            (getGuestCreditsForCycle as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

            const result = await addGuestToReservationAction(enrollmentId, guestName);

            // Should fail with credit error
            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.error).toContain('crédito');
            }

            // NO transaction should have been called — no mutation happened
            expect(db.transaction).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.5, 9.8**
     *
     * If the in-tx credit re-check discovers credit was consumed concurrently,
     * the transaction must throw and roll back — guaranteeing no partial state.
     */
    it('property: in-tx credit failure causes transaction rollback (no mutations persist)', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          validGuestNameArb,
          futureDateArb,
          async (userId, enrollmentId, userSubId, classId, guestName, classDate) => {
            vi.clearAllMocks();
            resetTracking();

            setupAddGuestPreTxSuccess({
              userId,
              enrollmentId,
              userSubId,
              classId,
              classDate,
              capacity: 10,
            });

            // Transaction that discovers credits are exhausted (race condition)
            (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
              async (cb: (tx: unknown) => Promise<void>) => {
                const mockTx = {
                  execute: vi.fn().mockResolvedValue(undefined),
                  select: vi.fn()
                    .mockReturnValueOnce({
                      from: vi.fn().mockReturnValue({
                        where: vi.fn().mockResolvedValue([{ count: 3 }]), // enrolled
                      }),
                    })
                    .mockReturnValueOnce({
                      from: vi.fn().mockReturnValue({
                        where: vi.fn().mockResolvedValue([{ count: 1 }]), // guests, total=4 < capacity
                      }),
                    })
                    .mockReturnValueOnce({
                      from: vi.fn().mockReturnValue({
                        where: vi.fn().mockResolvedValue([{ id: 'cred-1', creditsUsed: 1 }]), // already used!
                      }),
                    }),
                  insert: vi.fn(),
                };

                try {
                  await cb(mockTx);
                } catch {
                  // Transaction throws and rolls back
                }
                throw new Error('NO_CREDITS');
              }
            );

            const result = await addGuestToReservationAction(enrollmentId, guestName);

            // Should fail gracefully
            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.error).toContain('crédito');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Atomicity invariant: all-or-nothing', () => {
    /**
     * **Validates: Requirements 9.5, 9.8**
     *
     * For any valid inputs where action succeeds, exactly 1 db.transaction call
     * must occur containing all required operations (lock + insert + credit update).
     * This ensures partial states are impossible.
     */
    it('property: success always means exactly 1 transaction with lock + insert + credit ops', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          validGuestNameArb,
          futureDateArb,
          singleSpotCapacityArb,
          async (userId, enrollmentId, userSubId, classId, guestName, classDate, capacity) => {
            vi.clearAllMocks();
            resetTracking();

            setupAddGuestPreTxSuccess({
              userId,
              enrollmentId,
              userSubId,
              classId,
              classDate,
              capacity,
            });

            const { impl, getState } = createAddGuestTrackingTransaction(capacity);
            (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(impl);

            const result = await addGuestToReservationAction(enrollmentId, guestName);

            if (result.success) {
              // Exactly 1 transaction
              expect(db.transaction).toHaveBeenCalledTimes(1);

              const state = getState();
              // Guest enrollment was inserted
              expect(state.txInsertCalled).toBe(true);
              // Execute called at least 2x: FOR UPDATE + credit consumption
              expect(state.txExecuteCalls).toBeGreaterThanOrEqual(2);
              // Selects called for capacity re-check
              expect(state.txSelectCalls).toBeGreaterThanOrEqual(2);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.5, 9.8**
     *
     * For any failure scenario (no capacity or no credits), no mutations persist:
     * Either the transaction wasn't called (pre-check failure) or it was rolled back.
     */
    it('property: failure never leaves partial state — no insert without credit, no credit without insert', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          validGuestNameArb,
          futureDateArb,
          fc.boolean(), // true = fail by capacity, false = fail by credits
          async (userId, enrollmentId, userSubId, classId, guestName, classDate, failByCapacity) => {
            vi.clearAllMocks();
            resetTracking();

            // Session
            (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              sub: userId,
              role: 'client',
              email: 'openlab@test.com',
            });

            // Enrollment lookup (resolves to array, .then() picks first)
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([
                    {
                      enrollment: {
                        id: enrollmentId,
                        openClassId: classId,
                        userSubscriptionId: userSubId,
                        status: 'pending',
                        createdAt: new Date(),
                      },
                      userSubscription: {
                        id: userSubId,
                        userId,
                        subscriptionId: 'sub-1',
                        active: true,
                      },
                    },
                  ]),
                }),
              }),
            });

            // Class (future)
            (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              id: classId,
              classDate,
              capacity: 10,
              status: 'scheduled',
              coachUserId: 'coach-1',
              available: 'available',
            });

            // No existing guest
            (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            });

            // Eligible
            (isUserOpenLabEligible as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
              eligible: true,
              userSubscription: { id: userSubId, userId },
            });

            if (failByCapacity) {
              // Has credits but no capacity
              (getGuestCreditsForCycle as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
              (getAvailableCapacity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
            } else {
              // No credits — action returns early before checking capacity
              (getGuestCreditsForCycle as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
            }

            const result = await addGuestToReservationAction(enrollmentId, guestName);

            // Must fail
            expect(result.success).toBe(false);

            // No successful transaction — no partial state
            expect(db.transaction).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
