// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for Guest Eligibility
 *
 * Tests the functions isUserOpenLabEligible and checkGuestEligibility
 * from src/lib/guest/eligibility.ts
 *
 * Properties tested:
 * - Property 1: Elegibilidad requiere todas las condiciones
 * - Property 5: Membresía expirada invalida elegibilidad
 * - Property 7: Solo Open Lab puede invitar
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.6, 10.4, 10.5, 3.2
 */

// ─── Mock Setup ────────────────────────────────────────────────────────────────

// Track what the db queries return
let selectQueryResults: unknown[] = [];
let selectQueryCallIndex = 0;

// Create a chainable mock that simulates Drizzle's query builder
function createSelectChain() {
  return {
    from: () => ({
      innerJoin: () => ({
        innerJoin: () => ({
          where: () => {
            const result = selectQueryResults[selectQueryCallIndex] ?? [];
            selectQueryCallIndex++;
            return Promise.resolve(result);
          },
        }),
        where: () => {
          const result = selectQueryResults[selectQueryCallIndex] ?? [];
          selectQueryCallIndex++;
          return Promise.resolve(result);
        },
      }),
      where: () => {
        const result = selectQueryResults[selectQueryCallIndex] ?? [];
        selectQueryCallIndex++;
        return Promise.resolve(result);
      },
    }),
  };
}

vi.mock('@/db', () => ({
  db: {
    select: () => createSelectChain(),
  },
}));

vi.mock('@/db/schema', () => ({
  userSubscriptions: {
    subscriptionId: 'subscriptionId',
    paymentId: 'paymentId',
    userId: 'userId',
    active: 'active',
    status: 'status',
    id: 'id',
  },
  subscriptions: { id: 'id', guest: 'guest' },
  payments: { id: 'id', confirmed: 'confirmed' },
  guestCredits: {
    userId: 'userId',
    userSubscriptionId: 'userSubscriptionId',
    creditsUsed: 'creditsUsed',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (field: unknown, value: unknown) => ({ type: 'eq', field, value }),
  and: (...conditions: unknown[]) => ({ type: 'and', conditions }),
}));

// Import functions under test (after mocks)
import { isUserOpenLabEligible, checkGuestEligibility } from '../eligibility';

// ─── Arbitraries (Generators) ──────────────────────────────────────────────────

const uuidArb = fc.uuid();

/**
 * Generate a future date (not expired).
 * noInvalidDate keeps the arbitrary strictly valid — fc.date() can otherwise
 * emit an Invalid Date, which the eligibility check treats as "not expired"
 * (NaN < now is false) and would silently break expiration assertions.
 */
const futureDateArb = fc.date({
  min: new Date(Date.now() + 1000 * 60), // at least 1 minute in the future
  max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // up to 1 year
  noInvalidDate: true,
});

/** Generate a past date (expired). Strictly valid — see futureDateArb. */
const pastDateArb = fc.date({
  min: new Date('2020-01-01'),
  max: new Date(Date.now() - 1000 * 60), // at least 1 minute in the past
  noInvalidDate: true,
});

/** Generate a valid user subscription row */
const userSubArb = fc.record({
  id: uuidArb,
  daysRemaining: fc.integer({ min: 0, max: 30 }),
  paymentId: uuidArb,
  subscriptionId: uuidArb,
  userId: uuidArb,
  active: fc.constant(true),
  status: fc.constant('active' as const),
  expirationDate: futureDateArb,
  createdAt: fc.date(),
});

/** Generate a subscription plan row */
const subscriptionPlanArb = fc.record({
  id: uuidArb,
  name: fc.string({ minLength: 1, maxLength: 50 }),
  sessions: fc.integer({ min: 1, max: 30 }),
  guest: fc.boolean(),
  price: fc.integer({ min: 100, max: 10000 }),
});

/** Generate a payment row */
const paymentArb = fc.record({
  id: uuidArb,
  paymentType: fc.constantFrom('cash', 'transfer', 'card'),
  confirmed: fc.boolean(),
  dateConfirmed: fc.option(fc.date(), { nil: null }),
  createdAt: fc.date(),
});

// ─── Helper Functions ──────────────────────────────────────────────────────────

function resetMocks() {
  selectQueryCallIndex = 0;
  selectQueryResults = [];
}

// ─── Property Tests ────────────────────────────────────────────────────────────

describe('Guest Eligibility - Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  describe('Property 1: Elegibilidad requiere todas las condiciones', () => {
    /**
     * Property 1: For any user and subscription state, the eligibility function
     * must return eligible = true ONLY when ALL conditions are simultaneously met:
     * - Subscription active (status = 'active', active = true)
     * - Payment confirmed
     * - guest = true in the associated subscription
     * - Membership not expired (expirationDate > now)
     *
     * Validates: Requirements 1.1, 1.2, 1.3, 1.4
     */

    it('should return eligible=true only when ALL conditions are met simultaneously', async () => {
      await fc.assert(
        fc.asyncProperty(
          userSubArb,
          subscriptionPlanArb.filter((s) => s.guest === true),
          paymentArb.filter((p) => p.confirmed === true),
          futureDateArb,
          async (userSub, subscription, payment, expirationDate) => {
            resetMocks();

            // All conditions met: active sub, guest=true, payment confirmed, not expired
            const row = {
              userSub: { ...userSub, expirationDate },
              subscription: { ...subscription, guest: true },
              payment: { ...payment, confirmed: true },
            };

            selectQueryResults = [[row]];

            const result = await isUserOpenLabEligible(userSub.userId);

            expect(result.eligible).toBe(true);
            expect(result.userSubscription).not.toBeNull();
            expect(result.subscription).not.toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return eligible=false when guest=false on subscription plan', async () => {
      await fc.assert(
        fc.asyncProperty(
          userSubArb,
          subscriptionPlanArb.filter((s) => s.guest === false),
          paymentArb.filter((p) => p.confirmed === true),
          futureDateArb,
          async (userSub, subscription, payment, expirationDate) => {
            resetMocks();

            // guest = false → not eligible even if everything else is valid
            const row = {
              userSub: { ...userSub, expirationDate },
              subscription: { ...subscription, guest: false },
              payment: { ...payment, confirmed: true },
            };

            selectQueryResults = [[row]];

            const result = await isUserOpenLabEligible(userSub.userId);

            expect(result.eligible).toBe(false);
            expect(result.userSubscription).toBeNull();
            expect(result.subscription).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return eligible=false when payment is not confirmed', async () => {
      await fc.assert(
        fc.asyncProperty(
          userSubArb,
          subscriptionPlanArb.filter((s) => s.guest === true),
          paymentArb.filter((p) => p.confirmed === false),
          futureDateArb,
          async (userSub, subscription, payment, expirationDate) => {
            resetMocks();

            // payment.confirmed = false → not eligible
            const row = {
              userSub: { ...userSub, expirationDate },
              subscription: { ...subscription, guest: true },
              payment: { ...payment, confirmed: false },
            };

            selectQueryResults = [[row]];

            const result = await isUserOpenLabEligible(userSub.userId);

            expect(result.eligible).toBe(false);
            expect(result.userSubscription).toBeNull();
            expect(result.subscription).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return eligible=false when subscription is expired', async () => {
      await fc.assert(
        fc.asyncProperty(
          userSubArb,
          subscriptionPlanArb.filter((s) => s.guest === true),
          paymentArb.filter((p) => p.confirmed === true),
          pastDateArb,
          async (userSub, subscription, payment, pastDate) => {
            resetMocks();

            // expirationDate in the past → expired → not eligible
            const row = {
              userSub: { ...userSub, expirationDate: pastDate },
              subscription: { ...subscription, guest: true },
              payment: { ...payment, confirmed: true },
            };

            selectQueryResults = [[row]];

            const result = await isUserOpenLabEligible(userSub.userId);

            expect(result.eligible).toBe(false);
            expect(result.userSubscription).toBeNull();
            expect(result.subscription).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return eligible=false when user has no active subscriptions', async () => {
      await fc.assert(
        fc.asyncProperty(uuidArb, async (userId) => {
          resetMocks();

          // No rows returned → no active subscriptions
          selectQueryResults = [[]];

          const result = await isUserOpenLabEligible(userId);

          expect(result.eligible).toBe(false);
          expect(result.userSubscription).toBeNull();
          expect(result.subscription).toBeNull();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5: Membresía expirada invalida elegibilidad', () => {
    /**
     * Property 5: For any Open Lab membership where current date exceeds
     * expiration_date, eligibility must return eligible = false, regardless
     * of the credits state.
     *
     * Validates: Requirements 2.6, 10.4, 10.5
     */

    it('expired membership always returns eligible=false regardless of other conditions', async () => {
      await fc.assert(
        fc.asyncProperty(
          userSubArb,
          subscriptionPlanArb.filter((s) => s.guest === true),
          paymentArb.filter((p) => p.confirmed === true),
          pastDateArb,
          async (userSub, subscription, payment, pastDate) => {
            resetMocks();

            // Membership is expired (pastDate < now).
            // The expiration must dominate regardless of the credits state.
            const row = {
              userSub: { ...userSub, expirationDate: pastDate },
              subscription: { ...subscription, guest: true },
              payment: { ...payment, confirmed: true },
            };

            // For checkGuestEligibility: first query is isUserOpenLabEligible (returns expired),
            // second query would be credits (but shouldn't be reached)
            selectQueryResults = [[row]];

            const result = await isUserOpenLabEligible(userSub.userId);

            // Must be ineligible regardless of credit state
            expect(result.eligible).toBe(false);
            expect(result.userSubscription).toBeNull();
            expect(result.subscription).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('checkGuestEligibility returns ineligible with reason for expired membership', async () => {
      await fc.assert(
        fc.asyncProperty(
          userSubArb,
          subscriptionPlanArb.filter((s) => s.guest === true),
          paymentArb.filter((p) => p.confirmed === true),
          pastDateArb,
          async (userSub, subscription, payment, pastDate) => {
            resetMocks();

            // Expired membership
            const row = {
              userSub: { ...userSub, expirationDate: pastDate },
              subscription: { ...subscription, guest: true },
              payment: { ...payment, confirmed: true },
            };

            selectQueryResults = [[row]];

            const result = await checkGuestEligibility(userSub.userId);

            expect(result.eligible).toBe(false);
            expect(result.creditsAvailable).toBe(0);
            expect(result.reason).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 7: Solo Open Lab puede invitar', () => {
    /**
     * Property 7: For any user without an active subscription with guest = true,
     * any attempt to reserve with a guest must be rejected with the corresponding error.
     *
     * Validates: Requirements 3.2
     */

    it('user without Open Lab (guest=false) cannot invite - isUserOpenLabEligible returns false', async () => {
      await fc.assert(
        fc.asyncProperty(
          userSubArb,
          subscriptionPlanArb.filter((s) => s.guest === false),
          paymentArb.filter((p) => p.confirmed === true),
          futureDateArb,
          async (userSub, subscription, payment, expirationDate) => {
            resetMocks();

            // Has active subscription but guest = false (not Open Lab)
            const row = {
              userSub: { ...userSub, expirationDate },
              subscription: { ...subscription, guest: false },
              payment: { ...payment, confirmed: true },
            };

            selectQueryResults = [[row]];

            const result = await isUserOpenLabEligible(userSub.userId);

            expect(result.eligible).toBe(false);
            expect(result.userSubscription).toBeNull();
            expect(result.subscription).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('user with no active subscription cannot invite - checkGuestEligibility rejects', async () => {
      await fc.assert(
        fc.asyncProperty(uuidArb, async (userId) => {
          resetMocks();

          // No active subscriptions at all
          selectQueryResults = [[]];

          const result = await checkGuestEligibility(userId);

          expect(result.eligible).toBe(false);
          expect(result.creditsAvailable).toBe(0);
          expect(result.reason).toBeDefined();
          expect(result.reason).toContain('Open Lab');
        }),
        { numRuns: 100 }
      );
    });

    it('user with only non-Open-Lab subscriptions gets rejected by checkGuestEligibility', async () => {
      const nonOpenLabPlanArb = fc.record({
        id: uuidArb,
        name: fc.string({ minLength: 1, maxLength: 50 }),
        sessions: fc.integer({ min: 1, max: 30 }),
        guest: fc.constant(false as const),
        price: fc.integer({ min: 100, max: 10000 }),
      });

      await fc.assert(
        fc.asyncProperty(
          userSubArb,
          fc.array(nonOpenLabPlanArb, { minLength: 1, maxLength: 3 }),
          paymentArb.filter((p) => p.confirmed === true),
          futureDateArb,
          async (userSub, subscriptionPlans, payment, expirationDate) => {
            resetMocks();

            // Multiple subscriptions, all with guest = false
            const rows = subscriptionPlans.map((sub) => ({
              userSub: { ...userSub, expirationDate },
              subscription: { ...sub, guest: false },
              payment: { ...payment, confirmed: true },
            }));

            selectQueryResults = [rows];

            const result = await checkGuestEligibility(userSub.userId);

            expect(result.eligible).toBe(false);
            expect(result.creditsAvailable).toBe(0);
            expect(result.reason).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 1 (checkGuestEligibility): Full eligibility with credits', () => {
    /**
     * Extended check: checkGuestEligibility combines base eligibility + credits.
     * When ALL base conditions are met AND credits are available (creditsUsed = 0),
     * the function must return eligible = true with creditsAvailable = 1.
     *
     * Validates: Requirements 1.1, 1.2, 1.3, 1.4
     */

    it('eligible with credits available returns eligible=true, creditsAvailable=1', async () => {
      await fc.assert(
        fc.asyncProperty(
          userSubArb,
          subscriptionPlanArb.filter((s) => s.guest === true),
          paymentArb.filter((p) => p.confirmed === true),
          futureDateArb,
          async (userSub, subscription, payment, expirationDate) => {
            resetMocks();

            const row = {
              userSub: { ...userSub, expirationDate },
              subscription: { ...subscription, guest: true },
              payment: { ...payment, confirmed: true },
            };

            // First query: isUserOpenLabEligible → eligible
            // Second query: credits check → no credits used (empty array = 0 used)
            selectQueryResults = [[row], []];

            const result = await checkGuestEligibility(userSub.userId);

            expect(result.eligible).toBe(true);
            expect(result.creditsAvailable).toBe(1);
            expect(result.reason).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('eligible but credits exhausted returns eligible=false with reason', async () => {
      await fc.assert(
        fc.asyncProperty(
          userSubArb,
          subscriptionPlanArb.filter((s) => s.guest === true),
          paymentArb.filter((p) => p.confirmed === true),
          futureDateArb,
          async (userSub, subscription, payment, expirationDate) => {
            resetMocks();

            const row = {
              userSub: { ...userSub, expirationDate },
              subscription: { ...subscription, guest: true },
              payment: { ...payment, confirmed: true },
            };

            // First query: isUserOpenLabEligible → eligible
            // Second query: credits check → 1 credit already used
            selectQueryResults = [[row], [{ creditsUsed: 1 }]];

            const result = await checkGuestEligibility(userSub.userId);

            expect(result.eligible).toBe(false);
            expect(result.creditsAvailable).toBe(0);
            expect(result.reason).toBeDefined();
            expect(result.reason).toContain('crédito');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
