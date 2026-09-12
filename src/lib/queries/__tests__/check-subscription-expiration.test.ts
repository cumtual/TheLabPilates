// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Bug Condition Exploration Test
 *
 * Property 1: Bug Condition - Suscripciones agotadas permanecen activas
 *
 * This test encodes the EXPECTED behavior: when a subscription has
 * daysRemaining = 0 AND all its active enrollments (non-cancelled/late_cancelled)
 * are linked to classes with status 'completed' AND payment is confirmed AND
 * active = true, then checkAndExpireSubscriptions SHOULD set active = false
 * and status = 'expired'.
 *
 * Validates: Requirements 1.1, 1.3, 2.1, 2.4
 */

// --- Track calls for assertions ---
let updateCalls: Array<{ table: unknown; setArgs: Record<string, unknown>; whereArgs: unknown }> = [];

// --- Mock setup for Drizzle database matching real implementation ---
// The real implementation uses:
//   tx.select({...}).from(table).where(condition)  → returns array
//   tx.query.userSubscriptions.findFirst({ where }) → returns object | undefined
//   tx.query.payments.findFirst({ where })          → returns object | undefined
//   tx.query.openClasses.findFirst({ where })       → returns object | undefined
//   tx.update(table).set({...}).where(condition)    → performs update

// We track selectFrom calls by index to return different results for each invocation
let selectFromCallIndex = 0;
let selectFromResults: Array<unknown[]> = [];

// We track findFirst calls per entity
let findFirstResults: {
  userSubscriptions: Array<unknown>;
  payments: Array<unknown>;
  openClasses: Array<unknown>;
  subscriptions: Array<unknown>;
} = {
  userSubscriptions: [],
  payments: [],
  openClasses: [],
  subscriptions: [],
};
let findFirstCallIndex = {
  userSubscriptions: 0,
  payments: 0,
  openClasses: 0,
  subscriptions: 0,
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
      subscriptions: {
        findFirst: (_opts: unknown) => {
          const result = findFirstResults.subscriptions[findFirstCallIndex.subscriptions];
          findFirstCallIndex.subscriptions++;
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
  subscriptions: { id: 'id', guest: 'guest' },
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

/** Enrollment statuses that are considered "active" (not cancelled/late_cancelled) */
const activeEnrollmentStatusArb = fc.constantFrom('pending', 'attended', 'absent');

/**
 * Generate a subscription scenario satisfying the bug condition (isBugCondition):
 * - subscription.active = true
 * - subscription.daysRemaining = 0
 * - All active enrollments linked to classes with status = 'completed'
 * - Payment confirmed
 */
const bugConditionScenarioArb = fc.record({
  subscriptionId: uuidArb,
  userId: uuidArb,
  paymentId: uuidArb,
  subscriptionPlanId: uuidArb,
  classId: uuidArb, // the class that just completed (trigger)
  // Generate 1-5 active enrollments, all in completed classes
  enrollments: fc.array(
    fc.record({
      enrollmentId: uuidArb,
      openClassId: uuidArb,
      status: activeEnrollmentStatusArb,
    }),
    { minLength: 1, maxLength: 5 }
  ),
});

function setupMocksForBugCondition(scenario: {
  subscriptionId: string;
  userId: string;
  paymentId: string;
  subscriptionPlanId: string;
  classId: string;
  enrollments: Array<{ enrollmentId: string; openClassId: string; status: string }>;
}) {
  // Reset state
  selectFromCallIndex = 0;
  findFirstCallIndex = { userSubscriptions: 0, payments: 0, openClasses: 0, subscriptions: 0 };
  updateCalls = [];

  // Step 1 result: tx.select({userSubscriptionId}).from(classEnrollments).where(...)
  // Returns enrollments for the completed class with their subscription IDs
  selectFromResults = [
    // First select: enrollments for the trigger class
    scenario.enrollments.map((e) => ({
      userSubscriptionId: scenario.subscriptionId,
    })),
    // Fourth select (Step 4): ALL active enrollments for this subscription
    scenario.enrollments.map((e) => ({
      enrollmentId: e.enrollmentId,
      openClassId: e.openClassId,
    })),
  ];

  // Step 2: tx.query.userSubscriptions.findFirst → subscription object
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

  // Step 3: tx.query.payments.findFirst → payment object (confirmed)
  findFirstResults.payments = [
    {
      id: scenario.paymentId,
      confirmed: true,
      paymentType: 'transfer',
    },
  ];

  // Step 5: tx.query.openClasses.findFirst → class object (completed)
  // One call per enrollment
  findFirstResults.openClasses = scenario.enrollments.map((e) => ({
    id: e.openClassId,
    status: 'completed',
  }));
}

describe('Property 1: Bug Condition - Suscripciones agotadas se marcan como vencidas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectFromCallIndex = 0;
    selectFromResults = [];
    findFirstResults = { userSubscriptions: [], payments: [], openClasses: [], subscriptions: [] };
    findFirstCallIndex = { userSubscriptions: 0, payments: 0, openClasses: 0, subscriptions: 0 };
    updateCalls = [];
  });

  it('subscriptions with exhausted credits and all completed classes should be marked as expired', async () => {
    /**
     * Property: For any subscription where:
     *   - daysRemaining = 0
     *   - all active enrollments (non-cancelled/late_cancelled) are in completed classes
     *   - payment is confirmed
     *   - subscription is currently active
     *
     * THEN checkAndExpireSubscriptions(classId) SHALL:
     *   - Set subscription.active = false
     *   - Set subscription.status = 'expired'
     *
     * Validates: Requirements 1.1, 1.3, 2.1, 2.4
     */
    await fc.assert(
      fc.asyncProperty(bugConditionScenarioArb, async (scenario) => {
        setupMocksForBugCondition(scenario);

        // Execute the function
        await checkAndExpireSubscriptions(scenario.classId);

        // Assert: the subscription update was called with active=false and status='expired'
        expect(updateCalls.length).toBeGreaterThanOrEqual(1);
        const expireCall = updateCalls.find(
          (call) => call.setArgs.active === false && call.setArgs.status === 'expired'
        );
        expect(expireCall).toBeDefined();
        expect(expireCall!.setArgs).toEqual(
          expect.objectContaining({
            active: false,
            status: 'expired',
          })
        );
      }),
      { numRuns: 100 }
    );
  });

  it('single subscription with exactly 0 remaining credits and single completed class should expire', async () => {
    /**
     * Concrete example demonstrating the expected behavior:
     * A subscription with 8 sessions, all used (daysRemaining=0),
     * 1 enrollment in a completed class, payment confirmed.
     *
     * Validates: Requirements 1.1, 1.3, 2.1, 2.4
     */
    const scenario = {
      classId: '550e8400-e29b-41d4-a716-446655440000',
      subscriptionId: '550e8400-e29b-41d4-a716-446655440001',
      userId: '550e8400-e29b-41d4-a716-446655440004',
      paymentId: '550e8400-e29b-41d4-a716-446655440003',
      subscriptionPlanId: '550e8400-e29b-41d4-a716-446655440005',
      enrollments: [
        { enrollmentId: '550e8400-e29b-41d4-a716-446655440002', openClassId: '550e8400-e29b-41d4-a716-446655440000', status: 'attended' },
      ],
    };

    setupMocksForBugCondition(scenario);
    await checkAndExpireSubscriptions(scenario.classId);

    // Expected behavior: subscription should be marked as expired
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    const expireCall = updateCalls.find(
      (call) => call.setArgs.active === false && call.setArgs.status === 'expired'
    );
    expect(expireCall).toBeDefined();
  });

  it('subscription with multiple enrollments all in completed classes should expire', async () => {
    /**
     * Scenario: subscription with daysRemaining=0 and 3 enrollments,
     * all in completed classes → should be expired.
     */
    const scenario = {
      classId: '660e8400-e29b-41d4-a716-446655440000',
      subscriptionId: '660e8400-e29b-41d4-a716-446655440001',
      userId: '660e8400-e29b-41d4-a716-446655440004',
      paymentId: '660e8400-e29b-41d4-a716-446655440003',
      subscriptionPlanId: '660e8400-e29b-41d4-a716-446655440005',
      enrollments: [
        { enrollmentId: 'enr-001', openClassId: '660e8400-e29b-41d4-a716-446655440000', status: 'attended' },
        { enrollmentId: 'enr-002', openClassId: '660e8400-e29b-41d4-a716-446655440010', status: 'pending' },
        { enrollmentId: 'enr-003', openClassId: '660e8400-e29b-41d4-a716-446655440011', status: 'absent' },
      ],
    };

    setupMocksForBugCondition(scenario);
    await checkAndExpireSubscriptions(scenario.classId);

    // Expected: subscription with all completed enrollments and 0 credits → expired
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    const expireCall = updateCalls.find(
      (call) => call.setArgs.active === false && call.setArgs.status === 'expired'
    );
    expect(expireCall).toBeDefined();
  });
});

/**
 * Open Lab / time-based expiration rules.
 *
 * - Open Lab (guest = true) is time-bound only: never expired by exhausted credits.
 * - Any plan expires when its expiration_date has passed (month ended).
 * - Admin-suspended subscriptions (active = false) remain untouched.
 */
describe('Open Lab and time-based expiration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectFromCallIndex = 0;
    selectFromResults = [];
    findFirstResults = { userSubscriptions: [], payments: [], openClasses: [], subscriptions: [] };
    findFirstCallIndex = { userSubscriptions: 0, payments: 0, openClasses: 0, subscriptions: 0 };
    updateCalls = [];
  });

  it('Open Lab with daysRemaining=0 within its month is NOT expired', async () => {
    selectFromResults = [[{ userSubscriptionId: 'sub-ol' }]];
    findFirstResults.userSubscriptions = [
      {
        id: 'sub-ol',
        userId: 'user-ol',
        paymentId: 'pay-ol',
        subscriptionId: 'plan-ol',
        active: true,
        daysRemaining: 0,
        status: 'active',
        expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    ];
    findFirstResults.subscriptions = [{ id: 'plan-ol', guest: true }];
    findFirstResults.payments = [{ id: 'pay-ol', confirmed: true }];
    findFirstResults.openClasses = [{ id: 'class-ol', status: 'completed' }];

    await checkAndExpireSubscriptions('class-ol');

    expect(updateCalls.length).toBe(0);
  });

  it('Open Lab whose month ended IS expired', async () => {
    selectFromResults = [[{ userSubscriptionId: 'sub-ol-2' }]];
    findFirstResults.userSubscriptions = [
      {
        id: 'sub-ol-2',
        userId: 'user-ol',
        paymentId: 'pay-ol-2',
        subscriptionId: 'plan-ol',
        active: true,
        daysRemaining: 12,
        status: 'active',
        expirationDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    ];
    findFirstResults.subscriptions = [{ id: 'plan-ol', guest: true }];

    await checkAndExpireSubscriptions('class-ol-2');

    const expireCall = updateCalls.find(
      (call) => call.setArgs.active === false && call.setArgs.status === 'expired'
    );
    expect(expireCall).toBeDefined();
  });

  it('credit package with remaining credits but expired month IS expired', async () => {
    selectFromResults = [[{ userSubscriptionId: 'sub-cr' }]];
    findFirstResults.userSubscriptions = [
      {
        id: 'sub-cr',
        userId: 'user-cr',
        paymentId: 'pay-cr',
        subscriptionId: 'plan-cr',
        active: true,
        daysRemaining: 5,
        status: 'active',
        expirationDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    ];
    findFirstResults.subscriptions = [{ id: 'plan-cr', guest: false }];

    await checkAndExpireSubscriptions('class-cr');

    const expireCall = updateCalls.find(
      (call) => call.setArgs.active === false && call.setArgs.status === 'expired'
    );
    expect(expireCall).toBeDefined();
  });

  it('admin-suspended subscription is NOT reclassified as expired even if the month ended', async () => {
    selectFromResults = [[{ userSubscriptionId: 'sub-susp' }]];
    findFirstResults.userSubscriptions = [
      {
        id: 'sub-susp',
        userId: 'user-susp',
        paymentId: 'pay-susp',
        subscriptionId: 'plan-cr',
        active: false,
        daysRemaining: 0,
        status: 'suspended',
        expirationDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    ];
    findFirstResults.subscriptions = [{ id: 'plan-cr', guest: false }];

    await checkAndExpireSubscriptions('class-susp');

    expect(updateCalls.length).toBe(0);
  });
});
