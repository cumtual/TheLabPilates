import QRCode from 'qrcode';

/**
 * Genera el QR en el servidor como data URL SVG, para no agregar peso al
 * bundle del cliente.
 */
export async function buildCheckinQrDataUrl(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
