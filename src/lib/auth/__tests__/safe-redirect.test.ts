// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';

describe('safeRedirectPath', () => {
  it.each([
    `/check-in?token=${'a'.repeat(64)}`,
    '/coach',
    '/admin/attendance',
  ])('acepta la ruta interna %s', (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    ['protocol-relative', '//evil.com'],
    ['URL absoluta', 'https://evil.com'],
    ['backslash', '/\\evil.com'],
    ['javascript:', 'javascript:alert(1)'],
    ['CRLF', '/coach\r\nLocation: https://evil.com'],
    ['tab', '/coach\tx'],
    ['vacío', ''],
    ['null', null],
    ['undefined', undefined],
    ['objeto', { toString: (): string => '/coach' }],
    ['demasiado largo', `/${'a'.repeat(512)}`],
  ])('rechaza %s', (_label, value) => {
    expect(safeRedirectPath(value)).toBeNull();
  });

  it('propiedad: el resultado es null o una ruta interna (sin // ni /\\)', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.webUrl(), fc.webPath()), (value) => {
        const result = safeRedirectPath(value);
        if (result === null) return true;
        return result.startsWith('/') && !result.startsWith('//') && !result.startsWith('/\\');
      })
    );
  });
});
