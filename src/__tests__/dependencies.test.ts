// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

describe('dependencias directas', () => {
  it('zod 4 está declarado en dependencies (validación de paquetes)', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(pkg.dependencies.zod).toMatch(/^\^?4\./);
    expect(z.string().max(49).safeParse('x'.repeat(50)).success).toBe(false);
  });
});
