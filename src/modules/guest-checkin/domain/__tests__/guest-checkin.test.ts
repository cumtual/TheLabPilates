import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluateGuestCheckin, type GuestCheckinCandidate } from '../guest-checkin';
import { canViewGuestQr } from '../guest-qr-policy';
import { guestAttendanceTransition } from '../guest-attendance';
import { GUEST_CHECKIN_TOKEN_REGEX, isWellFormedCheckinToken } from '../token';
import type { Actor, ActorRole, ClassStatus, GuestEnrollmentStatus } from '../types';
import type { GuestCheckinErrorCode } from '../errors';
import { CHECKIN_TOKEN_REGEX } from '@/lib/checkin/constants';
import type { CheckinErrorCode } from '@/lib/checkin/errors';

const COACH_ID = 'coach-1';

function candidate(overrides: Partial<GuestCheckinCandidate> = {}): GuestCheckinCandidate {
  return {
    guestEnrollmentId: 'guest-1',
    status: 'pending',
    guestName: 'María López',
    invitedByName: 'Admin Studio',
    classDate: new Date('2026-11-20T09:00:00.000-06:00'),
    classStatus: 'scheduled',
    coachUserId: COACH_ID,
    classType: 'mat_pilates',
    customName: null,
    ...overrides,
  };
}

const admin: Actor = { id: 'admin-1', role: 'admin' };
const titularCoach: Actor = { id: COACH_ID, role: 'coach' };
const otherCoach: Actor = { id: 'coach-2', role: 'coach' };

describe('evaluateGuestCheckin', () => {
  it('acepta al admin y al coach titular con invitado pending el día de la clase', () => {
    for (const actor of [admin, titularCoach]) {
      expect(evaluateGuestCheckin({ candidate: candidate(), actor, isWithinAttendanceWindow: true })).toEqual({ ok: true });
    }
  });

  it('rechaza a un coach que no es titular antes de revelar cualquier estado', () => {
    const result = evaluateGuestCheckin({
      candidate: candidate({ status: 'attended', classStatus: 'cancelled' }),
      actor: otherCoach,
      isWithinAttendanceWindow: false,
    });
    expect(result).toEqual({ ok: false, code: 'NOT_CLASS_COACH' });
  });

  it.each<ActorRole>(['client', 'barra'])('rechaza el rol %s', (role) => {
    const result = evaluateGuestCheckin({ candidate: candidate(), actor: { id: 'x', role }, isWithinAttendanceWindow: true });
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN_ROLE' });
  });

  it('evalúa estado → clase cancelada → ventana, en ese orden', () => {
    expect(
      evaluateGuestCheckin({ candidate: candidate({ status: 'attended', classStatus: 'cancelled' }), actor: admin, isWithinAttendanceWindow: false })
    ).toEqual({ ok: false, code: 'ENROLLMENT_NOT_PENDING', details: { status: 'attended' } });
    expect(
      evaluateGuestCheckin({ candidate: candidate({ classStatus: 'cancelled' }), actor: admin, isWithinAttendanceWindow: false })
    ).toEqual({ ok: false, code: 'CLASS_CANCELLED' });
    expect(evaluateGuestCheckin({ candidate: candidate(), actor: admin, isWithinAttendanceWindow: false })).toEqual({
      ok: false,
      code: 'OUTSIDE_ATTENDANCE_WINDOW',
      details: { classDate: '2026-11-20T15:00:00.000Z' },
    });
  });

  it('propiedad: solo es ok con actor autorizado, pending, clase no cancelada y ventana abierta', () => {
    const roles: ActorRole[] = ['client', 'coach', 'admin', 'barra'];
    const statuses: (GuestEnrollmentStatus | null)[] = ['pending', 'attended', 'absent', 'late_cancelled', 'cancelled', null];
    const classStatuses: (ClassStatus | null)[] = ['scheduled', 'cancelled', 'completed', null];
    fc.assert(
      fc.property(
        fc.constantFrom(...roles),
        fc.boolean(),
        fc.constantFrom(...statuses),
        fc.constantFrom(...classStatuses),
        fc.boolean(),
        (role, isTitular, status, classStatus, windowOpen) => {
          const actor: Actor = { id: isTitular ? COACH_ID : 'someone', role };
          const result = evaluateGuestCheckin({
            candidate: candidate({ status, classStatus }),
            actor,
            isWithinAttendanceWindow: windowOpen,
          });
          const authorized = role === 'admin' || (role === 'coach' && isTitular);
          const expected = authorized && status === 'pending' && classStatus !== 'cancelled' && windowOpen;
          expect(result.ok).toBe(expected);
        }
      )
    );
  });
});

describe('canViewGuestQr (GI-7)', () => {
  const subject = { origin: 'admin' as const, status: 'pending' as const, checkinToken: 'a'.repeat(64) };

  it('el admin ve el QR de un invitado de admin pending con token', () => {
    expect(canViewGuestQr(admin, subject)).toBe(true);
  });

  it.each([
    ['sin sesión', null, subject],
    ['coach', titularCoach, subject],
    ['client', { id: 'c', role: 'client' } as Actor, subject],
    ['invitado de cliente', admin, { ...subject, origin: 'user' as const }],
    ['ya asistió', admin, { ...subject, status: 'attended' as const }],
    ['cancelado', admin, { ...subject, status: 'cancelled' as const }],
    ['sin token (anterior a la función)', admin, { ...subject, checkinToken: null }],
  ])('rechaza: %s', (_label, actor, value) => {
    expect(canViewGuestQr(actor, value)).toBe(false);
  });
});

describe('guestAttendanceTransition', () => {
  it('attended conserva o fija el check-in, guarda el actor y anula el token', () => {
    expect(guestAttendanceTransition('attended', 'coach-1')).toEqual({
      status: 'attended',
      checkIn: 'keep_or_now',
      checkedInBy: 'coach-1',
      clearToken: true,
    });
  });

  it('absent limpia momento y actor y anula el token', () => {
    expect(guestAttendanceTransition('absent', 'coach-1')).toEqual({
      status: 'absent',
      checkIn: 'clear',
      checkedInBy: null,
      clearToken: true,
    });
  });
});

describe('formato del token', () => {
  it('es el mismo regex que el del titular', () => {
    expect(GUEST_CHECKIN_TOKEN_REGEX.source).toBe(CHECKIN_TOKEN_REGEX.source);
  });

  it('valida 64 hex en minúsculas', () => {
    expect(isWellFormedCheckinToken('a'.repeat(64))).toBe(true);
    for (const value of ['', 'A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64), null, 42]) {
      expect(isWellFormedCheckinToken(value)).toBe(false);
    }
  });
});

describe('códigos de error', () => {
  it('GuestCheckinErrorCode es un subconjunto de CheckinErrorCode', () => {
    const assertSubset = (code: GuestCheckinErrorCode): CheckinErrorCode => code;
    expect(assertSubset('TOKEN_NOT_FOUND')).toBe('TOKEN_NOT_FOUND');
  });
});
