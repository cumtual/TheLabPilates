import type { Temperature } from './category-tree';
import type { Cents } from './money';

/**
 * Desglose de ventas por categoría padre › subcategoría › producto (SPEC-CAFETERIA §6, ADM-05).
 * Usa las copias guardadas en cada línea, así sobrevive a cambios del menú.
 */

export interface SoldLine {
  productName: string;
  categoryName: string;
  parentCategoryName: string | null;
  temperature: Temperature | null;
  unitPriceCents: Cents;
  quantity: number;
  isCourtesy: boolean;
  courtesySource: 'monthly' | 'grant' | null;
  lineTotalCents: Cents;
}

export interface BreakdownRow {
  /** «Bebidas › Café» o «Comida» (producto colgado del padre). */
  group: string;
  productName: string;
  temperature: Temperature | null;
  soldQuantity: number;
  revenueCents: Cents;
  courtesyMonthly: number;
  courtesyGrant: number;
  courtesyValueCents: Cents;
}

export function lineGroup(line: Pick<SoldLine, 'categoryName' | 'parentCategoryName'>): string {
  return line.parentCategoryName ? `${line.parentCategoryName} › ${line.categoryName}` : line.categoryName;
}

/** Agrupa y suma; ordenado por grupo y luego por producto. */
export function breakdownByProduct(lines: readonly SoldLine[]): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  for (const line of lines) {
    const group = lineGroup(line);
    const key = `${group}\u0000${line.productName}\u0000${line.temperature ?? ''}`;
    const row =
      rows.get(key) ??
      ({
        group,
        productName: line.productName,
        temperature: line.temperature,
        soldQuantity: 0,
        revenueCents: 0,
        courtesyMonthly: 0,
        courtesyGrant: 0,
        courtesyValueCents: 0,
      } satisfies BreakdownRow);
    if (line.isCourtesy) {
      if (line.courtesySource === 'grant') row.courtesyGrant += line.quantity;
      else row.courtesyMonthly += line.quantity;
      row.courtesyValueCents += line.unitPriceCents * line.quantity;
    } else {
      row.soldQuantity += line.quantity;
      row.revenueCents += line.lineTotalCents;
    }
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.group.localeCompare(b.group, 'es') ||
      a.productName.localeCompare(b.productName, 'es') ||
      (a.temperature ?? '').localeCompare(b.temperature ?? '')
  );
}
