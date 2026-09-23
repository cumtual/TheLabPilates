// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    update: mocks.update,
    query: { classEnrollments: { findFirst: mocks.findFirst } },
  },
}));

import { ensureCheckinToken } from '@/lib/checkin/ensure-token';

const ENROLLMENT_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN_REGEX = /^[0-9a-f]{64}$/;

function setUpdateChain() {
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ returning: mocks.returning });
}

/** Simula el `RETURNING`: devuelve el token que se intentó escribir. */
function returningWrittenToken() {
  mocks.returning.mockImplementation(async () => {
    const lastSet = mocks.set.mock.calls.at(-1)?.[0] as { checkinToken: string };
    return [{ checkinToken: lastSet.checkinToken }];
  });
}

describe('ensureCheckinToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUpdateChain();
  });

  it('genera y persiste un token para una reserva pending sin token', async () => {
    returningWrittenToken();

    const token = await ensureCheckinToken(ENROLLMENT_ID);

    expect(token).toMatch(TOKEN_REGEX);
    expect(mocks.set).toHaveBeenCalledWith({ checkinToken: token });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('el UPDATE solo aplica a esa reserva, en pending y sin token (seguro ante carreras)', async () => {
    returningWrittenToken();

    await ensureCheckinToken(ENROLLMENT_ID);

    const { sql, params } = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0] as SQL);
    expect(sql).toContain('"class_enrolleds"."id" = $');
    expect(sql).toContain('"class_enrolleds"."status" = $');
    expect(sql).toContain('"class_enrolleds"."checkin_token" is null');
    expect(params).toEqual(expect.arrayContaining([ENROLLMENT_ID, 'pending']));
  });

  it('si otra petición ganó la carrera, devuelve el token existente sin reescribirlo', async () => {
    const existing = 'b'.repeat(64);
    mocks.returning.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue({ checkinToken: existing });

    await expect(ensureCheckinToken(ENROLLMENT_ID)).resolves.toBe(existing);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('devuelve null si la reserva ya no está pending', async () => {
    mocks.returning.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue(undefined);

    await expect(ensureCheckinToken(ENROLLMENT_ID)).resolves.toBeNull();
  });

  it('reintenta una vez ante una colisión del unique (23505)', async () => {
    mocks.returning
      .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))
      .mockImplementationOnce(async () => {
        const lastSet = mocks.set.mock.calls.at(-1)?.[0] as { checkinToken: string };
        return [{ checkinToken: lastSet.checkinToken }];
      });

    const token = await ensureCheckinToken(ENROLLMENT_ID);

    expect(token).toMatch(TOKEN_REGEX);
    expect(mocks.update).toHaveBeenCalledTimes(2);
    const [first, second] = mocks.set.mock.calls.map(([v]) => (v as { checkinToken: string }).checkinToken);
    expect(first).not.toBe(second);
  });

  it('reconoce la colisión envuelta por Drizzle (error.cause.code)', async () => {
    const wrapped = Object.assign(new Error('Failed query'), { cause: { code: '23505' } });
    mocks.returning.mockRejectedValueOnce(wrapped).mockResolvedValueOnce([{ checkinToken: 'c'.repeat(64) }]);

    await expect(ensureCheckinToken(ENROLLMENT_ID)).resolves.toBe('c'.repeat(64));
  });

  it('propaga una segunda colisión y cualquier otro error', async () => {
    const collision = Object.assign(new Error('duplicate key'), { code: '23505' });
    mocks.returning.mockRejectedValueOnce(collision).mockRejectedValueOnce(collision);
    await expect(ensureCheckinToken(ENROLLMENT_ID)).rejects.toThrow('duplicate key');

    mocks.returning.mockRejectedValueOnce(new Error('connection lost'));
    await expect(ensureCheckinToken(ENROLLMENT_ID)).rejects.toThrow('connection lost');
  });
});
