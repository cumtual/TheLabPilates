// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClosingEmailData, ClosingRow } from '../../application/ports';

vi.mock('@/lib/email/service', () => ({ sendEmail: vi.fn() }));

import { sendEmail } from '@/lib/email/service';
import { closingCreatedEmail, closingResolvedEmail, escapeHtml } from '../closing-email-templates';
import { resendClosingNotifier } from '../resend-notifier';

/** Correos del corte (SPEC-CAFETERIA §6, TASK-CF-INF-02). */

const closing: ClosingRow = {
  id: 'c1', createdBy: 'b1', periodStart: new Date('2026-10-15T14:05:00Z'), periodEnd: new Date('2026-10-15T23:30:00Z'), status: 'pending',
  ordersCount: 12, cashOrdersCount: 8, transferOrdersCount: 3, courtesyItemsCount: 2, courtesyValueCents: 13000,
  cashTotalCents: 84000, transferTotalCents: 25500, cashDeliveredCents: 83500, deliveryNote: 'Cambio <b>a</b> cliente',
  resolvedBy: null, resolvedAt: null, cashReceivedCents: null, shortfallCents: null, resolutionNote: null,
  createdEmailStatus: 'pending', createdEmailSentAt: null, resolvedEmailStatus: null, resolvedEmailSentAt: null,
  createdAt: new Date('2026-10-16T00:15:00Z'),
};

const data: ClosingEmailData = {
  closing,
  createdByName: 'Beto & Co',
  resolvedByName: null,
  items: [
    { orderId: 'o1', productId: 'p1', productName: 'Latte', categoryName: 'Café', parentCategoryName: 'Bebidas', temperature: 'hot', unitPriceCents: 6500, quantity: 2, isCourtesy: false, courtesyUserId: null, courtesySource: null, courtesyPeriod: null, courtesyGrantId: null, lineTotalCents: 13000 },
    { orderId: 'o2', productId: 'p2', productName: 'Brownie', categoryName: 'Postres', parentCategoryName: 'Comida', temperature: null, unitPriceCents: 4500, quantity: 1, isCourtesy: true, courtesyUserId: 'c', courtesySource: 'grant', courtesyPeriod: null, courtesyGrantId: 'g', lineTotalCents: 0 },
  ],
  transfers: [{ folio: 41, totalCents: 25500, createdAt: new Date('2026-10-15T20:00:00Z') }],
  discountCents: 840,
  recipients: ['thelabpilates77@gmail.com', 'otro@lab.mx'],
};

beforeEach(() => vi.clearAllMocks());

describe('correo 1 — corte creado', () => {
  it('fecha CDMX, barra, pedidos, efectivo cobrado y entregado con diferencia y motivo, transferencias, cortesías y desglose', () => {
    const { subject, html } = closingCreatedEmail(data);
    expect(subject).toBe('Corte de caja pendiente de aprobación — 15/10/2026, 06:15 PM');
    for (const text of ['15/10/2026, 06:15 PM', '15/10/2026, 08:05 AM', 'Beto &amp; Co', '>12<', '$840.00', '$835.00', '$5.00', 'Transferencias (3)', '$255.00', '#41', 'Cortesías (2)', '$130.00', 'Bebidas › Café', 'Latte (caliente)', 'Comida › Postres', 'Descuentos a miembros', '$8.40']) {
      expect(html).toContain(text);
    }
  });

  it('escapa el texto de los usuarios', () => {
    const { html } = closingCreatedEmail(data);
    expect(html).toContain('Cambio &lt;b&gt;a&lt;/b&gt; cliente');
    expect(html).not.toContain('<b>a</b>');
    expect(escapeHtml(`"'&<>`)).toBe('&quot;&#39;&amp;&lt;&gt;');
  });
});

describe('correo 2 — corte resuelto', () => {
  it('añade quién resolvió, el efectivo recibido y el faltante con la nota', () => {
    const resolved = {
      ...data,
      resolvedByName: 'Admin',
      closing: { ...closing, status: 'approved_with_shortfall' as const, resolvedBy: 'a', resolvedAt: new Date('2026-10-16T15:00:00Z'), cashReceivedCents: 83000, shortfallCents: 500, resolutionNote: 'Faltó <script>' },
    };
    const { subject, html } = closingResolvedEmail(resolved);
    expect(subject).toBe('Corte de caja cerrado con faltante — 15/10/2026, 06:15 PM');
    for (const text of ['Aprobado con faltante', 'Admin', '16/10/2026, 09:00 AM', '$830.00', 'Faltante', 'Faltó &lt;script&gt;']) expect(html).toContain(text);
  });
});

describe('resendClosingNotifier', () => {
  it('envía a cada destinatario de la configuración', async () => {
    vi.mocked(sendEmail).mockResolvedValue({ success: true });
    expect(await resendClosingNotifier.closingCreated(data)).toBe(true);
    expect(vi.mocked(sendEmail).mock.calls.map((c) => c[0].to)).toEqual(['thelabpilates77@gmail.com', 'otro@lab.mx']);
  });

  it('un error → false, sin lanzar', async () => {
    vi.mocked(sendEmail).mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: 'x' });
    expect(await resendClosingNotifier.closingCreated(data)).toBe(false);
    vi.mocked(sendEmail).mockRejectedValue(new Error('red'));
    expect(await resendClosingNotifier.closingResolved(data)).toBe(false);
  });
});
