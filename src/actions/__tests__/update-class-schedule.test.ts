// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findFirstMock, updateMock, setMock, whereMock } = vi.hoisted(() => {
  const findFirstMock = vi.fn();
  const setMock = vi.fn();
  const whereMock = vi.fn();
  const updateMock = vi.fn();
  return { findFirstMock, updateMock, setMock, whereMock };
});

vi.mock('@/db', () => ({
  db: {
    query: {
      openClasses: {
        findFirst: (...args: unknown[]) => findFirstMock(...args),
      },
    },
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/guest/capacity', () => ({
  getTotalOccupied: vi.fn(),
}));

import { updateClassScheduleAction } from '../coach';
import { getSession } from '@/lib/auth/session';
import { getTotalOccupied } from '@/lib/guest/capacity';

const baseClass = {
  id: 'class-1',
  coachUserId: 'coach-1',
  status: 'scheduled',
  classDate: new Date('2030-01-15T16:00:00Z'),
  capacity: 10,
};

function setSession(role: 'coach' | 'admin', sub: string) {
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    sub,
    role,
    email: `${sub}@test.com`,
  });
}

describe('updateClassScheduleAction — guards de rol, ownership y campos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockReturnValue({ set: setMock });
    setMock.mockReturnValue({ where: whereMock });
    whereMock.mockResolvedValue(undefined);
    findFirstMock.mockResolvedValue({ ...baseClass });
    (getTotalOccupied as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    setSession('coach', 'coach-1');
  });

  it('coach edita su propia clase: solo persiste classDate y capacity', async () => {
    const result = await updateClassScheduleAction('class-1', {
      classDate: '2030-02-01T09:00',
      capacity: '12',
    });

    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = setMock.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(['capacity', 'classDate']);
    expect(payload).not.toHaveProperty('status');
    expect(payload.capacity).toBe(12);
  });

  it('coach NO puede editar la clase de otro coach', async () => {
    findFirstMock.mockResolvedValue({ ...baseClass, coachUserId: 'coach-2' });

    const result = await updateClassScheduleAction('class-1', { capacity: '12' });

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ error: 'No tienes permisos para esta clase.' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('admin puede editar la clase de cualquier coach', async () => {
    setSession('admin', 'admin-1');
    findFirstMock.mockResolvedValue({ ...baseClass, coachUserId: 'coach-2' });

    const result = await updateClassScheduleAction('class-1', { capacity: '12' });

    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('rechaza capacidad menor a los cupos ocupados', async () => {
    (getTotalOccupied as ReturnType<typeof vi.fn>).mockResolvedValue(5);

    const result = await updateClassScheduleAction('class-1', { capacity: '3' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('5');
      expect(result.field).toBe('capacity');
    }
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('permite capacidad igual a los cupos ocupados', async () => {
    (getTotalOccupied as ReturnType<typeof vi.fn>).mockResolvedValue(6);

    const result = await updateClassScheduleAction('class-1', { capacity: '6' });

    expect(result.success).toBe(true);
  });

  it('rechaza payload con status (prohibición de cancelación para coach)', async () => {
    const tamperedPayload = {
      capacity: '12',
      status: 'cancelled',
    } as unknown as { classDate?: string; capacity?: string };

    const result = await updateClassScheduleAction('class-1', tamperedPayload);

    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rechaza fecha en el pasado', async () => {
    const result = await updateClassScheduleAction('class-1', {
      classDate: '2020-01-15T09:00',
    });

    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rechaza editar una clase no programada', async () => {
    findFirstMock.mockResolvedValue({ ...baseClass, status: 'cancelled' });

    const result = await updateClassScheduleAction('class-1', { capacity: '12' });

    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rechaza usuarios no autenticados', async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await updateClassScheduleAction('class-1', { capacity: '12' });

    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
