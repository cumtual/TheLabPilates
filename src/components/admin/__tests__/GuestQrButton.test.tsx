import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ getQr: vi.fn() }));
vi.mock('@/modules/guest-checkin/presentation/actions/get-guest-qr', () => ({
  getGuestCheckinQrAction: mocks.getQr,
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { GuestQrButton } from '@/components/admin/GuestQrButton';
import { guestQrFileName } from '@/components/admin/GuestQrModal';

const qr = {
  guestEnrollmentId: 'g1',
  guestName: 'María López',
  className: 'Mat Pilates',
  classDate: '2026-11-20T15:00:00.000Z',
  qrDataUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E',
};

describe('GuestQrButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pide el QR al hacer clic y lo muestra en un diálogo con descarga', async () => {
    mocks.getQr.mockResolvedValue({ success: true, data: qr });
    render(<GuestQrButton guestEnrollmentId="g1" guestName="María López" />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver código QR de María López' }));

    const dialog = await screen.findByRole('dialog');
    expect(mocks.getQr).toHaveBeenCalledWith('g1');
    expect(dialog).toHaveTextContent('QR de María López');
    expect(screen.getByAltText(/Código QR de asistencia de María López para Mat Pilates/)).toHaveAttribute(
      'src',
      qr.qrDataUrl
    );
    const download = screen.getByRole('link', { name: /Descargar QR/ });
    expect(download).toHaveAttribute('href', qr.qrDataUrl);
    expect(download).toHaveAttribute('download', 'qr-invitado-maria-lopez.svg');
  });

  it('se puede volver a abrir después de cerrarlo (D2) y avisa al cerrar', async () => {
    mocks.getQr.mockResolvedValue({ success: true, data: qr });
    const onClose = vi.fn();
    render(<GuestQrButton guestEnrollmentId="g1" guestName="María López" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Ver código QR/ }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Ver código QR/ }));
    await screen.findByRole('dialog');
    expect(mocks.getQr).toHaveBeenCalledTimes(2);
  });

  it('Esc cierra el diálogo', async () => {
    mocks.getQr.mockResolvedValue({ success: true, data: qr });
    render(<GuestQrButton guestEnrollmentId="g1" guestName="María López" />);

    fireEvent.click(screen.getByRole('button', { name: /Ver código QR/ }));
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('si no hay QR disponible muestra el mensaje y no abre el diálogo', async () => {
    mocks.getQr.mockResolvedValue({ success: false, error: 'Este invitado no tiene un QR disponible.' });
    render(<GuestQrButton guestEnrollmentId="g1" guestName="María López" />);

    fireEvent.click(screen.getByRole('button', { name: /Ver código QR/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este invitado no tiene un QR disponible.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('guestQrFileName', () => {
  it('quita acentos y caracteres especiales', () => {
    expect(guestQrFileName('  José Ñúñez / 2 ')).toBe('qr-invitado-jose-nunez-2.svg');
    expect(guestQrFileName('***')).toBe('qr-invitado-invitado.svg');
  });
});
