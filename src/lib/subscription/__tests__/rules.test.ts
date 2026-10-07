// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CLASS_TYPES } from '@/lib/utils/class-type';
import {
  describeBalance,
  explainRejection,
  isBalanceUsableForClass,
  isWithinTimeWindow,
  pickBalanceForClass,
  type BalanceForRules,
} from '../rules';

/** SPEC-SPECIAL-PACKAGES §5.2–§5.4. Horas expresadas en CDMX (UTC-6). */

const at = (hhmm: string) => new Date(`2026-10-08T${hhmm}:00-06:00`);

function balance(overrides: Partial<BalanceForRules> & Pick<BalanceForRules, 'id'>): BalanceForRules {
  return {
    label: null,
    allowedClassTypes: ['yoga'],
    windowStart: null,
    windowEnd: null,
    creditsRemaining: 1,
    creditsTotal: 1,
    sortOrder: 0,
    ...overrides,
  };
}

const A = balance({ id: 'a', allowedClassTypes: ['yoga'], sortOrder: 0 });
const B = balance({ id: 'b', allowedClassTypes: ['mat_pilates', 'barre'], sortOrder: 1 });
const resetPass = (b = B) => [A, b];

describe('isWithinTimeWindow (D1: inclusiva en ambos extremos)', () => {
  const window = { start: '07:00', end: '11:00' };
  it.each([
    ['07:00', true],
    ['11:00', true],
    ['09:30', true],
    ['06:59', false],
    ['11:01', false],
  ])('clase a las %s → %s', (time, expected) => {
    expect(isWithinTimeWindow(at(time), window)).toBe(expected);
  });

  it('sin franja, cualquier hora entra', () => {
    expect(isWithinTimeWindow(at('22:00'), null)).toBe(true);
  });

  it('acepta el formato HH:MM:SS de la columna time', () => {
    expect(isWithinTimeWindow(at('11:00'), { start: '07:00:00', end: '11:00:00' })).toBe(true);
  });
});

describe('isBalanceUsableForClass — disciplina', () => {
  it('un grupo de [yoga] no sirve para barre; uno de [mat_pilates, barre] sirve para ambas', () => {
    expect(isBalanceUsableForClass(A, { classType: 'barre', classDate: at('09:00') })).toBe(false);
    expect(isBalanceUsableForClass(B, { classType: 'barre', classDate: at('09:00') })).toBe(true);
    expect(isBalanceUsableForClass(B, { classType: 'mat_pilates', classDate: at('09:00') })).toBe(true);
  });

  it('un grupo sin saldo nunca sirve', () => {
    expect(isBalanceUsableForClass({ ...A, creditsRemaining: 0 }, { classType: 'yoga', classDate: at('09:00') })).toBe(false);
  });
});

describe('pickBalanceForClass', () => {
  it('Reset Pass: Mat consume B; con B agotado, Mat y Barre no tienen grupo y Yoga usa A', () => {
    expect(pickBalanceForClass(resetPass(), { classType: 'mat_pilates', classDate: at('09:00') })?.id).toBe('b');
    const afterMat = resetPass({ ...B, creditsRemaining: 0 });
    expect(pickBalanceForClass(afterMat, { classType: 'barre', classDate: at('09:00') })).toBeNull();
    expect(pickBalanceForClass(afterMat, { classType: 'mat_pilates', classDate: at('09:00') })).toBeNull();
    expect(pickBalanceForClass(afterMat, { classType: 'yoga', classDate: at('09:00') })?.id).toBe('a');
  });

  it('elige el grupo más restrictivo: menos disciplinas primero', () => {
    const flexible = balance({ id: 'c', allowedClassTypes: ['yoga', 'barre'], sortOrder: -1 });
    expect(pickBalanceForClass([flexible, A], { classType: 'yoga', classDate: at('09:00') })?.id).toBe('a');
  });

  it('a igual número de disciplinas, el grupo con franja va primero', () => {
    const withWindow = balance({ id: 'w', windowStart: '07:00:00', windowEnd: '11:00:00', sortOrder: 5 });
    expect(pickBalanceForClass([A, withWindow], { classType: 'yoga', classDate: at('09:00') })?.id).toBe('w');
    expect(pickBalanceForClass([A, withWindow], { classType: 'yoga', classDate: at('12:00') })?.id).toBe('a');
  });

  const arbBalance = fc.record({
    id: fc.uuid(),
    label: fc.constant(null),
    allowedClassTypes: fc.uniqueArray(fc.constantFrom(...CLASS_TYPES), { minLength: 1, maxLength: 3 }),
    windowStart: fc.option(fc.constantFrom('06:00:00', '07:00:00', '18:00:00'), { nil: null }),
    windowEnd: fc.constant<string | null>(null),
    creditsRemaining: fc.integer({ min: 0, max: 2 }),
    creditsTotal: fc.constant(2),
    sortOrder: fc.integer({ min: 0, max: 5 }),
  }).map((b) => ({ ...b, windowEnd: b.windowStart ? '12:00:00' : null }) as BalanceForRules);
  const arbClass = fc.record({
    classType: fc.constantFrom(...CLASS_TYPES),
    classDate: fc.constantFrom('05:00', '07:00', '09:00', '12:00', '19:00').map(at),
  });

  it('propiedad: si devuelve un grupo es utilizable; si devuelve null ninguno lo es', () => {
    fc.assert(
      fc.property(fc.array(arbBalance, { maxLength: 6 }), arbClass, (balances, cls) => {
        const picked = pickBalanceForClass(balances, cls);
        if (picked) expect(isBalanceUsableForClass(picked, cls)).toBe(true);
        else expect(balances.some((b) => isBalanceUsableForClass(b, cls))).toBe(false);
      }),
      { numRuns: 300 }
    );
  });

  it('propiedad: el resultado no depende del orden de los grupos', () => {
    fc.assert(
      fc.property(fc.array(arbBalance, { maxLength: 6 }), arbClass, fc.integer(), (balances, cls, seed) => {
        const shuffled = [...balances].sort((x, y) => ((x.id.charCodeAt(0) * seed) % 7) - ((y.id.charCodeAt(0) * seed) % 7));
        expect(pickBalanceForClass(shuffled, cls)?.id).toBe(pickBalanceForClass(balances, cls)?.id);
      }),
      { numRuns: 300 }
    );
  });
});

describe('describeBalance', () => {
  it('deriva la etiqueta de las disciplinas y conjuga clase/clases', () => {
    expect(describeBalance(A)).toEqual({ label: 'Yoga', summary: '1 clase de Yoga', timeWindow: null });
    expect(describeBalance({ ...B, creditsRemaining: 2, creditsTotal: 2 }).summary).toBe('2 clases de Mat Pilates / Barre');
  });

  it('respeta la etiqueta capturada y formatea la franja', () => {
    const custom = balance({ id: 'x', label: 'Mañanas de Yoga', windowStart: '07:00:00', windowEnd: '11:00:00' });
    expect(describeBalance(custom)).toEqual({ label: 'Mañanas de Yoga', summary: '1 clase de Mañanas de Yoga', timeWindow: '07:00–11:00' });
  });
});

describe('explainRejection (SPEC §5.4, gana la primera condición)', () => {
  const pkg = 'Reset Pass';

  it('devuelve null si hay grupo utilizable', () => {
    expect(explainRejection(resetPass(), { classType: 'yoga', classDate: at('09:00') }, pkg)).toBeNull();
  });

  it('NO_CREDITS cuando todos los grupos están en 0', () => {
    const empty = [{ ...A, creditsRemaining: 0 }, { ...B, creditsRemaining: 0 }];
    expect(explainRejection(empty, { classType: 'sculpt', classDate: at('09:00') }, pkg)).toEqual({
      code: 'NO_CREDITS',
      message: 'Ya usaste todos los créditos de tu Reset Pass.',
    });
  });

  it('CLASS_TYPE_NOT_INCLUDED cuando ningún grupo incluye la disciplina', () => {
    expect(explainRejection(resetPass(), { classType: 'sculpt', classDate: at('09:00') }, pkg)).toEqual({
      code: 'CLASS_TYPE_NOT_INCLUDED',
      message: 'Tu Reset Pass no incluye clases de Sculpt. Te queda: 1 clase de Yoga, 1 clase de Mat Pilates / Barre.',
    });
  });

  it('OUTSIDE_TIME_WINDOW cuando hay saldo para la disciplina pero no en ese horario', () => {
    const morningYoga = balance({ id: 'm', windowStart: '07:00:00', windowEnd: '11:00:00' });
    expect(explainRejection([morningYoga], { classType: 'yoga', classDate: at('11:01') }, pkg)).toEqual({
      code: 'OUTSIDE_TIME_WINDOW',
      message: 'Tu crédito de Yoga solo aplica a clases que inician entre 07:00 y 11:00.',
    });
  });

  it('GROUP_EXHAUSTED cuando el grupo de la disciplina ya se usó', () => {
    const afterMat = resetPass({ ...B, creditsRemaining: 0 });
    expect(explainRejection(afterMat, { classType: 'barre', classDate: at('09:00') }, pkg)).toEqual({
      code: 'GROUP_EXHAUSTED',
      message: 'Tu Reset Pass ya no incluye clases de Mat Pilates / Barre. Te queda: 1 clase de Yoga.',
    });
  });
});
