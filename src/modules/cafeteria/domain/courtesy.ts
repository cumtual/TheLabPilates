import { rootOf, type CategoryIndex, type ProductRecord } from './category-tree';

/**
 * Cupo mensual de cortesías de coaches (SPEC-CAFETERIA D3, A7, A9, §4.2).
 * El periodo (`'YYYY-MM'` CDMX) y su fin los calcula el `Clock`; aquí solo hay reglas.
 */

export type EligibilitySource = 'product' | 'subcategory' | 'parent' | 'default';

export interface EffectiveEligibility {
  eligible: boolean;
  /** De dónde sale el valor: el admin lo ve en la pantalla de reglas. */
  source: EligibilitySource;
}

/** `override ?? subcategoría ?? padre ?? false`. */
export function effectiveCourtesyEligibility(
  product: Pick<ProductRecord, 'categoryId' | 'courtesyOverride'>,
  index: CategoryIndex
): EffectiveEligibility {
  if (product.courtesyOverride !== null) return { eligible: product.courtesyOverride, source: 'product' };
  const category = index.get(product.categoryId);
  if (!category) return { eligible: false, source: 'default' };
  const root = rootOf(category, index);
  if (root.id !== category.id && category.courtesyEligible !== null) {
    return { eligible: category.courtesyEligible, source: 'subcategory' };
  }
  if (root.courtesyEligible !== null) return { eligible: root.courtesyEligible, source: 'parent' };
  return { eligible: false, source: 'default' };
}

/** Saldo del mes: `max(0, límite − usadas)`. */
export function monthlyCourtesyBalance(limit: number, used: number): number {
  return Math.max(0, limit - used);
}

export const MONTHLY_COURTESY_MAX = 31;
