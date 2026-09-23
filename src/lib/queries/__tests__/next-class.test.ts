// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const mocks = vi.hoisted(() => ({ rows: [] as unknown[], where: vi.fn(), ensure: vi.fn() }));

vi.mock('@/db', () => {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: mocks.where,
    orderBy: vi.fn(),
    limit: vi.fn(async () => mocks.rows),
  };
  for (const method of ['from', 'innerJoin', 'leftJoin', 'orderBy'] as const) {
    chain[method].mockReturnValue(chain);
  }
  mocks.where.mockReturnValue(chain);
  return { db: { select: vi.fn(() => chain) } };
});
vi.mock('@/lib/checkin/ensure-token', () => ({ ensureCheckinToken: mocks.ensure }));

import { getNextClassCutoff, getNextClassWithCheckin } from '@/lib/queries/next-class';

const NOW = new Date('2026-09-22T09:20:00.000-06:00');
const TOKEN = 'a'.repeat(64);

function nextClassRow(overrides: Record<string, unknown> = {}) {
  return {
    enrollmentId: 'enrollment-1',
    classDate: new Date('2026-09-22T09:00:00.000-06:00'),
    classType: 'mat_pilates',
    customName: null,
    coachName: 'Coach Ana',
    checkinToken: TOKEN,
    ...overrides,
  };
}

describe('getNextClassCutoff (D3)', () => {
  it('incluye la clase en curso hasta que termina (now − 50 min)', () => {
    expect(getNextClassCutoff(NOW)).toEqual(new Date('2026-09-22T08:30:00.000-06:00'));
  });
});

describe('getNextClassWithCheckin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.mx');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.rows = [];
  });

  it('filtra por el usuario, reservas pending y clases no terminadas', async () => {
    await getNextClassWithCheckin('user-1', NOW);
    const { sql, params } = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0] as SQL);
    expect(sql).toContain('"user_suscriptions"."user_id" = $1');
    expect(sql).toContain('"class_enrolleds"."status" = $2');
    expect(sql).toContain('"open_class"."class_date" > $4');
    expect(params).toEqual(
      expect.arrayContaining(['user-1', 'pending', 'scheduled', getNextClassCutoff(NOW).toISOString()])
    );
  });

  it('sin próxima clase devuelve null y no genera tokens', async () => {
    await expect(getNextClassWithCheckin('user-1', NOW)).resolves.toBeNull();
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('con token existente arma el QR sin llamar a ensureCheckinToken', async () => {
    mocks.rows = [nextClassRow()];

    const result = await getNextClassWithCheckin('user-1', NOW);

    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(result?.checkin?.qrDataUrl.startsWith('data:image/svg+xml')).toBe(true);
    expect(result).not.toHaveProperty('checkinToken'); // el token no viaja suelto al cliente
  });

  it('sin token usa el fallback ensureCheckinToken', async () => {
    mocks.rows = [nextClassRow({ checkinToken: null })];
    mocks.ensure.mockResolvedValue(TOKEN);

    const result = await getNextClassWithCheckin('user-1', NOW);

    expect(mocks.ensure).toHaveBeenCalledWith('enrollment-1');
    expect(result?.checkin).not.toBeNull();
  });

  it('fail-soft: si el fallback falla, la clase se muestra sin QR', async () => {
    mocks.rows = [nextClassRow({ checkinToken: null })];
    mocks.ensure.mockRejectedValue(new Error('db down'));

    const result = await getNextClassWithCheckin('user-1', NOW);

    expect(result).toMatchObject({ enrollmentId: 'enrollment-1', checkin: null });
  });

  it('fail-soft: sin NEXT_PUBLIC_APP_URL no hay QR', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    mocks.rows = [nextClassRow()];
    await expect(getNextClassWithCheckin('user-1', NOW)).resolves.toMatchObject({ checkin: null });
  });
});
