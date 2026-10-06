// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    query: { users: { findFirst: vi.fn() } },
    insert: vi.fn(),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/email/service', () => ({
  sendClassCancellationEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentRejectedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { createClassAction } from '../coach';
import { adminCreateClassAction } from '../admin';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';

/**
 * Sculpt: coach y admin pueden abrirla; «personalizada» sigue siendo solo de admin.
 * La validación vive en el servidor, no solo en el selector del formulario.
 */

const FUTURE_DATE = '2030-01-15T10:00';

const mockValues = vi.fn().mockResolvedValue(undefined);

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function sessionAs(role: 'admin' | 'coach' | 'client') {
  vi.mocked(getSession).mockResolvedValue({ sub: `${role}-uuid`, role, email: `${role}@test.com` } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.insert).mockReturnValue({ values: mockValues } as never);
  vi.mocked(db.query.users.findFirst).mockResolvedValue({
    id: 'coach-uuid',
    role: 'coach',
    deletedAt: null,
  } as never);
});

describe('createClassAction (formulario de coach)', () => {
  it('coach crea una clase Sculpt', async () => {
    sessionAs('coach');

    const result = await createClassAction(null, formData({ classDate: FUTURE_DATE, capacity: '8', classType: 'sculpt' }));

    expect(result.success).toBe(true);
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ classType: 'sculpt', coachUserId: 'coach-uuid' }));
  });

  it.each(['coach', 'admin'] as const)('%s no puede crear una personalizada desde este formulario', async (role) => {
    sessionAs(role);

    const result = await createClassAction(
      null,
      formData({ classDate: FUTURE_DATE, capacity: '8', classType: 'personalizada', customName: 'Hack' })
    );

    expect(result).toEqual({
      success: false,
      error: 'Solo un administrador puede crear clases personalizadas.',
      field: 'classType',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each(['Sculpt', 'pilates', ''])('rechaza el tipo desconocido %j', async (classType) => {
    sessionAs('coach');

    const result = await createClassAction(null, formData({ classDate: FUTURE_DATE, capacity: '8', classType }));

    expect(result).toMatchObject({ success: false, field: 'classType' });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('client no puede crear clases aunque envíe sculpt', async () => {
    sessionAs('client');

    const result = await createClassAction(null, formData({ classDate: FUTURE_DATE, capacity: '8', classType: 'sculpt' }));

    expect(result.success).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('adminCreateClassAction', () => {
  it('admin crea una clase Sculpt sin custom_name', async () => {
    sessionAs('admin');

    const result = await adminCreateClassAction(
      null,
      formData({ classDate: FUTURE_DATE, capacity: '10', classType: 'sculpt', coachId: 'coach-uuid', customName: 'X' })
    );

    expect(result.success).toBe(true);
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ classType: 'sculpt', customName: null }));
  });

  it('admin sigue pudiendo crear personalizadas', async () => {
    sessionAs('admin');

    const result = await adminCreateClassAction(
      null,
      formData({ classDate: FUTURE_DATE, capacity: '10', classType: 'personalizada', coachId: 'coach-uuid', customName: 'Stretch' })
    );

    expect(result.success).toBe(true);
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ classType: 'personalizada', customName: 'Stretch' }));
  });

  it('coach no puede usar la acción de admin', async () => {
    sessionAs('coach');

    const result = await adminCreateClassAction(
      null,
      formData({ classDate: FUTURE_DATE, capacity: '10', classType: 'personalizada', coachId: 'coach-uuid', customName: 'X' })
    );

    expect(result).toEqual({ success: false, error: 'No tienes permisos para esta acción.' });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
