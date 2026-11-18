// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findById: vi.fn() }));
vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/lib/auth/session', () => ({ getSession: mocks.getSession }));
vi.mock('../../infrastructure/drizzle-guest-checkin-repository', () => ({
  drizzleGuestCheckinUnitOfWork: { run: vi.fn() },
  drizzleGuestAutoClose: { markUnattendedAbsent: vi.fn() },
  drizzleGuestQrReader: { findById: mocks.findById },
}));

import { getGuestCheckinQrAction } from '../actions/get-guest-qr';

const TOKEN = 'c'.repeat(64);
const guest = {
  guestEnrollmentId: 'g1',
  guestName: 'María López',
  origin: 'admin',
  status: 'pending',
  checkinToken: TOKEN,
  classType: 'mat_pilates',
  customName: null,
  classDate: new Date('2026-11-20T09:00:00.000-06:00'),
};

describe('getGuestCheckinQrAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.test';
  });

  it.each([null, { sub: 'c1', role: 'client' }, { sub: 'k1', role: 'coach' }])(
    'rechaza sin consultar la BD si la sesión no es admin (%o)',
    async (session) => {
      mocks.getSession.mockResolvedValue(session);
      await expect(getGuestCheckinQrAction('g1')).resolves.toEqual({
        success: false,
        error: 'No tienes permisos para esta acción.',
      });
      expect(mocks.findById).not.toHaveBeenCalled();
    }
  );

  it('devuelve el QR SVG con la URL de check-in del invitado', async () => {
    mocks.getSession.mockResolvedValue({ sub: 'a1', role: 'admin' });
    mocks.findById.mockResolvedValue(guest);

    const result = await getGuestCheckinQrAction('g1');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({ guestEnrollmentId: 'g1', guestName: 'María López', className: 'Mat Pilates' });
    expect(result.data.qrDataUrl.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(result.data.qrDataUrl)).toContain('<svg');
  });

  it('un invitado sin QR disponible responde con un mensaje genérico', async () => {
    mocks.getSession.mockResolvedValue({ sub: 'a1', role: 'admin' });
    mocks.findById.mockResolvedValue({ ...guest, origin: 'user', checkinToken: null });
    await expect(getGuestCheckinQrAction('g1')).resolves.toEqual({
      success: false,
      error: 'Este invitado no tiene un QR disponible.',
    });
  });

  it('un error inesperado no expone detalles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getSession.mockResolvedValue({ sub: 'a1', role: 'admin' });
    mocks.findById.mockRejectedValue(new Error('db down'));
    await expect(getGuestCheckinQrAction('g1')).resolves.toEqual({
      success: false,
      error: 'No pudimos generar el código QR. Intenta de nuevo.',
    });
  });
});
