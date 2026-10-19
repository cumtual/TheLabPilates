import { flattenMenu, type MenuItem, type MenuSection } from '@/modules/cafeteria/domain/category-tree';
import {
  allocateCourtesies,
  grantCovers,
  specificityOf,
  type CourtesySource,
  type ItemPlacement,
} from '@/modules/cafeteria/domain/courtesy-grants';
import { discountCents } from '@/modules/cafeteria/domain/order';
import type { CustomerResult } from '@/modules/cafeteria/presentation/types';

/**
 * Lógica de la caja sin React: carrito, fuentes de cortesía del cliente elegido y la
 * vista previa del reparto (el servidor vuelve a calcular todo al cobrar).
 */

export interface CartLine {
  productId: string;
  quantity: number;
  /** Unidades de esta línea que van como cortesía (0..quantity). */
  courtesy: number;
}

export const MONTHLY_LABEL = 'Cupo mensual';

export function menuIndex(sections: readonly MenuSection[]): Map<string, MenuItem> {
  return new Map(flattenMenu(sections).map((item) => [item.id, item]));
}

const placement = (item: MenuItem): ItemPlacement => ({ productId: item.id, categoryId: item.categoryId, rootCategoryId: item.rootCategoryId });

/** Fuentes de cortesía de un cliente según lo que devolvió la búsqueda. */
export function sourcesFor(customer: CustomerResult | null, monthlyEligibleIds: readonly string[], now: Date): CourtesySource[] {
  if (!customer) return [];
  const sources: CourtesySource[] = [];
  const eligible = new Set(monthlyEligibleIds);
  if (customer.courtesy.monthly) {
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    sources.push({
      key: 'monthly',
      kind: 'monthly',
      remaining: customer.courtesy.monthly.remaining,
      expiresAt: endOfMonth,
      specificity: 1,
      createdAt: new Date(0),
      covers: (item) => eligible.has(item.productId),
    });
  }
  for (const grant of customer.courtesy.grants) {
    sources.push({
      key: grant.id,
      kind: 'grant',
      remaining: grant.remaining,
      expiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
      specificity: specificityOf(grant.scope),
      createdAt: new Date(0),
      covers: (item) => grantCovers(grant.scope, item),
    });
  }
  return sources;
}

/** Una línea de cortesía por unidad marcada, con llave estable `productId#n`. */
function courtesyUnits(cart: readonly CartLine[], menu: ReadonlyMap<string, MenuItem>) {
  return cart.flatMap((line) => {
    const item = menu.get(line.productId);
    return item ? Array.from({ length: line.courtesy }, (_, n) => ({ key: `${line.productId}#${n}`, item: placement(item) })) : [];
  });
}

export interface CourtesyPreview {
  /** productId → etiquetas de la fuente de cada unidad de cortesía. */
  labels: Map<string, string[]>;
  uncoveredProductIds: Set<string>;
}

export function previewCourtesies(
  cart: readonly CartLine[],
  menu: ReadonlyMap<string, MenuItem>,
  customer: CustomerResult | null,
  sources: readonly CourtesySource[]
): CourtesyPreview {
  const allocation = allocateCourtesies(courtesyUnits(cart, menu), sources);
  const labelOf = (sourceKey: string) =>
    sourceKey === 'monthly' ? MONTHLY_LABEL : customer?.courtesy.grants.find((g) => g.id === sourceKey)?.scopeLabel ?? 'Regalo';
  const labels = new Map<string, string[]>();
  for (const [key, source] of allocation.assignments) {
    const productId = key.split('#')[0];
    labels.set(productId, [...(labels.get(productId) ?? []), labelOf(source)]);
  }
  return { labels, uncoveredProductIds: new Set(allocation.uncovered.map((key) => key.split('#')[0])) };
}

/** ¿Alguna fuente cubre este artículo? (para mostrar el interruptor o deshabilitarlo). */
export function isCoverable(item: MenuItem, sources: readonly CourtesySource[]): boolean {
  return sources.some((s) => s.remaining > 0 && s.covers(placement(item)));
}

/** ¿Se puede marcar una unidad más de cortesía en este producto sin dejar líneas sin cubrir? */
export function canAddCourtesy(cart: readonly CartLine[], productId: string, menu: ReadonlyMap<string, MenuItem>, sources: readonly CourtesySource[]): boolean {
  const next = cart.map((l) => (l.productId === productId && l.courtesy < l.quantity ? { ...l, courtesy: l.courtesy + 1 } : l));
  if (next.every((l, i) => l.courtesy === cart[i].courtesy)) return false;
  return allocateCourtesies(courtesyUnits(next, menu), sources).uncovered.length === 0;
}

/** Marca por defecto las cortesías posibles, en el orden del carrito, hasta agotar créditos. */
export function autoMarkCourtesies(cart: readonly CartLine[], menu: ReadonlyMap<string, MenuItem>, sources: readonly CourtesySource[]): CartLine[] {
  let next = cart.map((l) => ({ ...l, courtesy: 0 }));
  if (sources.length === 0) return next;
  for (const line of cart) {
    for (let n = 0; n < line.quantity; n++) {
      if (!canAddCourtesy(next, line.productId, menu, sources)) break;
      next = next.map((l) => (l.productId === line.productId ? { ...l, courtesy: l.courtesy + 1 } : l));
    }
  }
  return next;
}

/** Líneas para `createOrder`: las unidades de cortesía van en líneas de 1. */
export function toOrderItems(cart: readonly CartLine[]) {
  return cart.flatMap((line) => [
    ...(line.quantity > line.courtesy ? [{ productId: line.productId, quantity: line.quantity - line.courtesy, courtesy: false }] : []),
    ...Array.from({ length: line.courtesy }, () => ({ productId: line.productId, quantity: 1, courtesy: true })),
  ]);
}

/** Totales del carrito; con `discountPercent` aplica el descuento de la membresía (D13) igual que el servidor. */
export function cartTotals(cart: readonly CartLine[], menu: ReadonlyMap<string, MenuItem>, discountPercent = 0) {
  let subtotalCents = 0;
  let items = 0;
  let courtesies = 0;
  for (const line of cart) {
    const item = menu.get(line.productId);
    if (!item) continue;
    subtotalCents += item.priceCents * (line.quantity - line.courtesy);
    items += line.quantity;
    courtesies += line.courtesy;
  }
  const discount = discountCents(subtotalCents, discountPercent);
  return { subtotalCents, discountCents: discount, totalCents: subtotalCents - discount, items, courtesies };
}
