import { formatAuditDateTime } from '@/lib/utils/date';
import { TEMPERATURE_LABELS } from '../domain/category-tree';
import { CLOSING_STATUS_LABELS } from '../domain/closing';
import { formatPesos } from '../domain/money';
import { breakdownByProduct } from '../domain/sales';
import type { ClosingEmailData } from '../application/ports';

/**
 * Correos del corte (SPEC-CAFETERIA §6, A2). Fechas en CDMX con `DD/MM/YYYY, hh:mm A`.
 * Todo texto escrito por un usuario se escapa.
 */

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const cell = 'padding:6px 8px;border-bottom:1px solid #e7e1da;text-align:left;';
const num = 'padding:6px 8px;border-bottom:1px solid #e7e1da;text-align:right;white-space:nowrap;';

function row(label: string, value: string): string {
  return `<tr><td style="${cell}">${label}</td><td style="${num}"><strong>${value}</strong></td></tr>`;
}

function summaryTable(data: ClosingEmailData, resolved: boolean): string {
  const c = data.closing;
  const difference = c.cashTotalCents - c.cashDeliveredCents;
  const rows = [
    row('Fecha del corte', formatAuditDateTime(c.createdAt)),
    row('Barra', escapeHtml(data.createdByName)),
    row('Periodo', `${formatAuditDateTime(c.periodStart)} – ${formatAuditDateTime(c.periodEnd)}`),
    row('Pedidos', String(c.ordersCount)),
    row('Efectivo cobrado', formatPesos(c.cashTotalCents)),
    row('Efectivo entregado', formatPesos(c.cashDeliveredCents)),
    ...(difference > 0 ? [row('Diferencia declarada', formatPesos(difference))] : []),
    ...(c.deliveryNote ? [row('Motivo de la barra', escapeHtml(c.deliveryNote))] : []),
    row(`Transferencias (${c.transferOrdersCount})`, formatPesos(c.transferTotalCents)),
    row(`Cortesías (${c.courtesyItemsCount})`, formatPesos(c.courtesyValueCents)),
    ...(data.discountCents > 0 ? [row('Descuentos a miembros', formatPesos(data.discountCents))] : []),
  ];
  if (resolved && c.resolvedAt) {
    rows.push(
      row('Estado', CLOSING_STATUS_LABELS[c.status]),
      row('Resuelto por', escapeHtml(data.resolvedByName ?? 'Admin')),
      row('Resuelto el', formatAuditDateTime(c.resolvedAt)),
      row('Efectivo recibido', formatPesos(c.cashReceivedCents ?? 0)),
      ...((c.shortfallCents ?? 0) > 0 ? [row('Faltante', formatPesos(c.shortfallCents ?? 0))] : []),
      ...(c.resolutionNote ? [row('Nota del admin', escapeHtml(c.resolutionNote))] : [])
    );
  }
  return `<table style="border-collapse:collapse;width:100%;max-width:560px;font-size:14px;">${rows.join('')}</table>`;
}

function transfersTable(data: ClosingEmailData): string {
  if (data.transfers.length === 0) return '<p>Sin transferencias.</p>';
  const rows = data.transfers
    .map((t) => `<tr><td style="${cell}">#${t.folio}</td><td style="${cell}">${formatAuditDateTime(t.createdAt)}</td><td style="${num}">${formatPesos(t.totalCents)}</td></tr>`)
    .join('');
  return `<table style="border-collapse:collapse;width:100%;max-width:560px;font-size:14px;">${rows}</table>`;
}

function breakdownTable(data: ClosingEmailData): string {
  const rows = breakdownByProduct(data.items)
    .map((r) => {
      const name = escapeHtml(r.temperature ? `${r.productName} (${TEMPERATURE_LABELS[r.temperature]})` : r.productName);
      const courtesy = r.courtesyMonthly + r.courtesyGrant;
      return `<tr><td style="${cell}">${escapeHtml(r.group)}</td><td style="${cell}">${name}</td><td style="${num}">${r.soldQuantity}</td><td style="${num}">${formatPesos(r.revenueCents)}</td><td style="${num}">${courtesy}</td></tr>`;
    })
    .join('');
  const head = `<tr><th style="${cell}">Categoría</th><th style="${cell}">Producto</th><th style="${num}">Vendidos</th><th style="${num}">Ingreso</th><th style="${num}">Cortesías</th></tr>`;
  return `<table style="border-collapse:collapse;width:100%;max-width:560px;font-size:14px;">${head}${rows}</table>`;
}

function layout(title: string, intro: string, body: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#2d2926;">
      <h1 style="font-size:20px;">${title}</h1>
      <p>${intro}</p>
      ${body}
      <p style="color:#7a726b;font-size:12px;margin-top:24px;">— The Lab Pilates Studio · Cafetería</p>
    </div>`;
}

export function closingCreatedEmail(data: ClosingEmailData): { subject: string; html: string } {
  return {
    subject: `Corte de caja pendiente de aprobación — ${formatAuditDateTime(data.closing.createdAt)}`,
    html: layout(
      'Corte de caja pendiente de aprobación',
      'La barra hizo un corte. Confirma en el panel que recibiste el efectivo para cerrarlo.',
      `${summaryTable(data, false)}<h2 style="font-size:16px;">Transferencias</h2>${transfersTable(data)}<h2 style="font-size:16px;">Desglose por producto</h2>${breakdownTable(data)}`
    ),
  };
}

export function closingResolvedEmail(data: ClosingEmailData): { subject: string; html: string } {
  const shortfall = (data.closing.shortfallCents ?? 0) > 0;
  return {
    subject: `Corte de caja cerrado${shortfall ? ' con faltante' : ''} — ${formatAuditDateTime(data.closing.createdAt)}`,
    html: layout(
      'Corte de caja cerrado',
      shortfall ? `Se registró un faltante de ${formatPesos(data.closing.shortfallCents ?? 0)}.` : 'El efectivo se recibió completo.',
      `${summaryTable(data, true)}<h2 style="font-size:16px;">Transferencias</h2>${transfersTable(data)}<h2 style="font-size:16px;">Desglose por producto</h2>${breakdownTable(data)}`
    ),
  };
}
