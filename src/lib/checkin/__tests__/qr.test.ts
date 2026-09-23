// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildCheckinQrDataUrl } from '@/lib/checkin/qr';

describe('buildCheckinQrDataUrl', () => {
  it('devuelve un data URL de SVG con el código QR', async () => {
    const dataUrl = await buildCheckinQrDataUrl(`https://app.mx/check-in?token=${'a'.repeat(64)}`);

    expect(dataUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const svg = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1));
    expect(svg).toContain('<svg');
  });
});
