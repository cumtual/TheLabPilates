// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCheckinUrl, generateCheckinToken, isValidCheckinToken } from '@/lib/checkin/token';
import { CHECKIN_TOKEN_REGEX } from '@/lib/checkin/constants';

describe('generateCheckinToken', () => {
  it('genera 64 caracteres hex en minúsculas', () => {
    expect(generateCheckinToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('genera tokens únicos (10 000 muestras)', () => {
    const tokens = new Set(Array.from({ length: 10_000 }, () => generateCheckinToken()));
    expect(tokens.size).toBe(10_000);
  });
});

describe('isValidCheckinToken', () => {
  it('acepta tokens generados', () => {
    expect(isValidCheckinToken(generateCheckinToken())).toBe(true);
  });

  it.each([
    ['vacío', ''],
    ['null', null],
    ['undefined', undefined],
    ['número', 123],
    ['63 caracteres', 'a'.repeat(63)],
    ['65 caracteres', 'a'.repeat(65)],
    ['hex en mayúsculas', 'A'.repeat(64)],
    ['con espacios', ` ${'a'.repeat(62)} `],
    ['caracteres no hex', 'g'.repeat(64)],
  ])('rechaza %s', (_label, value) => {
    expect(isValidCheckinToken(value)).toBe(false);
  });

  it('propiedad: todo string que no cumple el formato es inválido', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !CHECKIN_TOKEN_REGEX.test(s)),
        (value) => !isValidCheckinToken(value)
      )
    );
  });
});

describe('buildCheckinUrl', () => {
  const token = 'a'.repeat(64);

  it('arma la URL absoluta de check-in', () => {
    expect(buildCheckinUrl(token, 'https://app.mx')).toBe(
      `https://app.mx/check-in?token=${token}`
    );
  });

  it('no duplica la barra cuando la base termina en "/"', () => {
    expect(buildCheckinUrl(token, 'https://app.mx/')).toBe(
      `https://app.mx/check-in?token=${token}`
    );
  });

  it.each([undefined, '', '   '])('lanza un error si la base es %j', (base) => {
    expect(() => buildCheckinUrl(token, base)).toThrow();
  });
});
