// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CheckinRepository } from '@/lib/checkin/checkin-repository';

const state = vi.hoisted(() => ({
  repository: null as CheckinRepository | null,
  throwError: null as Error | null,
}));

vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/checkin/checkin-repository', () => ({
  runCheckinTransaction: async <T,>(work: (repo: CheckinRepository) => Promise<T>) => {
    if (state.throwError) throw state.throwError;
    return work(state.repository!);
  },
}));

import { POST } from '@/app/api/check-in/route';
import { getSession } from '@/lib/auth/session';
import { CHECKIN_HTTP_STATUS, type CheckinErrorCode } from '@/lib/checkin/errors';
import {
  ADMIN_ID,
  COACH_ID,
  OTHER_COACH_ID,
  VALID_TOKEN,
  buildEnrollment,
  createFakeCheckinStore,
  type FakeEnrollment,
} from '@/lib/checkin/__tests__/fakes';

const mockedGetSession = getSession as ReturnType<typeof vi.fn>;

function session(role: 'client' | 'coach' | 'admin', sub = role === 'admin' ? ADMIN_ID : COACH_ID) {
  mockedGetSession.mockResolvedValue({ sub, role, email: `${role}@test.com` });
}

function useStore(rows: FakeEnrollment[] = [buildEnrollment()]) {
  const store = createFakeCheckinStore(rows);
  state.repository = store.repository;
  return store;
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/check-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/check-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T10:00:00.000-06:00'));
    state.throwError = null;
    useStore();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sin sesión → 401 UNAUTHENTICATED', async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await POST(request({ token: VALID_TOKEN }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it('rol client → 403 FORBIDDEN_ROLE sin tocar la reserva', async () => {
    const store = useStore();
    session('client', 'client-id');
    const res = await POST(request({ token: VALID_TOKEN }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN_ROLE');
    expect(store.enrollments[0].status).toBe('pending');
  });

  it('Origin de otro sitio → 403 INVALID_ORIGIN', async () => {
    session('coach');
    const res = await POST(request({ token: VALID_TOKEN }, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('INVALID_ORIGIN');
  });

  it.each([
    ['body no JSON', '{no-json'],
    ['sin token', {}],
    ['token no string', { token: 123 }],
  ])('%s → 400 INVALID_PAYLOAD', async (_label, body) => {
    session('coach');
    const res = await POST(request(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_PAYLOAD');
  });

  it('coach titular → 200 con el nombre del alumno', async () => {
    session('coach');
    const res = await POST(request({ token: VALID_TOKEN }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, data: { studentName: 'Ana', enrollmentId: 'enrollment-1' } });
  });

  it('admin → 200 en la clase de cualquier coach', async () => {
    useStore([buildEnrollment({ coachUserId: OTHER_COACH_ID })]);
    session('admin');
    const res = await POST(request({ token: VALID_TOKEN }));
    expect(res.status).toBe(200);
  });

  it('coach de otra clase → 403 NOT_CLASS_COACH', async () => {
    session('coach', OTHER_COACH_ID);
    const res = await POST(request({ token: VALID_TOKEN }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('NOT_CLASS_COACH');
  });

  it('reuso: el segundo POST con el mismo token → 404 "Código QR inválido o ya utilizado"', async () => {
    session('coach');
    const first = await POST(request({ token: VALID_TOKEN }));
    const second = await POST(request({ token: VALID_TOKEN }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(404);
    expect((await second.json()).error).toEqual({
      code: 'TOKEN_NOT_FOUND',
      message: 'Código QR inválido o ya utilizado',
    });
  });

  it.each([
    ['reserva no pending', { status: 'late_cancelled' as const }, 'ENROLLMENT_NOT_PENDING'],
    ['clase cancelada', { classStatus: 'cancelled' as const }, 'CLASS_CANCELLED'],
    ['clase de otro día', { classDate: new Date('2026-09-23T09:00:00.000-06:00') }, 'OUTSIDE_ATTENDANCE_WINDOW'],
  ])('%s → 409 %s', async (_label, overrides, code) => {
    useStore([buildEnrollment(overrides)]);
    session('coach');
    const res = await POST(request({ token: VALID_TOKEN }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe(code);
  });

  it('error inesperado → 500 INTERNAL_ERROR sin stack', async () => {
    session('coach');
    state.throwError = new Error('db down at secret-host:5432');
    const res = await POST(request({ token: VALID_TOKEN }));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).toContain('INTERNAL_ERROR');
    expect(text).not.toContain('secret-host');
  });

  it('todas las respuestas llevan Cache-Control: no-store', async () => {
    session('coach');
    const ok = await POST(request({ token: VALID_TOKEN }));
    mockedGetSession.mockResolvedValue(null);
    const unauthorized = await POST(request({ token: VALID_TOKEN }));
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(unauthorized.headers.get('cache-control')).toBe('no-store');
  });

  it('el mapeo HTTP cubre todos los códigos de error', () => {
    const codes: CheckinErrorCode[] = [
      'INVALID_PAYLOAD', 'UNAUTHENTICATED', 'FORBIDDEN_ROLE', 'NOT_CLASS_COACH', 'INVALID_ORIGIN',
      'TOKEN_NOT_FOUND', 'ENROLLMENT_NOT_FOUND', 'ENROLLMENT_NOT_PENDING', 'CLASS_CANCELLED',
      'OUTSIDE_ATTENDANCE_WINDOW', 'INTERNAL_ERROR',
    ];
    expect(Object.keys(CHECKIN_HTTP_STATUS).sort()).toEqual([...codes].sort());
  });
});
