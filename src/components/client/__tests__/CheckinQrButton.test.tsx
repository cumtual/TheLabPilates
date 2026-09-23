import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { CheckinQrButton } from '@/components/client/CheckinQrButton';

const ENROLLMENT_ID = '11111111-1111-4111-8111-111111111111';
const STATUS_URL = `/api/check-in/status?enrollmentId=${ENROLLMENT_ID}`;
const fetchMock = vi.fn();

function statusResponse(status: string, httpStatus = 200) {
  return Promise.resolve(
    new Response(JSON.stringify({ ok: httpStatus === 200, data: { status, checkedInAt: null } }), {
      status: httpStatus,
    })
  );
}

function renderButton() {
  return render(
    <CheckinQrButton
      enrollmentId={ENROLLMENT_ID}
      qrDataUrl="data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E"
      className="Mat Pilates"
      classDateLabel="lunes 22 de septiembre, 9:00 a. m."
    />
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function openModal() {
  fireEvent.click(screen.getByRole('button', { name: 'Ver mi código QR' }));
}

describe('CheckinQrButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => statusResponse('pending'));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('abre un diálogo accesible con el QR', () => {
    renderButton();
    const trigger = screen.getByRole('button', { name: 'Ver mi código QR' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');

    openModal();

    expect(screen.getByRole('dialog', { name: 'Tu código QR' })).toBeInTheDocument();
    expect(screen.getByAltText(/Código QR de asistencia para Mat Pilates/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
  });

  it('Esc cierra el modal y devuelve el foco al botón', () => {
    renderButton();
    openModal();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver mi código QR' })).toHaveFocus();
  });

  it('solo consulta el estado cada 3 s mientras el modal está abierto', async () => {
    renderButton();
    await advance(6000);
    expect(fetchMock).not.toHaveBeenCalled();

    openModal();
    await advance(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(STATUS_URL);
    await advance(3000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('al confirmarse la asistencia muestra la confirmación, cierra y refresca el dashboard', async () => {
    fetchMock.mockImplementation(() => statusResponse('attended'));
    renderButton();
    openModal();

    await advance(3000);
    expect(screen.getByText('¡Asistencia confirmada!')).toBeInTheDocument();

    await advance(1500);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);

    await advance(9000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deja de consultar ante un 404', async () => {
    fetchMock.mockImplementation(() => statusResponse('', 404));
    renderButton();
    openModal();

    await advance(3000);
    await advance(9000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('al cerrar hace una consulta final y refresca si ya se registró', async () => {
    renderButton();
    openModal();
    fetchMock.mockImplementation(() => statusResponse('attended'));

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await advance(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('no deja intervalos activos al desmontar', async () => {
    const { unmount } = renderButton();
    openModal();
    unmount();

    await advance(9000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deja de consultar a los 15 minutos', async () => {
    renderButton();
    openModal();

    await advance(15 * 60 * 1000);
    const callsAtLimit = fetchMock.mock.calls.length;
    await advance(9000);
    expect(fetchMock).toHaveBeenCalledTimes(callsAtLimit);
  });
});
