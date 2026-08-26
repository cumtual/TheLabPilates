// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Preservation Property Tests
 *
 * Property 2: Preservation - Suscripciones con créditos o clases pendientes no se alteran
 *
 * These tests verify that non-bug-condition subscriptions remain UNMODIFIED
 * after calling checkAndExpireSubscriptions.
 *
 * After the fix is implemented, these tests run against the REAL function
 * and must still pass — proving the fix doesn't introduce regressions.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

// --- Track calls for assertions ---
let updateCalls: Array<{ table: unknown; setArgs: Record<string, unknown>; whereArgs: unknown }> = [];

// We track selectFrom calls by index to return different results for each invocation
let selectFromCallIndex = 0;
let selectFromResults: Array<unknown[]> = [];

// We track findFirst calls per entity
let findFirstResults: {
  userSubscriptions: Array<unknown>;
  payments: Array<unknown>;
  openClasses: Array<unknown>;
} = {
  userSubscriptions: [],
  payments: [],
  openClasses: [],
};
let findFirstCallIndex = {
  userSubscriptions: 0,
  payments: 0,
  openClasses: 0,
};

function createMockTx() {
  return {
    select: (_fields?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_condition: unknown) => {
          const result = selectFromResults[selectFromCallIndex] ?? [];
          selectFromCallIndex++;
          return Promise.resolve(result);
        },
      }),
    }),
    query: {
      userSubscriptions: {
        findFirst: (_opts: unknown) => {
          const result = findFirstResults.userSubscriptions[findFirstCallIndex.userSubscriptions];
          findFirstCallIndex.userSubscriptions++;
          return Promise.resolve(result);
        },
      },
      payments: {
        findFirst: (_opts: unknown) => {
          const result = findFirstResults.payments[findFirstCallIndex.payments];
          findFirstCallIndex.payments++;
          return Promise.resolve(result);
        },
      },
      openClasses: {
        findFirst: (_opts: unknown) => {
          const result = findFirstResults.openClasses[findFirstCallIndex.openClasses];
          findFirstCallIndex.openClasses++;
          return Promise.resolve(result);
        },
      },
    },
    update: (_table: unknown) => ({
      set: (setArgs: Record<string, unknown>) => ({
        where: (whereArgs: unknown) => {
          updateCalls.push({ table: _table, setArgs, whereArgs });
          return Promise.resolve([]);
        },
      }),
    }),
  };
}

vi.mock('@/db', () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = createMockTx();
      return fn(tx);
    }),
  },
}));

// Mock schema imports (the real code imports these for query building)
vi.mock('@/db/schema', () => ({
  classEnrollments: { userSubscriptionId: 'userSubscriptionId', id: 'id', openClassId: 'openClassId', status: 'status' },
  openClasses: { id: 'id', status: 'status' },
  userSubscriptions: { id: 'id', active: 'active', status: 'status', daysRemaining: 'daysRemaining', paymentId: 'paymentId' },
  payments: { id: 'id', confirmed: 'confirmed' },
}));

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: (field: unknown, value: unknown) => ({ type: 'eq', field, value }),
  and: (...conditions: unknown[]) => ({ type: 'and', conditions }),
  notInArray: (field: unknown, values: unknown[]) => ({ type: 'notInArray', field, values }),
}));

// Import the function under test
import { checkAndExpireSubscriptions } from '../check-subscription-expiration';

// --- Arbitraries (generators) for property-based testing ---

/** Generate a valid UUID v4 */
const uuidArb = fc.uuid();

/** Generate a positive integer for daysRemaining > 0 */
const positiveDaysRemainingArb = fc.integer({ min: 1, max: 30 });

/** Enrollment statuses that are considered "active" (not cancelled/late_cancelled) */
const activeEnrollmentStatusArb = fc.constantFrom('pending', 'attended', 'absent');

/** Class statuses */
const classStatusArb = fc.constantFrom('scheduled', 'cancelled', 'completed');

/**
 * Generate a subscription scenario with daysRemaining > 0 (preservation condition 1).
 * These subscriptions have available credits and should NEVER be expired.
 */
const subscriptionWithCreditsArb = fc.record({
  subscriptionId: uuidArb,
  userId: uuidArb,
  paymentId: uuidArb,
  subscriptionPlanId: uuidArb,
  classId: uuidArb,
  daysRemaining: positiveDaysRemainingArb,
  enrollments: fc.array(
    fc.record({
      enrollmentId: uuidArb,
      openClassId: uuidArb,
      status: activeEnrollmentStatusArb,
    }),
    { minLength: 1, maxLength: 5 }
  ),
});

/**
 * Generate a subscription scenario with daysRemaining = 0 but at least one
 * active enrollment in a class with status 'scheduled' (preservation condition 2).
 * These subscriptions have pending classes and should NOT be expired.
 */
const subscriptionWithPendingClassArb = fc.record({
  subscriptionId: uuidArb,
  userId: uuidArb,
  paymentId: uuidArb,
  subscriptionPlanId: uuidArb,
  classId: uuidArb,
  // At least one enrollment must be in a scheduled class
  scheduledEnrollments: fc.array(
    fc.record({
      enrollmentId: uuidArb,
      openClassId: uuidArb,
      status: activeEnrollmentStatusArb,
    }),
    { minLength: 1, maxLength: 3 }
  ),
  // May also have completed class enrollments
  completedEnrollments: fc.array(
    fc.record({
      enrollmentId: uuidArb,
      openClassId: uuidArb,
      status: activeEnrollmentStatusArb,
    }),
    { minLength: 0, maxLength: 3 }
  ),
});

/**
 * Generate a subscription that is already inactive/suspended (preservation condition 3).
 * These subscriptions were manually suspended by an admin and should NOT be
 * reclassified as 'expired'.
 */
const suspendedSubscriptionArb = fc.record({
  subscriptionId: uuidArb,
  userId: uuidArb,
  paymentId: uuidArb,
  subscriptionPlanId: uuidArb,
  classId: uuidArb,
  daysRemaining: fc.integer({ min: 0, max: 20 }),
  enrollments: fc.array(
    fc.record({
      enrollmentId: uuidArb,
      openClassId: uuidArb,
      status: activeEnrollmentStatusArb,
    }),
    { minLength: 1, maxLength: 5 }
  ),
});

// --- Mock setup helpers ---

function resetMockState() {
  selectFromCallIndex = 0;
  selectFromResults = [];
  findFirstResults = { userSubscriptions: [], payments: [], openClasses: [] };
  findFirstCallIndex = { userSubscriptions: 0, payments: 0, openClasses: 0 };
  updateCalls = [];
}

/**
 * Setup mocks for preservation scenario 1: daysRemaining > 0
 * The function should return early after seeing daysRemaining > 0, so no update occurs.
 */
function setupMocksForCreditsRemaining(scenario: {
  subscriptionId: string;
  userId: string;
  paymentId: string;
  subscriptionPlanId: string;
  classId: string;
  daysRemaining: number;
  enrollments: Array<{ enrollmentId: string; openClassId: string; status: string }>;
}) {
  resetMockState();

  // Step 1: enrollments for the completed class → returns enrollments referencing this subscription
  selectFromResults = [
    scenario.enrollments.map(() => ({
      userSubscriptionId: scenario.subscriptionId,
    })),
  ];

  // Step 2: findFirst for userSubscription → daysRemaining > 0 → function skips
  findFirstResults.userSubscriptions = [
    {
      id: scenario.subscriptionId,
      userId: scenario.userId,
      paymentId: scenario.paymentId,
      subscriptionId: scenario.subscriptionPlanId,
      active: true,
      daysRemaining: scenario.daysRemaining, // > 0
      status: 'active',
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  ];

  // No further calls should happen (function returns early)
  findFirstResults.payments = [];
  findFirstResults.openClasses = [];
}

/**
 * Setup mocks for preservation scenario 2: daysRemaining = 0 but has scheduled class
 * The function should see a non-completed class and NOT expire.
 */
function setupMocksForPendingClass(scenario: {
  subscriptionId: string;
  userId: string;
  paymentId: string;
  subscriptionPlanId: string;
  classId: string;
  scheduledEnrollments: Array<{ enrollmentId: string; openClassId: string; status: string }>;
  completedEnrollments: Array<{ enrollmentId: string; openClassId: string; status: string }>;
}) {
  resetMockState();

  const allEnrollments = [...scenario.completedEnrollments, ...scenario.scheduledEnrollments];

  // Step 1: enrollments for the trigger class
  selectFromResults = [
    // First select: enrollments for the trigger class (references this subscription)
    [{ userSubscriptionId: scenario.subscriptionId }],
    // Second select (Step 4): ALL active enrollments for this subscription
    allEnrollments.map((e) => ({
      enrollmentId: e.enrollmentId,
      openClassId: e.openClassId,
    })),
  ];

  // Step 2: findFirst for userSubscription → active=true, daysRemaining=0
  findFirstResults.userSubscriptions = [
    {
      id: scenario.subscriptionId,
      userId: scenario.userId,
      paymentId: scenario.paymentId,
      subscriptionId: scenario.subscriptionPlanId,
      active: true,
      daysRemaining: 0,
      status: 'active',
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  ];

  // Step 3: payment is confirmed
  findFirstResults.payments = [
    {
      id: scenario.paymentId,
      confirmed: true,
      paymentType: 'transfer',
    },
  ];

  // Step 5: openClasses findFirst for each enrollment
  // Completed enrollments return 'completed', scheduled enrollments return 'scheduled'
  findFirstResults.openClasses = [
    ...scenario.completedEnrollments.map((e) => ({
      id: e.openClassId,
      status: 'completed',
    })),
    ...scenario.scheduledEnrollments.map((e) => ({
      id: e.openClassId,
      status: 'scheduled', // NOT completed → should prevent expiration
    })),
  ];
}

/**
 * Setup mocks for preservation scenario 3: already suspended (active = false)
 * The function should skip because active = false.
 */
function setupMocksForSuspended(scenario: {
  subscriptionId: string;
  userId: string;
  paymentId: string;
  subscriptionPlanId: string;
  classId: string;
  daysRemaining: number;
  enrollments: Array<{ enrollmentId: string; openClassId: string; status: string }>;
}) {
  resetMockState();

  // Step 1: enrollments for the completed class
  selectFromResults = [
    scenario.enrollments.map(() => ({
      userSubscriptionId: scenario.subscriptionId,
    })),
  ];

  // Step 2: findFirst for userSubscription → active = false → function skips
  findFirstResults.userSubscriptions = [
    {
      id: scenario.subscriptionId,
      userId: scenario.userId,
      paymentId: scenario.paymentId,
      subscriptionId: scenario.subscriptionPlanId,
      active: false, // suspended by admin
      daysRemaining: scenario.daysRemaining,
      status: 'suspended',
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  ];

  // No further calls should happen (function returns early due to active = false)
  findFirstResults.payments = [];
  findFirstResults.openClasses = [];
}

describe('Property 2: Preservation - Suscripciones con créditos o clases pendientes no se alteran', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  describe('Subscriptions with available credits (daysRemaining > 0) remain unmodified', () => {
    it('checkAndExpireSubscriptions does NOT modify subscriptions with daysRemaining > 0', async () => {
      /**
       * Property: For any subscription where daysRemaining > 0,
       * calling checkAndExpireSubscriptions SHALL NOT set active = false
       * or status = 'expired' on that subscription.
       *
       * Validates: Requirements 3.1
       */
      await fc.assert(
        fc.asyncProperty(subscriptionWithCreditsArb, async (scenario) => {
          setupMocksForCreditsRemaining(scenario);

          await checkAndExpireSubscriptions(scenario.classId);

          // Assert: no expiration update should have occurred
          expect(updateCalls.length).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    it('concrete example: subscription with 5 remaining credits is not expired', async () => {
      /**
       * Concrete example: A subscription with daysRemaining = 5, enrollment
       * in a completed class. Despite the class being completed, the subscription
       * has remaining credits and must NOT be expired.
       *
       * Validates: Requirements 3.1
       */
      setupMocksForCreditsRemaining({
        subscriptionId: 'aa0e8400-e29b-41d4-a716-446655440001',
        userId: 'aa0e8400-e29b-41d4-a716-446655440004',
        paymentId: 'aa0e8400-e29b-41d4-a716-446655440003',
        subscriptionPlanId: 'aa0e8400-e29b-41d4-a716-446655440005',
        classId: 'aa0e8400-e29b-41d4-a716-446655440000',
        daysRemaining: 5,
        enrollments: [
          { enrollmentId: 'enr-pres-001', openClassId: 'aa0e8400-e29b-41d4-a716-446655440000', status: 'attended' },
        ],
      });

      await checkAndExpireSubscriptions('aa0e8400-e29b-41d4-a716-446655440000');

      // No expiration update should be triggered
      expect(updateCalls.length).toBe(0);
    });
  });

  describe('Subscriptions with pending scheduled classes remain unmodified', () => {
    it('checkAndExpireSubscriptions does NOT modify subscriptions with active enrollments in scheduled classes', async () => {
      /**
       * Property: For any subscription where daysRemaining = 0 but at least one
       * active enrollment (not cancelled/late_cancelled) is in a class with
       * status = 'scheduled', calling checkAndExpireSubscriptions SHALL NOT
       * set active = false or status = 'expired'.
       *
       * Validates: Requirements 3.5
       */
      await fc.assert(
        fc.asyncProperty(subscriptionWithPendingClassArb, async (scenario) => {
          setupMocksForPendingClass(scenario);

          await checkAndExpireSubscriptions(scenario.classId);

          // Assert: no expiration update should have occurred
          const expireCall = updateCalls.find(
            (call) => call.setArgs.active === false && call.setArgs.status === 'expired'
          );
          expect(expireCall).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it('concrete example: subscription with 0 credits but class still scheduled is not expired', async () => {
      /**
       * Concrete example: Subscription with daysRemaining = 0 and 2 enrollments:
       * one in a completed class and one in a scheduled class.
       * Since there's still a pending class, this subscription must NOT be expired.
       *
       * Validates: Requirements 3.5
       */
      setupMocksForPendingClass({
        subscriptionId: 'bb0e8400-e29b-41d4-a716-446655440001',
        userId: 'bb0e8400-e29b-41d4-a716-446655440004',
        paymentId: 'bb0e8400-e29b-41d4-a716-446655440003',
        subscriptionPlanId: 'bb0e8400-e29b-41d4-a716-446655440005',
        classId: 'bb0e8400-e29b-41d4-a716-446655440000',
        completedEnrollments: [
          { enrollmentId: 'enr-pres-010', openClassId: 'bb0e8400-e29b-41d4-a716-446655440000', status: 'attended' },
        ],
        scheduledEnrollments: [
          { enrollmentId: 'enr-pres-011', openClassId: 'bb0e8400-e29b-41d4-a716-446655440010', status: 'pending' },
        ],
      });

      await checkAndExpireSubscriptions('bb0e8400-e29b-41d4-a716-446655440000');

      // No expiration update should be triggered
      const expireCall = updateCalls.find(
        (call) => call.setArgs.active === false && call.setArgs.status === 'expired'
      );
      expect(expireCall).toBeUndefined();
    });
  });

  describe('Already suspended subscriptions remain unmodified', () => {
    it('checkAndExpireSubscriptions does NOT modify subscriptions that are already inactive (suspended)', async () => {
      /**
       * Property: For any subscription where active = false (manually suspended
       * by admin), calling checkAndExpireSubscriptions SHALL NOT modify the
       * subscription's active or status fields. Suspended subscriptions must
       * remain as "Suspendida", not be reclassified as "Vencida".
       *
       * Validates: Requirements 3.2
       */
      await fc.assert(
        fc.asyncProperty(suspendedSubscriptionArb, async (scenario) => {
          setupMocksForSuspended(scenario);

          await checkAndExpireSubscriptions(scenario.classId);

          // Assert: no updates should occur at all for suspended subscriptions
          expect(updateCalls.length).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    it('concrete example: manually suspended subscription is not reclassified as expired', async () => {
      /**
       * Concrete example: A subscription that an admin manually suspended
       * (active = false). Even though it has daysRemaining = 0 and its
       * enrollment is in a completed class, it should NOT be reclassified
       * as 'expired' — it must remain 'suspended'.
       *
       * Validates: Requirements 3.2
       */
      setupMocksForSuspended({
        subscriptionId: 'cc0e8400-e29b-41d4-a716-446655440001',
        userId: 'cc0e8400-e29b-41d4-a716-446655440004',
        paymentId: 'cc0e8400-e29b-41d4-a716-446655440003',
        subscriptionPlanId: 'cc0e8400-e29b-41d4-a716-446655440005',
        classId: 'cc0e8400-e29b-41d4-a716-446655440000',
        daysRemaining: 0,
        enrollments: [
          { enrollmentId: 'enr-pres-020', openClassId: 'cc0e8400-e29b-41d4-a716-446655440000', status: 'attended' },
        ],
      });

      await checkAndExpireSubscriptions('cc0e8400-e29b-41d4-a716-446655440000');

      // No modification should occur — subscription is already suspended
      expect(updateCalls.length).toBe(0);
    });
  });
});
