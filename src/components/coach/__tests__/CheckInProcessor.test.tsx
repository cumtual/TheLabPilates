import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CheckInProcessor } from '@/components/coach/CheckInProcessor';

const TOKEN = 'a'.repeat(64);
const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function errorBody(code: string, details?: Record<string, string>) {
  return { ok: false, error: { code, message: 'server message', ...(details && { details }) } };
}

function renderProcessor() {
  return render(
    <StrictMode>
      <CheckInProcessor token={TOKEN} dashboardHref="/coach" />
    </StrictMode>
  );
}

describe('CheckInProcessor', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hace un solo POST con el token, incluso en StrictMode', async () => {
    fetchMock.mockReturnValue(jsonResponse(200, { ok: true, data: { studentName: 'Ana' } }));
    renderProcessor();

    await screen.findByText(/Asistencia confirmada/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/check-in');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN });
  });

  it('éxito → "¡Asistencia confirmada! Bienvenido(a) Ana" anunciado en aria-live', async () => {
    fetchMock.mockReturnValue(
      jsonResponse(200, {
        ok: true,
        data: {
          studentName: 'Ana',
          className: 'Mat Pilates',
          classDate: '2026-09-22T15:00:00.000Z',
        },
      })
    );
    renderProcessor();

    const message = await screen.findByText('¡Asistencia confirmada! Bienvenido(a) Ana');
    expect(message.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByText(/Mat Pilates/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute('href', '/coach');
  });

  it('token reusado o inválido (404) → "Código QR inválido o ya utilizado"', async () => {
    fetchMock.mockReturnValue(jsonResponse(404, errorBody('TOKEN_NOT_FOUND')));
    renderProcessor();
    expect(await screen.findByText('Código QR inválido o ya utilizado')).toBeInTheDocument();
  });

  it.each([
    ['FORBIDDEN_ROLE', 403, 'Solo coaches y administradores pueden registrar asistencia.'],
    ['NOT_CLASS_COACH', 403, 'Esta reserva es de una clase de otro coach.'],
    ['ENROLLMENT_NOT_PENDING', 409, 'Esta reserva ya no está pendiente.'],
    ['CLASS_CANCELLED', 409, 'La clase de esta reserva fue cancelada.'],
  ])('%s → su mensaje', async (code, status, message) => {
    fetchMock.mockReturnValue(jsonResponse(status, errorBody(code)));
    renderProcessor();
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('clase de otro día (409) muestra la fecha de la clase', async () => {
    fetchMock.mockReturnValue(
      jsonResponse(409, errorBody('OUTSIDE_ATTENDANCE_WINDOW', { classDate: '2026-09-23T15:00:00.000Z' }))
    );
    renderProcessor();
    expect(await screen.findByText(/Este código es para la clase del/)).toBeInTheDocument();
  });

  it('sesión expirada (401) → enlace a login que regresa al check-in', async () => {
    fetchMock.mockReturnValue(jsonResponse(401, errorBody('UNAUTHENTICATED')));
    renderProcessor();
    const link = await screen.findByRole('link', { name: 'Iniciar sesión' });
    expect(link).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent(`/check-in?token=${TOKEN}`)}`
    );
  });

  it('error de red → mensaje y "Reintentar" vuelve a enviar', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockReturnValueOnce(jsonResponse(200, { ok: true, data: { studentName: 'Ana' } }));
    renderProcessor();

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    await screen.findByText(/Asistencia confirmada/);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
