// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db', () => ({ db: {} }));

import { processAnyCheckin } from '@/lib/checkin/resolve-checkin';
import type { CheckinResult } from '@/lib/checkin/process-checkin';
import type { GuestCheckinResult } from '@/modules/guest-checkin/presentation/types';

const actor = { id: 'coach-1', role: 'coach' as const };
const input = { token: 'a'.repeat(64), actor };

const titularOk: CheckinResult = {
  ok: true,
  data: {
    enrollmentId: 'e1',
    studentName: 'Ana',
    className: 'Mat Pilates',
    classDate: '2026-11-20T15:00:00.000Z',
    checkedInAt: '2026-11-20T14:58:00.000Z',
  },
};

const guestOk: GuestCheckinResult = {
  ok: true,
  data: {
    guestEnrollmentId: 'g1',
    guestName: 'María López',
    invitedByName: 'Admin Studio',
    className: 'Mat Pilates',
    classDate: '2026-11-20T15:00:00.000Z',
    checkedInAt: '2026-11-20T14:59:00.000Z',
  },
};

function processors(titular: CheckinResult, guest: GuestCheckinResult = { ok: false, code: 'TOKEN_NOT_FOUND' }) {
  return { titular: vi.fn().mockResolvedValue(titular), guest: vi.fn().mockResolvedValue(guest) };
}

describe('processAnyCheckin', () => {
  it('token del titular → solo consulta al titular y responde subject enrollment', async () => {
    const p = processors(titularOk);
    await expect(processAnyCheckin(input, p)).resolves.toEqual({
      ok: true,
      data: { subject: 'enrollment', ...titularOk.data },
    });
    expect(p.guest).not.toHaveBeenCalled();
  });

  it('TOKEN_NOT_FOUND en titulares → intenta con invitados y normaliza la respuesta', async () => {
    const p = processors({ ok: false, code: 'TOKEN_NOT_FOUND' }, guestOk);
    await expect(processAnyCheckin(input, p)).resolves.toEqual({
      ok: true,
      data: {
        subject: 'guest',
        enrollmentId: 'g1',
        studentName: 'María López',
        invitedByName: 'Admin Studio',
        className: 'Mat Pilates',
        classDate: '2026-11-20T15:00:00.000Z',
        checkedInAt: '2026-11-20T14:59:00.000Z',
      },
    });
    expect(p.guest).toHaveBeenCalledWith(input);
  });

  it('token inexistente en ambos → TOKEN_NOT_FOUND', async () => {
    const p = processors({ ok: false, code: 'TOKEN_NOT_FOUND' });
    await expect(processAnyCheckin(input, p)).resolves.toEqual({ ok: false, code: 'TOKEN_NOT_FOUND' });
  });

  it('los errores del invitado se propagan con sus detalles', async () => {
    const p = processors(
      { ok: false, code: 'TOKEN_NOT_FOUND' },
      { ok: false, code: 'OUTSIDE_ATTENDANCE_WINDOW', details: { classDate: '2026-11-21T15:00:00.000Z' } }
    );
    await expect(processAnyCheckin(input, p)).resolves.toEqual({
      ok: false,
      code: 'OUTSIDE_ATTENDANCE_WINDOW',
      details: { classDate: '2026-11-21T15:00:00.000Z' },
    });
  });

  it.each(['UNAUTHENTICATED', 'FORBIDDEN_ROLE', 'NOT_CLASS_COACH', 'ENROLLMENT_NOT_PENDING', 'CLASS_CANCELLED'] as const)(
    'un error %s del titular no consulta a los invitados',
    async (code) => {
      const p = processors({ ok: false, code });
      await expect(processAnyCheckin(input, p)).resolves.toEqual({ ok: false, code });
      expect(p.guest).not.toHaveBeenCalled();
    }
  );
});
