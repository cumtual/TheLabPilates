import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { randomUuid } from '../uuid';

afterEach(() => vi.unstubAllGlobals());

describe('randomUuid', () => {
  it('sin crypto.randomUUID (http en la red local) genera un UUID v4 válido y distinto cada vez', () => {
    const real = globalThis.crypto;
    // Contexto no seguro: solo getRandomValues.
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    expect(globalThis.crypto.randomUUID).toBeUndefined();
    const ids = Array.from({ length: 200 }, randomUuid);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(z.uuid().safeParse(id).success).toBe(true);
    }
    expect(new Set(ids).size).toBe(200);
  });

  it('usa crypto.randomUUID cuando existe', () => {
    expect(z.uuid().safeParse(randomUuid()).success).toBe(true);
  });
});
