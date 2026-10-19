'use client';

import type { MenuItem } from '@/modules/cafeteria/domain/category-tree';
import { formatPesos } from '@/modules/cafeteria/domain/money';
import { MAX_LINE_QUANTITY } from '@/modules/cafeteria/domain/order';
import type { CartLine } from './register-logic';
import { TemperatureIcon } from './ProductGrid';

interface CartProps {
  lines: CartLine[];
  menu: ReadonlyMap<string, MenuItem>;
  totalCents: number;
  /** Descuento por membresía del cliente (D13), si aplica. */
  discount?: { label: string; subtotalCents: number; discountCents: number } | null;
  /** Etiquetas de la fuente de cada cortesía por producto (vista previa). */
  courtesyLabels: Map<string, string[]>;
  /** Hay un cliente con créditos: se muestran los controles de cortesía. */
  courtesyEnabled: boolean;
  canAddCourtesy: (productId: string) => boolean;
  onQuantity: (productId: string, quantity: number) => void;
  onCourtesy: (productId: string, courtesy: number) => void;
  children?: React.ReactNode;
}

/** Carrito: panel inferior en móvil y columna en tablet/escritorio (SPEC-CAFETERIA §8.1). */
export function Cart({ lines, menu, totalCents, discount, courtesyLabels, courtesyEnabled, canAddCourtesy, onQuantity, onCourtesy, children }: CartProps) {
  return (
    <aside
      aria-label="Carrito"
      data-testid="cart"
      className="fixed bottom-0 inset-x-0 z-30 max-h-[55vh] overflow-y-auto border-t border-outline-variant/40 bg-surface p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:static md:max-h-none md:rounded-lg md:border md:shadow-sm"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-headline text-lg text-on-surface">Pedido</h2>
        <p className="font-body text-lg font-semibold text-on-surface" data-testid="cart-total">
          {formatPesos(totalCents)}
        </p>
      </div>

      {lines.length === 0 ? (
        <p className="mt-2 font-body text-sm text-on-surface-variant">Toca un producto para agregarlo.</p>
      ) : (
        <ul className="mt-3 divide-y divide-outline-variant/30">
          {lines.map((line) => {
            const item = menu.get(line.productId);
            if (!item) return null;
            const labels = courtesyLabels.get(line.productId) ?? [];
            const coverable = canAddCourtesy(line.productId);
            return (
              <li key={line.productId} className="py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 font-body text-sm text-on-surface truncate">
                    {item.name} <TemperatureIcon temperature={item.temperature} />
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Quitar uno de ${item.name}`}
                      onClick={() => onQuantity(line.productId, line.quantity - 1)}
                      className="min-h-11 min-w-11 rounded-md border border-outline-variant"
                    >
                      −
                    </button>
                    <span aria-label={`Cantidad de ${item.name}`} className="w-6 text-center font-body text-sm">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Agregar uno de ${item.name}`}
                      disabled={line.quantity >= MAX_LINE_QUANTITY}
                      onClick={() => onQuantity(line.productId, line.quantity + 1)}
                      className="min-h-11 min-w-11 rounded-md border border-outline-variant disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <span className="w-20 text-right font-body text-sm text-on-surface">
                    {formatPesos(item.priceCents * (line.quantity - line.courtesy))}
                  </span>
                </div>
                {courtesyEnabled && (
                  <div className="flex flex-wrap items-center gap-2 pl-1">
                    <span className="font-body text-xs text-on-surface-variant">Cortesía</span>
                    <button
                      type="button"
                      aria-label={`Una cortesía menos en ${item.name}`}
                      disabled={line.courtesy === 0}
                      onClick={() => onCourtesy(line.productId, line.courtesy - 1)}
                      className="min-h-9 min-w-9 rounded-md border border-outline-variant text-xs disabled:opacity-40"
                    >
                      −
                    </button>
                    <span aria-label={`Cortesías de ${item.name}`} className="font-body text-xs">
                      {line.courtesy}/{line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Una cortesía más en ${item.name}`}
                      disabled={!coverable}
                      onClick={() => onCourtesy(line.productId, line.courtesy + 1)}
                      className="min-h-9 min-w-9 rounded-md border border-outline-variant text-xs disabled:opacity-40"
                    >
                      +
                    </button>
                    {labels.length > 0 && <span className="font-body text-[11px] text-primary">Usa: {[...new Set(labels)].join(', ')}</span>}
                    {!coverable && line.courtesy < line.quantity && (
                      <span className="font-body text-[11px] text-outline">Sin crédito que lo cubra</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {discount && discount.discountCents > 0 && (
        <dl className="mt-3 space-y-1 border-t border-outline-variant/30 pt-2 font-body text-sm" aria-label="Descuento">
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">Subtotal</dt>
            <dd>{formatPesos(discount.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between text-primary">
            <dt>Descuento {discount.label}</dt>
            <dd>−{formatPesos(discount.discountCents)}</dd>
          </div>
        </dl>
      )}
      {children}
    </aside>
  );
}
