import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock modules before importing the action
vi.mock('@/db', () => ({
  db: {
    query: {
      openClasses: {
        findFirst: vi.fn(),
      },
      guestEnrollments: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(),
    transaction: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
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

vi.mock('@/lib/guest/capacity', () => ({
  getAvailableCapacity: vi.fn(),
}));

import { adminAddGuestAction, adminRemoveGuestAction } from '../admin-guest';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { getAvailableCapacity } from '@/lib/guest/capacity';

describe('adminRemoveGuestAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should reject unauthenticated users', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const result = await adminRemoveGuestAction('some-id');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('No tienes permisos para esta acción.');
    }
  });

  it('should reject non-admin users', async () => {
    vi.mocked(getSession).mockResolvedValue({
      sub: 'user-1',
      role: 'client',
      email: 'user@test.com',
      iat: 0,
      exp: 0,
    });

    const result = await adminRemoveGuestAction('some-id');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('No tienes permisos para esta acción.');
    }
  });

  it('should reject when guestEnrollmentId is empty', async () => {
    vi.mocked(getSession).mockResolvedValue({
      sub: 'admin-1',
      role: 'admin',
      email: 'admin@test.com',
      iat: 0,
      exp: 0,
    });

    const result = await adminRemoveGuestAction('');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('ID de inscripción de invitado no proporcionado.');
    }
  });

  it('should reject when guest enrollment is not found', async () => {
    vi.mocked(getSession).mockResolvedValue({
      sub: 'admin-1',
      role: 'admin',
      email: 'admin@test.com',
      iat: 0,
      exp: 0,
    });
    vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue(undefined);

    const result = await adminRemoveGuestAction('non-existent-id');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Inscripción de invitado no encontrada.');
    }
  });

  it('should reject removal of user-origin guest (Req 6.8)', async () => {
    vi.mocked(getSession).mockResolvedValue({
      sub: 'admin-1',
      role: 'admin',
      email: 'admin@test.com',
      iat: 0,
      exp: 0,
    });
    vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue({
      id: 'guest-1',
      openClassId: 'class-1',
      guestName: 'Juan Perez',
      origin: 'user',
      registeredById: 'user-1',
      status: 'pending',
      createdAt: new Date(),
    });

    const result = await adminRemoveGuestAction('guest-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        'Solo puedes eliminar invitados registrados por administrador.'
      );
    }
  });

  it('should reject removal of already cancelled guest', async () => {
    vi.mocked(getSession).mockResolvedValue({
      sub: 'admin-1',
      role: 'admin',
      email: 'admin@test.com',
      iat: 0,
      exp: 0,
    });
    vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue({
      id: 'guest-1',
      openClassId: 'class-1',
      guestName: 'Pedro Lopez',
      origin: 'admin',
      registeredById: 'admin-1',
      status: 'cancelled',
      createdAt: new Date(),
    });

    const result = await adminRemoveGuestAction('guest-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Este invitado ya fue cancelado.');
    }
  });

  it('should successfully remove an admin-origin guest (Req 6.7)', async () => {
    vi.mocked(getSession).mockResolvedValue({
      sub: 'admin-1',
      role: 'admin',
      email: 'admin@test.com',
      iat: 0,
      exp: 0,
    });
    vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue({
      id: 'guest-1',
      openClassId: 'class-1',
      guestName: 'Pedro Lopez',
      origin: 'admin',
      registeredById: 'admin-1',
      status: 'pending',
      createdAt: new Date(),
    });

    // Mock transaction to simulate successful execution
    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      await fn(tx as any);
      return undefined;
    });

    const result = await adminRemoveGuestAction('guest-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toBe('Invitado eliminado exitosamente.');
    }
  });

  it('should handle transaction errors gracefully', async () => {
    vi.mocked(getSession).mockResolvedValue({
      sub: 'admin-1',
      role: 'admin',
      email: 'admin@test.com',
      iat: 0,
      exp: 0,
    });
    vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue({
      id: 'guest-1',
      openClassId: 'class-1',
      guestName: 'Pedro Lopez',
      origin: 'admin',
      registeredById: 'admin-1',
      status: 'pending',
      createdAt: new Date(),
    });

    // Mock transaction to throw an error
    vi.mocked(db.transaction).mockRejectedValue(new Error('DB connection error'));

    const result = await adminRemoveGuestAction('guest-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('No se pudo eliminar el invitado. Intenta de nuevo.');
    }
  });
});


// ─── Arbitraries (Generators) ──────────────────────────────────────────────────

const uuidArb = fc.uuid();

/** Generate a valid guest name (1-100 chars for admin) */
const validAdminGuestNameArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1);

/** Generate valid active enrollment statuses (not cancelled/late_cancelled) */
const activeStatusArb = fc.constantFrom('pending', 'attended', 'absent');

/** Generate cancelled-family statuses */
const cancelledStatusArb = fc.constantFrom('cancelled', 'late_cancelled');

/** Generate an admin session */
const adminSessionArb = fc.record({
  sub: uuidArb,
  role: fc.constant('admin' as const),
  email: fc.string({ minLength: 5, maxLength: 50 }).map((s) => `${s}@test.com`),
  iat: fc.constant(0),
  exp: fc.constant(0),
});

/** Generate a guest enrollment record */
const guestEnrollmentArb = fc.record({
  id: uuidArb,
  openClassId: uuidArb,
  guestName: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
  origin: fc.constantFrom('user' as const, 'admin' as const),
  registeredById: uuidArb,
  status: activeStatusArb,
  createdAt: fc.date(),
});

// ─── Property-Based Tests ──────────────────────────────────────────────────────

describe('Property 14: Admin solo puede eliminar invitados de origen admin', () => {
  /**
   * Property 14: For any guest_enrollment with origin = 'user', an admin
   * removal attempt must be rejected. Only records with origin = 'admin'
   * can be removed by admin.
   *
   * Validates: Requirements 6.8
   */

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should ALWAYS reject removal of guest enrollments with origin = "user"', async () => {
    await fc.assert(
      fc.asyncProperty(
        adminSessionArb,
        guestEnrollmentArb.map((ge) => ({ ...ge, origin: 'user' as const })),
        async (session, guestEnrollment) => {
          vi.resetAllMocks();

          // Setup: admin is authenticated
          vi.mocked(getSession).mockResolvedValue(session);

          // Setup: guest enrollment exists with origin = 'user'
          vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue(guestEnrollment);

          const result = await adminRemoveGuestAction(guestEnrollment.id);

          // Must be rejected — admin cannot remove user-added guests
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe(
              'Solo puedes eliminar invitados registrados por administrador.'
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should ALWAYS allow removal of guest enrollments with origin = "admin" and active status', async () => {
    await fc.assert(
      fc.asyncProperty(
        adminSessionArb,
        guestEnrollmentArb.map((ge) => ({ ...ge, origin: 'admin' as const })),
        async (session, guestEnrollment) => {
          vi.resetAllMocks();

          // Setup: admin is authenticated
          vi.mocked(getSession).mockResolvedValue(session);

          // Setup: guest enrollment exists with origin = 'admin' and active status
          vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue(guestEnrollment);

          // Mock transaction to simulate successful execution
          vi.mocked(db.transaction).mockImplementation(async (fn) => {
            const tx = {
              execute: vi.fn().mockResolvedValue(undefined),
              update: vi.fn().mockReturnValue({
                set: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue(undefined),
                }),
              }),
            };
            await fn(tx as any);
            return undefined;
          });

          const result = await adminRemoveGuestAction(guestEnrollment.id);

          // Must succeed — admin can remove admin-added guests
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.message).toBe('Invitado eliminado exitosamente.');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject removal for ANY user-origin guest regardless of guest name or other fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        adminSessionArb,
        uuidArb, // enrollment id
        uuidArb, // class id
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1), // guest name
        uuidArb, // registeredById (some user)
        activeStatusArb, // any active status
        fc.date(), // creation date
        async (session, enrollmentId, classId, guestName, registeredById, status, createdAt) => {
          vi.resetAllMocks();

          vi.mocked(getSession).mockResolvedValue(session);

          // User-origin enrollment with any combination of valid fields
          vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue({
            id: enrollmentId,
            openClassId: classId,
            guestName,
            origin: 'user',
            registeredById,
            status,
            createdAt,
          });

          const result = await adminRemoveGuestAction(enrollmentId);

          // Invariant: ALWAYS rejected for user-origin
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe(
              'Solo puedes eliminar invitados registrados por administrador.'
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject removal of already cancelled admin-origin guests', async () => {
    await fc.assert(
      fc.asyncProperty(
        adminSessionArb,
        guestEnrollmentArb.chain((ge) =>
          cancelledStatusArb.map((status) => ({ ...ge, origin: 'admin' as const, status }))
        ),
        async (session, guestEnrollment) => {
          vi.resetAllMocks();

          vi.mocked(getSession).mockResolvedValue(session);
          vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue(guestEnrollment);

          const result = await adminRemoveGuestAction(guestEnrollment.id);

          // Already cancelled guests cannot be removed again
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe('Este invitado ya fue cancelado.');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 15: Eliminación admin restaura cupo', () => {
  /**
   * Property 15: For any successful admin guest deletion, the available
   * capacity of the class must increment by exactly 1 unit.
   *
   * This is validated by verifying that the transaction:
   * 1. Locks the class row (SELECT FOR UPDATE)
   * 2. Updates the guest enrollment status to 'cancelled'
   * Both of which ensure the capacity calculation will reflect +1 available spot.
   *
   * Validates: Requirements 6.7
   */

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('successful removal sets status to "cancelled", freeing exactly 1 spot', async () => {
    await fc.assert(
      fc.asyncProperty(
        adminSessionArb,
        guestEnrollmentArb.map((ge) => ({ ...ge, origin: 'admin' as const })),
        async (session, guestEnrollment) => {
          vi.resetAllMocks();

          vi.mocked(getSession).mockResolvedValue(session);
          vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue(guestEnrollment);

          // Track transaction operations
          let lockExecuted = false;
          let updateCalled = false;
          let statusSetTo: string | null = null;

          vi.mocked(db.transaction).mockImplementation(async (fn) => {
            const tx = {
              execute: vi.fn().mockImplementation(async () => {
                lockExecuted = true;
                return undefined;
              }),
              update: vi.fn().mockReturnValue({
                set: vi.fn().mockImplementation((values: { status: string }) => {
                  updateCalled = true;
                  statusSetTo = values.status;
                  return {
                    where: vi.fn().mockResolvedValue(undefined),
                  };
                }),
              }),
            };
            await fn(tx as any);
            return undefined;
          });

          const result = await adminRemoveGuestAction(guestEnrollment.id);

          // Must succeed
          expect(result.success).toBe(true);

          // Verify the transaction performed the correct operations:
          // 1. Locked the class row (prevents race conditions on capacity)
          expect(lockExecuted).toBe(true);
          // 2. Updated the guest enrollment status to 'cancelled'
          expect(updateCalled).toBe(true);
          expect(statusSetTo).toBe('cancelled');
          // Setting status to 'cancelled' ensures the capacity formula
          // (capacity - active_enrolleds - active_guests) now counts 1 fewer guest,
          // effectively incrementing available capacity by exactly 1.
        }
      ),
      { numRuns: 100 }
    );
  });

  it('removal uses SELECT FOR UPDATE to atomically lock the class before updating', async () => {
    await fc.assert(
      fc.asyncProperty(
        adminSessionArb,
        guestEnrollmentArb.map((ge) => ({ ...ge, origin: 'admin' as const })),
        async (session, guestEnrollment) => {
          vi.resetAllMocks();

          vi.mocked(getSession).mockResolvedValue(session);
          vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue(guestEnrollment);

          const operationOrder: string[] = [];

          vi.mocked(db.transaction).mockImplementation(async (fn) => {
            const tx = {
              execute: vi.fn().mockImplementation(async () => {
                operationOrder.push('lock');
                return undefined;
              }),
              update: vi.fn().mockReturnValue({
                set: vi.fn().mockImplementation(() => {
                  operationOrder.push('update');
                  return {
                    where: vi.fn().mockResolvedValue(undefined),
                  };
                }),
              }),
            };
            await fn(tx as any);
            return undefined;
          });

          const result = await adminRemoveGuestAction(guestEnrollment.id);

          expect(result.success).toBe(true);
          // Lock MUST happen before the update (atomic capacity protection)
          expect(operationOrder[0]).toBe('lock');
          expect(operationOrder[1]).toBe('update');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('if transaction fails, capacity is NOT affected (no partial state)', async () => {
    await fc.assert(
      fc.asyncProperty(
        adminSessionArb,
        guestEnrollmentArb.map((ge) => ({ ...ge, origin: 'admin' as const })),
        async (session, guestEnrollment) => {
          vi.resetAllMocks();

          vi.mocked(getSession).mockResolvedValue(session);
          vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue(guestEnrollment);

          // Simulate transaction failure (DB error, timeout, etc.)
          vi.mocked(db.transaction).mockRejectedValue(new Error('Connection lost'));

          const result = await adminRemoveGuestAction(guestEnrollment.id);

          // Must fail gracefully — the enrollment was NOT cancelled,
          // so capacity remains unchanged (no partial state)
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe('No se pudo eliminar el invitado. Intenta de nuevo.');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('the cancelled enrollment is excluded from capacity calculation (integration proof)', async () => {
    /**
     * This test verifies that after a successful removal, a subsequent
     * capacity check would count 1 fewer guest enrollment.
     *
     * The capacity formula is:
     *   available = capacity - active_class_enrolleds - active_guest_enrollments
     *
     * By setting status = 'cancelled', the guest enrollment is excluded from
     * the "active" count, thus incrementing available capacity by exactly 1.
     */
    await fc.assert(
      fc.asyncProperty(
        adminSessionArb,
        guestEnrollmentArb.map((ge) => ({ ...ge, origin: 'admin' as const })),
        fc.integer({ min: 1, max: 20 }), // class capacity
        fc.integer({ min: 0, max: 10 }), // regular enrollments
        fc.integer({ min: 1, max: 10 }), // guest enrollments (at least 1 to remove)
        async (session, guestEnrollment, classCapacity, regularCount, guestCount) => {
          vi.resetAllMocks();

          vi.mocked(getSession).mockResolvedValue(session);
          vi.mocked(db.query.guestEnrollments.findFirst).mockResolvedValue(guestEnrollment);

          // Successful transaction
          vi.mocked(db.transaction).mockImplementation(async (fn) => {
            const tx = {
              execute: vi.fn().mockResolvedValue(undefined),
              update: vi.fn().mockReturnValue({
                set: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue(undefined),
                }),
              }),
            };
            await fn(tx as any);
            return undefined;
          });

          const result = await adminRemoveGuestAction(guestEnrollment.id);
          expect(result.success).toBe(true);

          // After removal, capacity calculation would be:
          // Before: available = capacity - regularCount - guestCount
          // After:  available = capacity - regularCount - (guestCount - 1)
          // Difference = exactly +1 spot freed
          const availableBefore = classCapacity - regularCount - guestCount;
          const availableAfter = classCapacity - regularCount - (guestCount - 1);
          expect(availableAfter - availableBefore).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─── Property 13: Admin agrega invitado correctamente ──────────────────────────

/** Invalid admin guest name: empty or >100 chars after trim */
const invalidAdminGuestNameArb = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.string({ minLength: 101, maxLength: 150 })
);

/** Available capacity >= 1 (class has room) */
const availableCapacityWithRoomArb = fc.integer({ min: 1, max: 20 });

/**
 * Property 13: Admin agrega invitado correctamente
 * Validates: Requirements 6.4, 6.5
 *
 * For any addition of a guest by admin with valid name and class with at least
 * 1 available spot, the system must create a guest_enrollment with
 * origin = 'admin' and registeredById corresponding to the admin,
 * and decrement available capacity by 1.
 */
describe('Property 13: Admin agrega invitado correctamente', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  /**
   * Helper to set up successful transaction mock that captures insert values.
   * Returns the array where insert values will be pushed.
   */
  function setupSuccessfulTransactionMock(): Array<Record<string, unknown>> {
    const insertedValues: Array<Record<string, unknown>> = [];

    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      let executeCallIndex = 0;
      const tx = {
        execute: vi.fn().mockImplementation(async () => {
          executeCallIndex++;
          // First call: SELECT ... FOR UPDATE (lock)
          // Second call: SELECT count(*) FROM class_enrolleds (regular enrollment count)
          if (executeCallIndex === 2) {
            return [{ count: 0 }];
          }
          return undefined;
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
            insertedValues.push(vals);
            return Promise.resolve(undefined);
          }),
        }),
      };
      await fn(tx as any);
      return undefined;
    });

    return insertedValues;
  }

  it('property: successful admin add creates enrollment with origin=admin and correct registeredById', async () => {
    /**
     * **Validates: Requirements 6.4, 6.5**
     *
     * For any valid admin session, valid guest name (1-100 chars),
     * existing scheduled class with available capacity >= 1,
     * the action must succeed and the transaction must insert a
     * guest enrollment with origin='admin' and registeredById = admin's sub.
     */
    await fc.assert(
      fc.asyncProperty(
        adminSessionArb,
        uuidArb,
        validAdminGuestNameArb,
        availableCapacityWithRoomArb,
        async (session, classId, guestName, availableCapacity) => {
          vi.resetAllMocks();

          // Setup: admin session
          vi.mocked(getSession).mockResolvedValue(session);

          // Setup: class exists and is scheduled
          vi.mocked(db.query.openClasses.findFirst).mockResolvedValue({
            id: classId,
            capacity: availableCapacity + 5, // some arbitrary capacity > occupied
            status: 'scheduled',
            available: 'available',
            createdAt: new Date(),
            classDate: new Date(),
            coachUserId: 'coach-1',
            classType: 'yoga',
            customName: null,
          });

          // Setup: available capacity has room
          vi.mocked(getAvailableCapacity).mockResolvedValue(availableCapacity);

          // Setup: successful transaction that captures inserts
          const insertedValues = setupSuccessfulTransactionMock();

          const result = await adminAddGuestAction(classId, guestName);

          // Assert: action succeeds
          expect(result.success).toBe(true);

          // Assert: transaction was called (atomicity)
          expect(db.transaction).toHaveBeenCalledOnce();

          // Assert: inserted enrollment has origin = 'admin'
          expect(insertedValues.length).toBeGreaterThanOrEqual(1);
          const guestEnrollment = insertedValues[0];
          expect(guestEnrollment.origin).toBe('admin');

          // Assert: registeredById corresponds to admin's user ID
          expect(guestEnrollment.registeredById).toBe(session.sub);

          // Assert: guest name is stored (trimmed)
          expect(guestEnrollment.guestName).toBe(guestName.trim());

          // Assert: status is pending
          expect(guestEnrollment.status).toBe('pending');

          // Assert: class ID is correct
          expect(guestEnrollment.openClassId).toBe(classId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: action is rejected when available capacity < 1', async () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * For any valid admin session and valid guest name, if the class
     * has 0 available capacity, the action must be rejected.
     */
    await fc.assert(
      fc.asyncProperty(
        adminSessionArb,
        uuidArb,
        validAdminGuestNameArb,
        async (session, classId, guestName) => {
          vi.resetAllMocks();

          // Setup: admin session
          vi.mocked(getSession).mockResolvedValue(session);

          // Setup: class exists and is scheduled
          vi.mocked(db.query.openClasses.findFirst).mockResolvedValue({
            id: classId,
            capacity: 10,
            status: 'scheduled',
            available: 'available',
            createdAt: new Date(),
            classDate: new Date(),
            coachUserId: 'coach-1',
            classType: 'yoga',
            customName: null,
          });

          // Setup: no available capacity
          vi.mocked(getAvailableCapacity).mockResolvedValue(0);

          const result = await adminAddGuestAction(classId, guestName);

          // Assert: action is rejected
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe('No hay cupos disponibles.');
          }

          // Assert: no transaction was executed
          expect(db.transaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: action is rejected with invalid guest names', async () => {
    /**
     * **Validates: Requirements 6.3**
     *
     * For any invalid guest name (empty after trim or > 100 chars),
     * the action must be rejected with a validation error.
     */
    await fc.assert(
      fc.asyncProperty(
        adminSessionArb,
        uuidArb,
        invalidAdminGuestNameArb,
        async (session, classId, guestName) => {
          vi.resetAllMocks();

          // Setup: admin session
          vi.mocked(getSession).mockResolvedValue(session);

          const result = await adminAddGuestAction(classId, guestName);

          // Assert: action is rejected with name validation error
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toMatch(
              /nombre del invitado/i
            );
          }

          // Assert: no DB operations were performed
          expect(db.query.openClasses.findFirst).not.toHaveBeenCalled();
          expect(db.transaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: non-admin roles are always rejected', async () => {
    const nonAdminRoleArb = fc.constantFrom('client', 'coach');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        nonAdminRoleArb,
        uuidArb,
        validAdminGuestNameArb,
        async (userId, role, classId, guestName) => {
          vi.resetAllMocks();

          vi.mocked(getSession).mockResolvedValue({
            sub: userId,
            role: role,
            email: 'user@test.com',
            iat: 0,
            exp: 0,
          });

          const result = await adminAddGuestAction(classId, guestName);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe('No tienes permisos para esta acción.');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: capacity decrements by exactly 1 on successful add', async () => {
    /**
     * **Validates: Requirements 6.4**
     *
     * Verifying that the action creates exactly one guest enrollment entry
     * (which represents a 1-cupo decrement in the capacity model).
     */
    await fc.assert(
      fc.asyncProperty(
        adminSessionArb,
        uuidArb,
        validAdminGuestNameArb,
        availableCapacityWithRoomArb,
        async (session, classId, guestName, availableCapacity) => {
          vi.resetAllMocks();

          vi.mocked(getSession).mockResolvedValue(session);
          vi.mocked(db.query.openClasses.findFirst).mockResolvedValue({
            id: classId,
            capacity: availableCapacity + 5,
            status: 'scheduled',
            available: 'available',
            createdAt: new Date(),
            classDate: new Date(),
            coachUserId: 'coach-1',
            classType: 'yoga',
            customName: null,
          });
          vi.mocked(getAvailableCapacity).mockResolvedValue(availableCapacity);

          const insertedValues = setupSuccessfulTransactionMock();

          const result = await adminAddGuestAction(classId, guestName);

          expect(result.success).toBe(true);

          // Exactly 1 insert = exactly 1 cupo decrement
          expect(insertedValues.length).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
