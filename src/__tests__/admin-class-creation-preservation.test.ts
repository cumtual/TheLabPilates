// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Preservation Property Tests - Admin Class Creation
 *
 * **Property 2: Preservation** - Validation and Successful Creation Unchanged
 *
 * These tests capture the EXISTING correct behavior on UNFIXED code.
 * They must PASS on unfixed code and continue to pass after the fix,
 * confirming no regressions were introduced.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
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
// Helpers
// ============================================================

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const defaults: Record<string, string> = {
    classDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    capacity: '10',
    classType: 'yoga',
    coachId: 'coach-uuid-456',
  };
  const merged = { ...defaults, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    formData.set(key, value);
  }
  return formData;
}

function setupAdminSession() {
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    sub: 'admin-uuid-123',
    role: 'admin',
    email: 'admin@test.com',
  });
}

function setupCoachValidation(coachId = 'coach-uuid-456') {
  (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: coachId,
    role: 'coach',
    deletedAt: null,
    email: 'coach@test.com',
    username: 'TestCoach',
  });
}

function setupDbInsertSuccess() {
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
}

// ============================================================
// Property: Non-admin sessions are rejected
// Validates: Requirement 3.6
// ============================================================
describe('Preservation: Non-admin session rejection', () => {
  it('PROPERTY: For all non-admin sessions (role != admin), result is { success: false, error: "No tienes permisos para esta acción." }', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate non-admin roles and null sessions
        fc.oneof(
          fc.constant(null), // no session
          fc.record({
            sub: fc.uuid(),
            role: fc.constantFrom('client', 'coach'),
            email: fc.emailAddress(),
          })
        ),
        // Generate arbitrary valid form data (should not matter since session check comes first)
        fc.integer({ min: 1, max: 365 }),
        fc.integer({ min: 1, max: 20 }),
        fc.constantFrom('yoga', 'mat_pilates', 'barre'),
        fc.uuid(),
        async (session, daysAhead, capacity, classType, coachId) => {
          vi.clearAllMocks();

          // Mock the non-admin session
          (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(session);

          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + daysAhead);
          futureDate.setHours(10, 0, 0, 0);

          const formData = makeFormData({
            classDate: futureDate.toISOString(),
            capacity: capacity.toString(),
            classType,
            coachId,
          });

          const result = await adminCreateClassAction(null, formData);

          expect(result).toEqual({
            success: false,
            error: 'No tienes permisos para esta acción.',
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================
// Property: Past dates are rejected
// Validates: Requirement 3.2
// ============================================================
describe('Preservation: Past date rejection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAdminSession();
  });

  it('PROPERTY: For all past dates (unambiguously in the past), result is { success: false, error: "La fecha debe ser en el futuro." }', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate dates clearly in the past (1 day to 5 years ago)
        fc.integer({ min: 1, max: 1825 }).map((daysAgo) => {
          const date = new Date();
          date.setDate(date.getDate() - daysAgo);
          date.setHours(0, 0, 0, 0);
          return date.toISOString();
        }),
        fc.integer({ min: 1, max: 20 }),
        fc.constantFrom('yoga', 'mat_pilates', 'barre'),
        fc.uuid(),
        async (pastDate, capacity, classType, coachId) => {
          vi.clearAllMocks();
          setupAdminSession();

          const formData = makeFormData({
            classDate: pastDate,
            capacity: capacity.toString(),
            classType,
            coachId,
          });

          const result = await adminCreateClassAction(null, formData);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe('La fecha debe ser en el futuro.');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================
// Property: Invalid capacity is rejected
// Validates: Requirement 3.3
// ============================================================
describe('Preservation: Invalid capacity rejection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAdminSession();
  });

  it('PROPERTY: For all capacity values outside [1,20], result is { success: false, error: "La capacidad debe ser entre 1 y 20." }', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate future date (valid)
        fc.integer({ min: 2, max: 365 }).map((daysAhead) => {
          const date = new Date();
          date.setDate(date.getDate() + daysAhead);
          date.setHours(10, 0, 0, 0);
          return date.toISOString();
        }),
        // Generate invalid capacity: either < 1 or > 20
        fc.oneof(
          fc.integer({ min: -1000, max: 0 }),
          fc.integer({ min: 21, max: 1000 })
        ),
        fc.constantFrom('yoga', 'mat_pilates', 'barre'),
        fc.uuid(),
        async (futureDate, invalidCapacity, classType, coachId) => {
          vi.clearAllMocks();
          setupAdminSession();

          const formData = makeFormData({
            classDate: futureDate,
            capacity: invalidCapacity.toString(),
            classType,
            coachId,
          });

          const result = await adminCreateClassAction(null, formData);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe('La capacidad debe ser entre 1 y 20.');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================
// Property: Invalid class type is rejected
// Validates: Requirement 3.4
// ============================================================
describe('Preservation: Invalid class type rejection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAdminSession();
  });

  it('PROPERTY: For all invalid class types, result is { success: false, error: "Tipo de clase no válido." }', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate future date (valid)
        fc.integer({ min: 2, max: 365 }).map((daysAhead) => {
          const date = new Date();
          date.setDate(date.getDate() + daysAhead);
          date.setHours(10, 0, 0, 0);
          return date.toISOString();
        }),
        // Valid capacity
        fc.integer({ min: 1, max: 20 }),
        // Invalid class types: strings that are NOT 'yoga', 'mat_pilates', or 'barre'
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          (s) => !['yoga', 'mat_pilates', 'barre'].includes(s)
        ),
        fc.uuid(),
        async (futureDate, capacity, invalidClassType, coachId) => {
          vi.clearAllMocks();
          setupAdminSession();

          const formData = makeFormData({
            classDate: futureDate,
            capacity: capacity.toString(),
            classType: invalidClassType,
            coachId,
          });

          const result = await adminCreateClassAction(null, formData);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBe('Tipo de clase no válido.');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================
// Property: Successful creation with valid inputs
// Validates: Requirement 3.1
// ============================================================
describe('Preservation: Successful creation with valid inputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAdminSession();
    setupCoachValidation();
    setupDbInsertSuccess();
  });

  it('PROPERTY: For all valid inputs with successful DB insert, result is { success: true, message: "¡Clase creada exitosamente!" }', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate future date (at least 2 days ahead to avoid edge cases)
        fc.integer({ min: 2, max: 365 }).map((daysAhead) => {
          const date = new Date();
          date.setDate(date.getDate() + daysAhead);
          date.setHours(10, 0, 0, 0);
          return date.toISOString();
        }),
        // Valid capacity 1-20
        fc.integer({ min: 1, max: 20 }),
        // Valid class type
        fc.constantFrom('yoga', 'mat_pilates', 'barre'),
        // Valid coach UUID
        fc.uuid(),
        async (futureDate, capacity, classType, coachId) => {
          vi.clearAllMocks();
          setupAdminSession();

          // Mock coach validation with the generated coachId
          (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: coachId,
            role: 'coach',
            deletedAt: null,
            email: 'coach@test.com',
            username: 'TestCoach',
          });

          // Mock db.insert() to succeed
          (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          });

          const formData = makeFormData({
            classDate: futureDate,
            capacity: capacity.toString(),
            classType,
            coachId,
          });

          const result = await adminCreateClassAction(null, formData);

          expect(result).toEqual({
            success: true,
            message: '¡Clase creada exitosamente!',
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});
