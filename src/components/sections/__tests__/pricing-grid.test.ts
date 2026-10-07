// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getPricingGridClass } from '../pricing-grid';

/** Cuadrícula según la cantidad de paquetes (SPEC-SPECIAL-PACKAGES §9). */
describe('getPricingGridClass', () => {
  it.each([
    [1, 'grid grid-cols-1 gap-6 max-w-sm mx-auto'],
    [2, 'grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto'],
    [3, 'grid grid-cols-1 md:grid-cols-3 gap-6'],
    [4, 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'],
    [5, 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6'], // igual que hoy
    [6, 'grid grid-cols-1 md:grid-cols-3 gap-6'],
    [7, 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6'],
    [12, 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6'],
  ])('%i paquetes → %s', (count, expected) => {
    expect(getPricingGridClass(count)).toBe(expected);
  });
});
