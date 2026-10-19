import { TEMPERATURE_LABELS, type Temperature } from './category-tree';

/**
 * Cortesías regaladas por el admin y reparto de créditos (SPEC-CAFETERIA D11, A11–A13, §4.6).
 */

export type GrantScope =
  | { type: 'any' }
  | { type: 'category'; categoryId: string }
  | { type: 'product'; productId: string };

export interface GrantRecord {
  id: string;
  userId: string;
  quantity: number;
  scope: GrantScope;
  scopeLabel: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  /** Líneas canjeadas en pedidos `paid` (los anulados no cuentan). */
  redeemed: number;
}

export type GrantStatus = 'active' | 'used' | 'expired' | 'revoked' | 'unavailable';

export const GRANT_QUANTITY_MIN = 1;
export const GRANT_QUANTITY_MAX = 50;

export const GRANT_STATUS_LABELS: Record<GrantStatus, string> = {
  active: 'Activo',
  used: 'Agotado',
  expired: 'Vencido',
  revoked: 'Revocado',
  unavailable: 'Alcance no disponible',
};

/** Dónde está un artículo en el menú, para saber qué regalos lo cubren. */
export interface ItemPlacement {
  productId: string;
  categoryId: string;
  rootCategoryId: string;
}

export function grantRemaining(grant: Pick<GrantRecord, 'quantity' | 'redeemed'>): number {
  return Math.max(0, grant.quantity - grant.redeemed);
}

export function isGrantExpired(grant: Pick<GrantRecord, 'expiresAt'>, now: Date): boolean {
  return grant.expiresAt !== null && now.getTime() > grant.expiresAt.getTime();
}

/**
 * Estado calculado. `scopeAvailable = false` cuando su producto o categoría se eliminó
 * o desactivó (A13): no se canjea mientras tanto.
 */
export function grantStatus(grant: GrantRecord, now: Date, scopeAvailable: boolean): GrantStatus {
  if (grant.revokedAt !== null) return 'revoked';
  if (grantRemaining(grant) === 0) return 'used';
  if (isGrantExpired(grant, now)) return 'expired';
  if (!scopeAvailable) return 'unavailable';
  return 'active';
}

/** `any` cubre todo; `category`, esa categoría y sus subcategorías; `product`, solo ese producto. */
export function grantCovers(scope: GrantScope, item: ItemPlacement): boolean {
  switch (scope.type) {
    case 'any':
      return true;
    case 'category':
      return scope.categoryId === item.categoryId || scope.categoryId === item.rootCategoryId;
    case 'product':
      return scope.productId === item.productId;
  }
}

/** «Cualquier artículo», «Comida › Postres», «Comida», «Latte (caliente)». */
export function buildScopeLabel(
  scope:
    | { type: 'any' }
    | { type: 'category'; path: string }
    | { type: 'product'; name: string; temperature: Temperature | null }
): string {
  switch (scope.type) {
    case 'any':
      return 'Cualquier artículo';
    case 'category':
      return scope.path;
    case 'product':
      return scope.temperature ? `${scope.name} (${TEMPERATURE_LABELS[scope.temperature]})` : scope.name;
  }
}

// ── Reparto (A11) ────────────────────────────────────────────────────────────

/** Una fuente de créditos de un cliente: su cupo mensual de coach o un regalo vigente. */
export interface CourtesySource {
  /** `'monthly'` o el id del regalo. */
  key: string;
  kind: 'monthly' | 'grant';
  remaining: number;
  /** Cupo mensual: fin del mes CDMX. Regalo sin vencimiento: `null` (va al final). */
  expiresAt: Date | null;
  /** 0 = producto, 1 = categoría o cupo mensual, 2 = cualquier artículo. */
  specificity: 0 | 1 | 2;
  createdAt: Date;
  covers: (item: ItemPlacement) => boolean;
}

export function specificityOf(scope: GrantScope): 0 | 1 | 2 {
  return scope.type === 'product' ? 0 : scope.type === 'category' ? 1 : 2;
}

/** Vence antes → alcance más específico → más antiguo → llave (determinista). */
export function compareSourcePriority(a: CourtesySource, b: CourtesySource): number {
  const expiry = (s: CourtesySource) => s.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return (
    expiry(a) - expiry(b) ||
    a.specificity - b.specificity ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.key.localeCompare(b.key)
  );
}

export interface CourtesyLine {
  /** Identifica la línea marcada como cortesía (una unidad). */
  key: string;
  item: ItemPlacement;
}

export interface Allocation {
  /** línea → llave de la fuente. */
  assignments: Map<string, string>;
  /** Líneas que ninguna fuente pudo cubrir. */
  uncovered: string[];
}

/**
 * Reparto que cubre el **mayor número de líneas** posible sin pasar el saldo de ninguna
 * fuente (emparejamiento bipartito con capacidades y rutas de aumento). Las líneas con
 * menos fuentes posibles se procesan primero y cada línea prueba las fuentes en orden de
 * prioridad, así el resultado favorece lo que vence antes y es determinista.
 */
export function allocateCourtesies(lines: readonly CourtesyLine[], sources: readonly CourtesySource[]): Allocation {
  const ordered = [...sources].filter((s) => s.remaining > 0).sort(compareSourcePriority);
  const options = new Map(lines.map((line) => [line.key, ordered.filter((s) => s.covers(line.item))]));
  const queue = [...lines].sort((a, b) => options.get(a.key)!.length - options.get(b.key)!.length);

  const assigned = new Map<string, string>();
  const holders = new Map<string, string[]>(ordered.map((s) => [s.key, []]));
  const capacity = new Map(ordered.map((s) => [s.key, s.remaining]));

  function augment(lineKey: string, visited: Set<string>): boolean {
    for (const source of options.get(lineKey)!) {
      if (visited.has(source.key)) continue;
      visited.add(source.key);
      const current = holders.get(source.key)!;
      if (current.length < capacity.get(source.key)!) {
        current.push(lineKey);
        assigned.set(lineKey, source.key);
        return true;
      }
      // Fuente llena: intenta mover a alguna de sus líneas a otra fuente.
      for (const other of current) {
        if (augment(other, visited)) {
          current.splice(current.indexOf(other), 1, lineKey);
          assigned.set(lineKey, source.key);
          return true;
        }
      }
    }
    return false;
  }

  const uncovered: string[] = [];
  for (const line of queue) {
    if (!augment(line.key, new Set())) uncovered.push(line.key);
  }
  const order = new Map(lines.map((line, i) => [line.key, i]));
  uncovered.sort((a, b) => order.get(a)! - order.get(b)!);
  return { assignments: assigned, uncovered };
}
