// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Reserva con invitado en un paquete especial (SPEC-SPECIAL-PACKAGES §5.7, D6). */

vi.mock('@/db', () => ({ db: { select: vi.fn(), transaction: vi.fn(), query: { openClasses: { findFirst: vi.fn() } } } }));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/guest/eligibility', () => ({ isUserOpenLabEligible: vi.fn() }));
vi.mock('@/lib/guest/capacity', () => ({ getAvailableCapacity: vi.fn().mockResolvedValue(5) }));
vi.mock('@/lib/guest/credits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/guest/credits')>()),
  getGuestCreditsForCycle: vi.fn(),
}));
vi.mock('@/lib/subscription/credits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/subscription/credits')>()),
  consumeClassCredit: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }) }));

import { enrollWithGuestAction } from '../guest';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { isUserOpenLabEligible } from '@/lib/guest/eligibility';
import { getGuestCreditsForCycle } from '@/lib/guest/credits';
import { BookingRejectionError, consumeClassCredit } from '@/lib/subscription/credits';

const nameOf = (table: unknown) => (table as Record<symbol, string>)[Symbol.for('drizzle:Name')];
const classDate = new Date('2026-10-09T09:00:00-06:00');
let inserted: { table: string; values: Record<string, unknown> }[];

function special(guestCreditsTotal: number) {
  vi.mocked(isUserOpenLabEligible).mockResolvedValue({
    eligible: true,
    userSubscription: { id: 'us-1', guestCreditsSnapshot: guestCreditsTotal },
    subscription: { guest: false, kind: 'special', name: 'Reset Pass' },
    guestCreditsTotal,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T10:00:00-06:00'));
  inserted = [];
  vi.mocked(getSession).mockResolvedValue({ sub: 'user-1', role: 'client', email: 'c@test.com' } as never);
  vi.mocked(getGuestCreditsForCycle).mockResolvedValue(2);
  vi.mocked(db.query.openClasses.findFirst).mockResolvedValue({ id: 'class-1', status: 'scheduled', capacity: 10, classType: 'yoga', classDate } as never);
  // 1) grupos del paquete (validación previa), 2) duplicados
  vi.mocked(db.select).mockReset();
  vi.mocked(db.select)
    .mockReturnValueOnce({ from: () => ({ where: async () => [{ id: 'A', label: null, allowedClassTypes: ['yoga'], windowStart: null, windowEnd: null, creditsRemaining: 1, creditsTotal: 1, sortOrder: 0 }] }) } as never)
    .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: async () => [] }) }) } as never);
  vi.mocked(db.transaction).mockImplementation((async (cb: (tx: unknown) => unknown) =>
    cb({
      execute: async () => [],
      select: () => ({ from: () => ({ where: async () => [{ count: 0, creditsUsed: 1 }] }) }),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          inserted.push({ table: nameOf(table), values });
          return Object.assign(Promise.resolve(), { returning: async () => [{ id: 'guest-1' }] });
        },
      }),
    })) as never);
});

describe('enrollWithGuestAction — paquete especial', () => {
  it('el titular consume su grupo y el invitado un pase', async () => {
    special(2);
    vi.mocked(consumeClassCredit).mockResolvedValue('A');

    expect(await enrollWithGuestAction('class-1', 'Invitada Uno')).toMatchObject({ success: true });
    expect(consumeClassCredit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'special', isOpenLab: false, userSubscriptionId: 'us-1' }), expect.objectContaining({ classType: 'yoga' }));
    expect(inserted.find((i) => i.table === 'class_enrolleds')?.values).toMatchObject({ balanceId: 'A' });
  });

  it('si el grupo del titular no aplica a la clase, se rechaza con el motivo y sin escribir', async () => {
    special(2);
    vi.mocked(db.query.openClasses.findFirst).mockResolvedValue({ id: 'class-1', status: 'scheduled', capacity: 10, classType: 'barre', classDate } as never);

    expect(await enrollWithGuestAction('class-1', 'Invitada Uno')).toEqual({
      success: false,
      error: 'Tu Reset Pass no incluye clases de Barre. Te queda: 1 clase de Yoga.',
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('un rechazo bajo bloqueo (carrera) devuelve su mensaje', async () => {
    special(2);
    vi.mocked(consumeClassCredit).mockRejectedValue(new BookingRejectionError({ code: 'NO_CREDITS', message: 'Ya usaste todos los créditos de tu Reset Pass.' }));

    expect(await enrollWithGuestAction('class-1', 'Invitada Uno')).toEqual({ success: false, error: 'Ya usaste todos los créditos de tu Reset Pass.' });
  });

  it('sin pases disponibles: mensaje de paquete especial', async () => {
    special(2);
    vi.mocked(getGuestCreditsForCycle).mockResolvedValue(0);

    expect(await enrollWithGuestAction('class-1', 'Invitada Uno')).toEqual({
      success: false,
      error: 'Ya usaste todos los pases de invitado de tu paquete.',
    });
  });
});
