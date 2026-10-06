import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@/lib/queries/coach', () => ({
  getCoachClassById: vi.fn(),
  getClassEnrollments: vi.fn(),
  getClassGuestEnrollments: vi.fn(),
}));
vi.mock('@/lib/queries/admin-enrollment-audit', () => ({ getClassEnrollmentAudit: vi.fn() }));
vi.mock('@/actions/coach', () => ({ updateAttendanceAction: vi.fn(), completeClassAction: vi.fn() }));
vi.mock('@/components/admin/AdminGuestSection', () => ({
  AdminGuestSection: ({ guests }: { guests: { id: string; bookedAtLabel?: string }[] }) => (
    <div data-testid="guest-section">
      {guests.map((g) => (
        <span key={g.id}>Invitado reservó: {g.bookedAtLabel}</span>
      ))}
    </div>
  ),
}));

import AdminAttendancePage from '@/app/(portal)/admin/attendance/[classId]/page';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getCoachClassById, getClassEnrollments, getClassGuestEnrollments } from '@/lib/queries/coach';
import { getClassEnrollmentAudit } from '@/lib/queries/admin-enrollment-audit';

const mocked = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

async function renderPage() {
  const ui = await AdminAttendancePage({ params: Promise.resolve({ classId: 'class-1' }) });
  return render(ui);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(getSession).mockResolvedValue({ sub: 'admin-1', role: 'admin', email: 'a@test.com' });
  mocked(getCoachClassById).mockResolvedValue({
    id: 'class-1',
    classType: 'mat_pilates',
    customName: null,
    status: 'scheduled',
    classDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  });
  mocked(getClassEnrollments).mockResolvedValue([
    { enrollmentId: 'e-1', status: 'pending', studentName: 'Ana', studentEmail: 'ana@test.com', userId: 'u-1' },
  ]);
  mocked(getClassGuestEnrollments).mockResolvedValue([
    {
      guestEnrollmentId: 'g-1',
      guestName: 'Invitada',
      origin: 'user',
      status: 'pending',
      registeredById: 'u-1',
      registeredByName: 'Ana',
      registeredByEmail: 'ana@test.com',
    },
  ]);
  mocked(getClassEnrollmentAudit).mockResolvedValue([
    { kind: 'titular', enrollmentId: 'e-1', name: 'Ana', detail: 'ana@test.com', status: 'pending', bookedAt: '24/09/2026, 09:00 AM', cancelledAt: null },
    { kind: 'titular', enrollmentId: 'e-2', name: 'Beto', detail: 'beto@test.com', status: 'late_cancelled', bookedAt: '23/09/2026, 08:00 PM', cancelledAt: '24/09/2026, 10:15 AM' },
    { kind: 'guest', enrollmentId: 'g-1', name: 'Invitada', detail: 'Invitado de Ana', status: 'pending', bookedAt: '24/09/2026, 09:05 AM', cancelledAt: null },
  ]);
});

describe('/admin/attendance/[classId] — auditoría', () => {
  it('pide la auditoría con la sesión del admin', async () => {
    await renderPage();
    expect(getClassEnrollmentAudit).toHaveBeenCalledWith('class-1', expect.objectContaining({ role: 'admin' }));
  });

  it('inscrito activo: muestra «Reservó» y NO «Canceló»', async () => {
    await renderPage();
    expect(screen.getByText('Reservó: 24/09/2026, 09:00 AM')).toBeInTheDocument();
    expect(screen.queryByTestId('cancellation-e-1')).not.toBeInTheDocument();
  });

  it('cancelación tardía: muestra reserva, cancelación y badge', async () => {
    await renderPage();
    const row = screen.getByTestId('cancellation-e-2');
    expect(within(row).getByText('Reservó: 23/09/2026, 08:00 PM')).toBeInTheDocument();
    expect(within(row).getByText('Canceló: 24/09/2026, 10:15 AM')).toBeInTheDocument();
    expect(within(row).getByText('Cancelación tardía')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cancelaciones (1)' })).toBeInTheDocument();
  });

  it('invitados activos reciben su fecha de reserva', async () => {
    await renderPage();
    expect(screen.getByText('Invitado reservó: 24/09/2026, 09:05 AM')).toBeInTheDocument();
  });

  it.each(['coach', 'client'])('rol %s es redirigido y no consulta la auditoría', async (role) => {
    mocked(getSession).mockResolvedValue({ sub: 'x', role, email: 'x@test.com' });
    await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
    expect(getClassEnrollmentAudit).not.toHaveBeenCalled();
  });
});
