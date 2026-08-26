// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { adminCreateClassAction } from '../admin';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

/**
 * Unit Tests for adminCreateClassAction — custom class (personalizada) support
 *
 * Task 3.3: Escribir unit tests para la server action modificada
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 7.2
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────────

/** A future date to use in tests — avoids date validation failures */
const FUTURE_DATE = '2030-01-15T10:00';

/** Creates a FormData with all required fields for a valid class creation */
function createFormData(overrides: Record<string, string> = {}): FormData {
  const defaults: Record<string, string> = {
    classDate: FUTURE_DATE,
    capacity: '10',
    classType: 'personalizada',
    coachId: 'coach-uuid-123',
    customName: 'Mi Clase Especial',
  };

  const merged = { ...defaults, ...overrides };
  const formData = new FormData();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null) {
      formData.set(key, value);
    }
  }
  return formData;
}

/** Mocks admin session and valid coach */
function setupValidMocks() {
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    sub: 'admin-uuid',
    role: 'admin',
    email: 'admin@test.com',
  });

  (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    id: 'coach-uuid-123',
    role: 'coach',
    deletedAt: null,
    email: 'coach@test.com',
    username: 'Coach Test',
  });
}

/** Captures the values passed to db.insert().values() */
let capturedInsertValues: Record<string, unknown> | null = null;

function setupInsertMock() {
  capturedInsertValues = null;
  const mockValues = vi.fn().mockImplementation((values: Record<string, unknown>) => {
    capturedInsertValues = values;
    return Promise.resolve();
  });
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });
}

// ─── Test Suite ──────────────────────────────────────────────────────────────────

describe('adminCreateClassAction — unit tests (custom class support)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedInsertValues = null;
    setupInsertMock();
  });

  // ─── Custom Class (personalizada) Tests ─────────────────────────────────────

  describe('Clase personalizada — nombre válido', () => {
    it('creates class with valid custom name → success + custom_name stored', async () => {
      setupValidMocks();
      const formData = createFormData({
        classType: 'personalizada',
        customName: 'Pilates Avanzado',
      });

      const result = await adminCreateClassAction(null, formData);

      expect(result.success).toBe(true);
      expect(capturedInsertValues).not.toBeNull();
      expect(capturedInsertValues!.classType).toBe('personalizada');
      expect(capturedInsertValues!.customName).toBe('Pilates Avanzado');
    });

    it('trims whitespace from custom name before storing', async () => {
      setupValidMocks();
      const formData = createFormData({
        classType: 'personalizada',
        customName: '  Mi Clase Trim  ',
      });

      const result = await adminCreateClassAction(null, formData);

      expect(result.success).toBe(true);
      expect(capturedInsertValues!.customName).toBe('Mi Clase Trim');
    });

    it('accepts custom name with exactly 100 characters → success', async () => {
      setupValidMocks();
      const name100 = 'A'.repeat(100);
      const formData = createFormData({
        classType: 'personalizada',
        customName: name100,
      });

      const result = await adminCreateClassAction(null, formData);

      expect(result.success).toBe(true);
      expect(capturedInsertValues!.customName).toBe(name100);
    });
  });

  describe('Clase personalizada — validación de nombre', () => {
    it('rejects empty custom name → specific error', async () => {
      (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        sub: 'admin-uuid',
        role: 'admin',
        email: 'admin@test.com',
      });

      const formData = createFormData({
        classType: 'personalizada',
        customName: '',
      });

      const result = await adminCreateClassAction(null, formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('El nombre de la clase personalizada es obligatorio.');
        expect(result.field).toBe('customName');
      }
    });

    it('rejects whitespace-only custom name → specific error', async () => {
      (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        sub: 'admin-uuid',
        role: 'admin',
        email: 'admin@test.com',
      });

      const formData = createFormData({
        classType: 'personalizada',
        customName: '   \t  \n  ',
      });

      const result = await adminCreateClassAction(null, formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('El nombre de la clase personalizada es obligatorio.');
        expect(result.field).toBe('customName');
      }
    });

    it('rejects custom name exceeding 100 characters → specific error', async () => {
      (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        sub: 'admin-uuid',
        role: 'admin',
        email: 'admin@test.com',
      });

      const name101 = 'B'.repeat(101);
      const formData = createFormData({
        classType: 'personalizada',
        customName: name101,
      });

      const result = await adminCreateClassAction(null, formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('El nombre no puede exceder 100 caracteres.');
        expect(result.field).toBe('customName');
      }
    });
  });

  describe('Tipo predefinido con customName en FormData → custom_name = null', () => {
    it('stores null for custom_name when type is yoga even if customName is provided', async () => {
      setupValidMocks();
      const formData = createFormData({
        classType: 'yoga',
        customName: 'Should Be Ignored',
      });

      const result = await adminCreateClassAction(null, formData);

      expect(result.success).toBe(true);
      expect(capturedInsertValues!.classType).toBe('yoga');
      expect(capturedInsertValues!.customName).toBeNull();
    });

    it('stores null for custom_name when type is mat_pilates', async () => {
      setupValidMocks();
      const formData = createFormData({
        classType: 'mat_pilates',
        customName: 'Ignored Name',
      });

      const result = await adminCreateClassAction(null, formData);

      expect(result.success).toBe(true);
      expect(capturedInsertValues!.customName).toBeNull();
    });

    it('stores null for custom_name when type is barre', async () => {
      setupValidMocks();
      const formData = createFormData({
        classType: 'barre',
        customName: 'Another Ignored',
      });

      const result = await adminCreateClassAction(null, formData);

      expect(result.success).toBe(true);
      expect(capturedInsertValues!.customName).toBeNull();
    });
  });

  // ─── Regression Tests ───────────────────────────────────────────────────────

  describe('Regresión — crear clase yoga sin customName funciona igual que antes', () => {
    it('creates yoga class without customName field → success', async () => {
      setupValidMocks();
      const formData = new FormData();
      formData.set('classDate', FUTURE_DATE);
      formData.set('capacity', '8');
      formData.set('classType', 'yoga');
      formData.set('coachId', 'coach-uuid-123');
      // No customName field at all

      const result = await adminCreateClassAction(null, formData);

      expect(result.success).toBe(true);
      expect(capturedInsertValues!.classType).toBe('yoga');
      expect(capturedInsertValues!.customName).toBeNull();
      expect(capturedInsertValues!.capacity).toBe(8);
      expect(capturedInsertValues!.status).toBe('scheduled');
      expect(capturedInsertValues!.available).toBe('available');
    });
  });

  // ─── Property 6: Existing validations preserved for all class types ─────────

  describe('Property 6: Existing validations preserved for all class types', () => {
    /**
     * **Validates: Requirements 7.2**
     *
     * For any class type (including 'personalizada'), the server action SHALL enforce:
     * - date must be in the future
     * - capacity must be between 1 and 20
     * - coach must exist with role 'coach' or 'admin'
     * - requesting user must have role 'admin'
     */

    describe('Date validation applies to all class types', () => {
      it('rejects past date for personalizada type', async () => {
        (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          sub: 'admin-uuid',
          role: 'admin',
          email: 'admin@test.com',
        });

        const formData = createFormData({
          classType: 'personalizada',
          customName: 'Valid Name',
          classDate: '2020-01-01T10:00',
        });

        const result = await adminCreateClassAction(null, formData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('La fecha debe ser en el futuro.');
          expect(result.field).toBe('classDate');
        }
      });

      it('rejects past date for yoga type', async () => {
        (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          sub: 'admin-uuid',
          role: 'admin',
          email: 'admin@test.com',
        });

        const formData = createFormData({
          classType: 'yoga',
          classDate: '2020-01-01T10:00',
        });

        const result = await adminCreateClassAction(null, formData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('La fecha debe ser en el futuro.');
          expect(result.field).toBe('classDate');
        }
      });
    });

    describe('Capacity validation applies to all class types', () => {
      it('rejects capacity 0 for personalizada type', async () => {
        (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          sub: 'admin-uuid',
          role: 'admin',
          email: 'admin@test.com',
        });

        const formData = createFormData({
          classType: 'personalizada',
          customName: 'Valid Name',
          capacity: '0',
        });

        const result = await adminCreateClassAction(null, formData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('La capacidad debe ser entre 1 y 20.');
          expect(result.field).toBe('capacity');
        }
      });

      it('rejects capacity 21 for mat_pilates type', async () => {
        (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          sub: 'admin-uuid',
          role: 'admin',
          email: 'admin@test.com',
        });

        const formData = createFormData({
          classType: 'mat_pilates',
          capacity: '21',
        });

        const result = await adminCreateClassAction(null, formData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('La capacidad debe ser entre 1 y 20.');
          expect(result.field).toBe('capacity');
        }
      });

      it('rejects non-numeric capacity for barre type', async () => {
        (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          sub: 'admin-uuid',
          role: 'admin',
          email: 'admin@test.com',
        });

        const formData = createFormData({
          classType: 'barre',
          capacity: 'abc',
        });

        const result = await adminCreateClassAction(null, formData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('La capacidad debe ser entre 1 y 20.');
          expect(result.field).toBe('capacity');
        }
      });
    });

    describe('Coach validation applies to all class types', () => {
      it('rejects missing coachId for personalizada type', async () => {
        (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          sub: 'admin-uuid',
          role: 'admin',
          email: 'admin@test.com',
        });

        const formData = createFormData({
          classType: 'personalizada',
          customName: 'Valid Name',
        });
        formData.delete('coachId');

        const result = await adminCreateClassAction(null, formData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('Debes seleccionar un coach.');
          expect(result.field).toBe('coachId');
        }
      });

      it('rejects non-existent coach for personalizada type', async () => {
        (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          sub: 'admin-uuid',
          role: 'admin',
          email: 'admin@test.com',
        });

        // Coach not found in DB
        (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

        const formData = createFormData({
          classType: 'personalizada',
          customName: 'Valid Name',
          coachId: 'non-existent-id',
        });

        const result = await adminCreateClassAction(null, formData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('Coach no válido.');
          expect(result.field).toBe('coachId');
        }
      });

      it('rejects deleted coach for yoga type', async () => {
        (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          sub: 'admin-uuid',
          role: 'admin',
          email: 'admin@test.com',
        });

        // Coach is deleted
        (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          id: 'coach-uuid-123',
          role: 'coach',
          deletedAt: new Date(),
          email: 'coach@test.com',
          username: 'Deleted Coach',
        });

        const formData = createFormData({
          classType: 'yoga',
          coachId: 'coach-uuid-123',
        });

        const result = await adminCreateClassAction(null, formData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('Coach no válido.');
          expect(result.field).toBe('coachId');
        }
      });

      it('rejects coach with client role for barre type', async () => {
        (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          sub: 'admin-uuid',
          role: 'admin',
          email: 'admin@test.com',
        });

        // User has 'client' role, not coach/admin
        (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          id: 'user-uuid',
          role: 'client',
          deletedAt: null,
          email: 'client@test.com',
          username: 'Client User',
        });

        const formData = createFormData({
          classType: 'barre',
          coachId: 'user-uuid',
        });

        const result = await adminCreateClassAction(null, formData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('Coach no válido.');
          expect(result.field).toBe('coachId');
        }
      });
    });

    describe('Admin permission required for all class types', () => {
      it('rejects non-admin user for personalizada type', async () => {
        (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          sub: 'client-uuid',
          role: 'client',
          email: 'client@test.com',
        });

        const formData = createFormData({
          classType: 'personalizada',
          customName: 'Valid Name',
        });

        const result = await adminCreateClassAction(null, formData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('No tienes permisos para esta acción.');
        }
      });

      it('rejects no session for yoga type', async () => {
        (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

        const formData = createFormData({ classType: 'yoga' });

        const result = await adminCreateClassAction(null, formData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('No tienes permisos para esta acción.');
        }
      });
    });
  });
});
