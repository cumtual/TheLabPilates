import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock modules before importing
vi.mock('@/db', () => ({
  db: {
    query: {
      guestCredits: {
        findFirst: vi.fn(),
      },
    },
    transaction: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

import {
  getGuestCreditsForCycle,
  consumeGuestCredit,
  restoreGuestCredit,
} from '../credits';
import { db } from '@/db';

/**
 * Property 2: Consumo de crédito en reserva con invitado
 *
 * For any successful guest reservation, the guest_credits record must reflect
 * creditsUsed = 1, with reference to the corresponding guestEnrollmentId.
 *
 * **Validates: Requirements 2.2, 2.4**
 */
describe('Property 2: Consumo de crédito en reserva con invitado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consumeGuestCredit creates a record with creditsUsed = 1 and correct guestEnrollmentId when no prior record exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, userSubscriptionId, guestEnrollmentId) => {
          vi.clearAllMocks();

          // Mock transaction to execute callback and capture the insert
          let insertedValues: Record<string, unknown> | null = null;

          (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
            async (cb: (tx: unknown) => Promise<void>) => {
              const tx = {
                query: {
                  guestCredits: {
                    findFirst: vi.fn().mockResolvedValue(null), // No existing record
                  },
                },
                insert: vi.fn().mockReturnValue({
                  values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
                    insertedValues = vals;
                    return Promise.resolve();
                  }),
                }),
                update: vi.fn(),
              };
              await cb(tx);
            }
          );

          await consumeGuestCredit(userId, userSubscriptionId, guestEnrollmentId);

          // Verify: creditsUsed = 1 and guestEnrollmentId is referenced
          expect(insertedValues).not.toBeNull();
          expect(insertedValues!.creditsUsed).toBe(1);
          expect(insertedValues!.guestEnrollmentId).toBe(guestEnrollmentId);
          expect(insertedValues!.userId).toBe(userId);
          expect(insertedValues!.userSubscriptionId).toBe(userSubscriptionId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('consumeGuestCredit updates existing record with creditsUsed = 1 and correct guestEnrollmentId when record exists with creditsUsed = 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, userSubscriptionId, guestEnrollmentId, existingRecordId) => {
          vi.clearAllMocks();

          let updatedSet: Record<string, unknown> | null = null;

          (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
            async (cb: (tx: unknown) => Promise<void>) => {
              const tx = {
                query: {
                  guestCredits: {
                    findFirst: vi.fn().mockResolvedValue({
                      id: existingRecordId,
                      userId,
                      userSubscriptionId,
                      creditsUsed: 0,
                      guestEnrollmentId: null,
                    }),
                  },
                },
                update: vi.fn().mockReturnValue({
                  set: vi.fn().mockImplementation((setValues: Record<string, unknown>) => {
                    updatedSet = setValues;
                    return {
                      where: vi.fn().mockResolvedValue(undefined),
                    };
                  }),
                }),
                insert: vi.fn(),
              };
              await cb(tx);
            }
          );

          await consumeGuestCredit(userId, userSubscriptionId, guestEnrollmentId);

          // Verify: creditsUsed = 1 and guestEnrollmentId is set correctly
          expect(updatedSet).not.toBeNull();
          expect(updatedSet!.creditsUsed).toBe(1);
          expect(updatedSet!.guestEnrollmentId).toBe(guestEnrollmentId);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 3: Rechazo por créditos agotados
 *
 * For any user with creditsUsed >= 1 (balance = 0) within their active billing cycle,
 * any attempt to reserve with guest or add guest to existing reservation must be rejected.
 *
 * **Validates: Requirements 2.3, 9.7**
 */
describe('Property 3: Rechazo por créditos agotados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getGuestCreditsForCycle returns 0 when creditsUsed >= 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 1, max: 100 }),
        async (userId, userSubscriptionId, creditsUsed) => {
          vi.clearAllMocks();

          (db.query.guestCredits.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'credit-id',
            userId,
            userSubscriptionId,
            creditsUsed,
            guestEnrollmentId: 'some-enrollment-id',
          });

          const result = await getGuestCreditsForCycle(userId, userSubscriptionId);

          // With creditsUsed >= 1, available credits must be 0
          expect(result).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('consumeGuestCredit throws error when creditsUsed >= 1 (credit already consumed)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 1, max: 100 }),
        async (userId, userSubscriptionId, guestEnrollmentId, creditsUsed) => {
          vi.clearAllMocks();

          (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
            async (cb: (tx: unknown) => Promise<void>) => {
              const tx = {
                query: {
                  guestCredits: {
                    findFirst: vi.fn().mockResolvedValue({
                      id: 'existing-credit-id',
                      userId,
                      userSubscriptionId,
                      creditsUsed,
                      guestEnrollmentId: 'prev-enrollment-id',
                    }),
                  },
                },
                update: vi.fn(),
                insert: vi.fn(),
              };
              await cb(tx);
            }
          );

          // Attempting to consume when credit is already used must throw
          await expect(
            consumeGuestCredit(userId, userSubscriptionId, guestEnrollmentId)
          ).rejects.toThrow('No guest credits available for this cycle.');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getGuestCreditsForCycle returns 1 when no record exists (implicit credit available)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (userId, userSubscriptionId) => {
          vi.clearAllMocks();

          (db.query.guestCredits.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

          const result = await getGuestCreditsForCycle(userId, userSubscriptionId);

          // No record means the credit is available
          expect(result).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getGuestCreditsForCycle returns 1 when record exists with creditsUsed = 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (userId, userSubscriptionId) => {
          vi.clearAllMocks();

          (db.query.guestCredits.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'credit-id',
            userId,
            userSubscriptionId,
            creditsUsed: 0,
            guestEnrollmentId: null,
          });

          const result = await getGuestCreditsForCycle(userId, userSubscriptionId);

          // creditsUsed = 0 means the credit is still available
          expect(result).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 4: Restauración de crédito en cancelación anticipada
 *
 * For any guest cancellation (guest only or both) made with more than 24 hours
 * before class date, the system must restore the guest credit (set creditsUsed = 0
 * or delete the usage record) within the user's active cycle.
 *
 * **Validates: Requirements 2.5, 4.3, 4.7**
 */
describe('Property 4: Restauración de crédito en cancelación anticipada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restoreGuestCredit deletes the credit record to make the credit available again', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (userId, userSubscriptionId) => {
          vi.clearAllMocks();

          let deleteCalled = false;
          let deleteWhereArgs: unknown = null;

          (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
            where: vi.fn().mockImplementation((whereCondition: unknown) => {
              deleteCalled = true;
              deleteWhereArgs = whereCondition;
              return Promise.resolve();
            }),
          });

          await restoreGuestCredit(userId, userSubscriptionId);

          // Verify that the credit record is deleted (restoring the credit)
          expect(deleteCalled).toBe(true);
          expect(deleteWhereArgs).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('after restoreGuestCredit, getGuestCreditsForCycle returns 1 (credit available)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (userId, userSubscriptionId) => {
          vi.clearAllMocks();

          // First: restore credit (delete the record)
          (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          });

          await restoreGuestCredit(userId, userSubscriptionId);

          // After restore: querying credits returns null (no record)
          (db.query.guestCredits.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

          const result = await getGuestCreditsForCycle(userId, userSubscriptionId);

          // After deletion, no record means full credit available
          expect(result).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('restore followed by consume creates a fresh record with creditsUsed = 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, userSubscriptionId, newGuestEnrollmentId) => {
          vi.clearAllMocks();

          // Step 1: Restore
          (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          });

          await restoreGuestCredit(userId, userSubscriptionId);

          // Step 2: Consume again (no existing record after restore)
          let insertedValues: Record<string, unknown> | null = null;

          (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
            async (cb: (tx: unknown) => Promise<void>) => {
              const tx = {
                query: {
                  guestCredits: {
                    findFirst: vi.fn().mockResolvedValue(null), // No record after restore
                  },
                },
                insert: vi.fn().mockReturnValue({
                  values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
                    insertedValues = vals;
                    return Promise.resolve();
                  }),
                }),
                update: vi.fn(),
              };
              await cb(tx);
            }
          );

          await consumeGuestCredit(userId, userSubscriptionId, newGuestEnrollmentId);

          // Verify fresh record created with creditsUsed = 1
          expect(insertedValues).not.toBeNull();
          expect(insertedValues!.creditsUsed).toBe(1);
          expect(insertedValues!.guestEnrollmentId).toBe(newGuestEnrollmentId);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 6: Renovación asigna crédito independiente
 *
 * For any Open Lab membership renewal (new confirmed payment), the system must
 * create a new credit record for the new cycle with creditsUsed = 0, independent
 * of the previous cycle's credit state.
 *
 * **Validates: Requirements 2.7**
 */
describe('Property 6: Renovación asigna crédito independiente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('new subscription cycle has independent credit regardless of previous cycle state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 0, max: 10 }),
        async (userId, oldUserSubscriptionId, newUserSubscriptionId, previousCreditsUsed) => {
          vi.clearAllMocks();

          // Old cycle had credits used (whatever the state)
          (db.query.guestCredits.findFirst as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
              id: 'old-credit-id',
              userId,
              userSubscriptionId: oldUserSubscriptionId,
              creditsUsed: previousCreditsUsed,
              guestEnrollmentId: previousCreditsUsed > 0 ? 'old-enrollment-id' : null,
            });

          const oldCycleCredits = await getGuestCreditsForCycle(userId, oldUserSubscriptionId);
          const expectedOldCredits = previousCreditsUsed >= 1 ? 0 : 1;
          expect(oldCycleCredits).toBe(expectedOldCredits);

          // New cycle: no record exists for the new subscription
          (db.query.guestCredits.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

          const newCycleCredits = await getGuestCreditsForCycle(userId, newUserSubscriptionId);

          // New cycle always starts with full credit available (1)
          // regardless of the previous cycle's state
          expect(newCycleCredits).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('consuming credit in new cycle does not affect previous cycle record', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, oldUserSubscriptionId, newUserSubscriptionId, newGuestEnrollmentId) => {
          vi.clearAllMocks();

          // Consume credit for new cycle
          let insertedValues: Record<string, unknown> | null = null;

          (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
            async (cb: (tx: unknown) => Promise<void>) => {
              const tx = {
                query: {
                  guestCredits: {
                    findFirst: vi.fn().mockResolvedValue(null), // No record for new cycle
                  },
                },
                insert: vi.fn().mockReturnValue({
                  values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
                    insertedValues = vals;
                    return Promise.resolve();
                  }),
                }),
                update: vi.fn(),
              };
              await cb(tx);
            }
          );

          await consumeGuestCredit(userId, newUserSubscriptionId, newGuestEnrollmentId);

          // Verify: new record is for the new subscription, not the old one
          expect(insertedValues).not.toBeNull();
          expect(insertedValues!.userSubscriptionId).toBe(newUserSubscriptionId);
          expect(insertedValues!.userSubscriptionId).not.toBe(oldUserSubscriptionId);
          expect(insertedValues!.creditsUsed).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('multiple cycles each maintain independent credit state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), { minLength: 2, maxLength: 5 }),
        async (userId, subscriptionIds) => {
          vi.clearAllMocks();

          // Each subscription ID represents a different cycle
          // Verify that each cycle independently reports credit = 1 when no record
          for (const subId of subscriptionIds) {
            (db.query.guestCredits.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

            const credits = await getGuestCreditsForCycle(userId, subId);
            expect(credits).toBe(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
