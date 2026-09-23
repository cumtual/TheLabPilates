// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/queries/class-auto-completion', () => ({ autoCompletePassedClasses: vi.fn() }));
vi.mock('@/lib/queries/attendance-auto-close', () => ({ markUnattendedEnrollmentsAbsent: vi.fn() }));

import { GET } from '@/app/api/cron/complete-classes/route';
import { autoCompletePassedClasses } from '@/lib/queries/class-auto-completion';
import { markUnattendedEnrollmentsAbsent } from '@/lib/queries/attendance-auto-close';

const autoComplete = autoCompletePassedClasses as ReturnType<typeof vi.fn>;
const markAbsent = markUnattendedEnrollmentsAbsent as ReturnType<typeof vi.fn>;

function request(authorization?: string) {
  return new Request('http://localhost:3000/api/cron/complete-classes', {
    headers: authorization ? { authorization } : {},
  });
}

describe('GET /api/cron/complete-classes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sin el secreto correcto → 401 y no ejecuta nada', async () => {
    const res = await GET(request('Bearer wrong'));
    expect(res.status).toBe(401);
    expect(autoComplete).not.toHaveBeenCalled();
    expect(markAbsent).not.toHaveBeenCalled();
  });

  it('completa clases y cierra inasistencias', async () => {
    autoComplete.mockResolvedValue(3);
    markAbsent.mockResolvedValue(5);

    const res = await GET(request('Bearer test-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, completed: 3, markedAbsent: 5 });
    expect(typeof body.timestamp).toBe('string');
  });

  it('un error en el cierre de inasistencias → 500', async () => {
    autoComplete.mockResolvedValue(0);
    markAbsent.mockRejectedValue(new Error('boom'));
    const res = await GET(request('Bearer test-secret'));
    expect(res.status).toBe(500);
  });
});
