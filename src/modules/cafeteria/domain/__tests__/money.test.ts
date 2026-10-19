import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { centsToInput, formatPesos, MAX_AMOUNT_CENTS, parsePesos, sumCents } from '../money';

/** Dinero en centavos (SPEC-CAFETERIA D4, TASK-CF-DOM-01). */

describe('parsePesos', () => {
  it.each([
    ['42.5', 4250],
    ['42.50', 4250],
    ['42', 4200],
    ['0.05', 5],
    ['  $1,250.00 ', 125000],
    ['10000', 1_000_000],
  ])('%j → %i', (input, cents) => {
    expect(parsePesos(input)).toEqual({ ok: true, cents });
  });

  it.each([
    ['42.555', 'Usa máximo 2 decimales.'],
    ['-1', 'El monto no puede ser negativo.'],
    ['', 'Escribe un monto.'],
    ['abc', 'Escribe un monto válido, por ejemplo 42.50.'],
    ['10000.01', 'El monto máximo es $10,000.00.'],
    ['1e3', 'Escribe un monto válido, por ejemplo 42.50.'],
  ])('rechaza %j', (input, error) => {
    expect(parsePesos(input)).toEqual({ ok: false, error });
  });

  it('acepta un tope mayor para montos de caja', () => {
    expect(parsePesos('25,000.00', { max: MAX_AMOUNT_CENTS })).toEqual({ ok: true, cents: 2_500_000 });
  });
});

describe('formatPesos', () => {
  it.each([
    [4250, '$42.50'],
    [500000, '$5,000.00'],
    [5, '$0.05'],
    [0, '$0.00'],
    [123456789, '$1,234,567.89'],
    [-150, '-$1.50'],
  ])('%i → %s', (cents, text) => {
    expect(formatPesos(cents)).toBe(text);
  });

  it('centsToInput da el texto editable', () => {
    expect(centsToInput(4250)).toBe('42.50');
    expect(centsToInput(5)).toBe('0.05');
  });
});

describe('propiedades', () => {
  it('parsePesos(formatPesos(n)) devuelve n', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_AMOUNT_CENTS }), (cents) => {
        expect(parsePesos(formatPesos(cents), { max: MAX_AMOUNT_CENTS })).toEqual({ ok: true, cents });
        expect(parsePesos(centsToInput(cents), { max: MAX_AMOUNT_CENTS })).toEqual({ ok: true, cents });
      })
    );
  });

  it('la suma en centavos es exacta (0.10 + 0.20 = 0.30)', () => {
    expect(sumCents([10, 20])).toBe(30);
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1_000_000 }), { maxLength: 50 }), (values) => {
        const total = sumCents(values);
        expect(Number.isInteger(total)).toBe(true);
        expect(total).toBe(values.reduce((a, b) => a + b, 0));
      })
    );
  });
});
