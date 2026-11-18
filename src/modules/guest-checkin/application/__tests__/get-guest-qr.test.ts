import { describe, it, expect } from 'vitest';
import { getGuestCheckinQr } from '../use-cases/get-guest-qr';
import { closeUnattendedGuests } from '../use-cases/close-unattended';
import { guestRow, inMemoryDeps, TOKEN } from './in-memory';

const admin = { id: 'admin-1', role: 'admin' as const };

describe('getGuestCheckinQr', () => {
  it('el admin obtiene el QR con la URL de check-in, y es el mismo en cada llamada (D2)', async () => {
    const { deps } = inMemoryDeps([guestRow()]);
    const first = await getGuestCheckinQr({ guestEnrollmentId: 'guest-1', actor: admin }, deps);
    const second = await getGuestCheckinQr({ guestEnrollmentId: 'guest-1', actor: admin }, deps);

    expect(first).toEqual({
      ok: true,
      data: {
        guestEnrollmentId: 'guest-1',
        guestName: 'María López',
        className: 'Mat Pilates',
        classDate: '2026-11-20T15:00:00.000Z',
        qrDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`https://app.test/check-in?token=${TOKEN}`)}`,
      },
    });
    expect(second).toEqual(first);
  });

  it.each([
    ['coach', { id: 'coach-1', role: 'coach' as const }],
    ['client', { id: 'c', role: 'client' as const }],
    ['sin sesión', null],
  ])('%s → FORBIDDEN', async (_label, actor) => {
    const { deps } = inMemoryDeps([guestRow()]);
    expect(await getGuestCheckinQr({ guestEnrollmentId: 'guest-1', actor }, deps)).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it.each([
    ['no existe', 'missing', guestRow()],
    ['invitado de cliente', 'guest-1', guestRow({ origin: 'user', checkinToken: null })],
    ['ya asistió', 'guest-1', guestRow({ status: 'attended', checkinToken: null })],
    ['cancelado', 'guest-1', guestRow({ status: 'cancelled' })],
    ['anterior a la función (sin token)', 'guest-1', guestRow({ checkinToken: null })],
  ])('%s → GUEST_QR_NOT_AVAILABLE', async (_label, id, row) => {
    const { deps } = inMemoryDeps([row]);
    expect(await getGuestCheckinQr({ guestEnrollmentId: id, actor: admin }, deps)).toEqual({
      ok: false,
      code: 'GUEST_QR_NOT_AVAILABLE',
    });
  });
});

describe('closeUnattendedGuests', () => {
  it('cierra desde autoCloseFrom hasta las 00:00 CDMX de hoy y devuelve el conteo', async () => {
    const { deps, calls } = inMemoryDeps([]);
    expect(await closeUnattendedGuests(deps)).toBe(3);
    expect(calls.autoClose).toEqual([
      {
        from: new Date('2026-11-18T00:00:00.000-06:00'),
        cutoff: new Date('2026-11-20T00:00:00.000-06:00'),
      },
    ]);
  });
});
