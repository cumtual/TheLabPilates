// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const mocks = vi.hoisted(() => ({ rows: [] as unknown[], where: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/db', () => {
  const builder = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: mocks.where,
    limit: vi.fn(async () => mocks.rows),
  };
  builder.from.mockReturnValue(builder);
  builder.innerJoin.mockReturnValue(builder);
  mocks.where.mockReturnValue(builder);
  return { db: { select: vi.fn(() => builder) } };
});

import { GET } from '@/app/api/check-in/status/route';
import { getSession } from '@/lib/auth/session';

const mockedGetSession = getSession as ReturnType<typeof vi.fn>;
const ENROLLMENT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'user-123';

function request(enrollmentId: string | null) {
  const url = new URL('http://localhost:3000/api/check-in/status');
  if (enrollmentId !== null) url.searchParams.set('enrollmentId', enrollmentId);
  return new Request(url);
}

describe('GET /api/check-in/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [];
    mockedGetSession.mockResolvedValue({ sub: USER_ID, role: 'client', email: 'c@test.com' });
  });

  it('sin sesión → 401', async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await GET(request(ENROLLMENT_ID));
    expect(res.status).toBe(401);
  });

  it.each([null, 'no-es-uuid'])('enrollmentId inválido (%s) → 400', async (id) => {
    const res = await GET(request(id));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_PAYLOAD');
  });

  it('reserva inexistente o ajena → 404 ENROLLMENT_NOT_FOUND', async () => {
    const res = await GET(request(ENROLLMENT_ID));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('ENROLLMENT_NOT_FOUND');
  });

  it('la consulta filtra por la reserva y por el usuario de la sesión', async () => {
    await GET(request(ENROLLMENT_ID));
    const { sql, params } = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0] as SQL);
    expect(sql).toContain('"class_enrolleds"."id" = $1');
    expect(sql).toContain('"user_suscriptions"."user_id" = $2');
    expect(params).toEqual([ENROLLMENT_ID, USER_ID]);
  });

  it('reserva propia → 200 con estado y checkedInAt, sin caché', async () => {
    const checkedInAt = new Date('2026-09-22T15:02:00.000Z');
    mocks.rows = [{ status: 'attended', checkedInAt }];
    const res = await GET(request(ENROLLMENT_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      ok: true,
      data: { status: 'attended', checkedInAt: checkedInAt.toISOString() },
    });
  });
});
