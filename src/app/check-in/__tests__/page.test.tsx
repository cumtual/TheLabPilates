import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock('@/components/coach/CheckInProcessor', () => ({
  CheckInProcessor: ({ token, dashboardHref }: { token: string; dashboardHref: string }) => (
    <div data-testid="processor" data-token={token} data-dashboard={dashboardHref} />
  ),
}));

import CheckInPage from '@/app/check-in/page';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

const mockedGetSession = getSession as ReturnType<typeof vi.fn>;
const TOKEN = 'a'.repeat(64);

async function renderPage(token?: string | string[]) {
  const ui = await CheckInPage({ searchParams: Promise.resolve({ token }) });
  return render(ui);
}

describe('/check-in page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sin sesión redirige a login conservando el token', async () => {
    mockedGetSession.mockResolvedValue(null);
    await expect(renderPage(TOKEN)).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith(`/login?redirect=%2Fcheck-in%3Ftoken%3D${TOKEN}`);
  });

  it('rol client ve el 403 y no procesa la asistencia', async () => {
    mockedGetSession.mockResolvedValue({ sub: 'c1', role: 'client', email: 'c@test.com' });
    await renderPage(TOKEN);
    expect(screen.getByRole('heading', { name: /403/ })).toBeInTheDocument();
    expect(
      screen.getByText('Solo coaches y administradores pueden registrar asistencia.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('processor')).not.toBeInTheDocument();
  });

  it.each([
    ['coach', '/coach'],
    ['admin', '/admin'],
  ])('rol %s procesa el token', async (role, dashboard) => {
    mockedGetSession.mockResolvedValue({ sub: 'u1', role, email: 'u@test.com' });
    await renderPage(TOKEN);
    const processor = screen.getByTestId('processor');
    expect(processor).toHaveAttribute('data-token', TOKEN);
    expect(processor).toHaveAttribute('data-dashboard', dashboard);
  });

  it.each([
    ['ausente', undefined],
    ['mal formado', 'abc'],
    ['repetido', [TOKEN, TOKEN]],
  ])('token %s muestra "Código QR inválido o ya utilizado"', async (_label, token) => {
    mockedGetSession.mockResolvedValue({ sub: 'u1', role: 'coach', email: 'u@test.com' });
    await renderPage(token);
    expect(screen.getByText('Código QR inválido o ya utilizado')).toBeInTheDocument();
    expect(screen.queryByTestId('processor')).not.toBeInTheDocument();
  });
});
