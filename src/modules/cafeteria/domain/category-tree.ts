import { CafeteriaError, invalid } from './errors';
import type { Cents } from './money';

/**
 * Árbol de categorías de dos niveles (SPEC-CAFETERIA D10, A1, A10, §4.5):
 * categoría padre → subcategoría. Un producto cuelga de cualquiera de los dos niveles.
 */

export type Temperature = 'cold' | 'hot';

export interface CategoryRecord {
  id: string;
  parentId: string | null;
  name: string;
  /** Solo significa algo en el padre; las subcategorías lo heredan. */
  usesTemperature: boolean;
  sortOrder: number;
  isActive: boolean;
  courtesyEligible: boolean | null;
  deletedAt: Date | null;
}

export interface ProductRecord {
  id: string;
  categoryId: string;
  name: string;
  priceCents: Cents;
  temperature: Temperature | null;
  courtesyOverride: boolean | null;
  isAvailable: boolean;
  isActive: boolean;
  sortOrder: number;
  deletedAt: Date | null;
}

export const TEMPERATURE_LABELS: Record<Temperature, string> = { cold: 'fría', hot: 'caliente' };

export type CategoryIndex = ReadonlyMap<string, CategoryRecord>;

export function indexCategories(categories: readonly CategoryRecord[]): CategoryIndex {
  return new Map(categories.map((category) => [category.id, category]));
}

const isLive = (node: { deletedAt: Date | null }) => node.deletedAt === null;

/** La categoría padre de una categoría (ella misma si ya es padre). */
export function rootOf(category: CategoryRecord, index: CategoryIndex): CategoryRecord {
  if (category.parentId === null) return category;
  return index.get(category.parentId) ?? category;
}

/** Nombre legible: «Comida › Postres» o «Bebidas». */
export function categoryPath(category: CategoryRecord, index: CategoryIndex): string {
  const root = rootOf(category, index);
  return root.id === category.id ? category.name : `${root.name} › ${category.name}`;
}

/** Ids de la categoría y de sus subcategorías (alcance de un regalo «categoría», §4.6). */
export function categoryWithDescendants(categoryId: string, categories: readonly CategoryRecord[]): Set<string> {
  return new Set([categoryId, ...categories.filter((c) => c.parentId === categoryId).map((c) => c.id)]);
}

// ── Estructura ───────────────────────────────────────────────────────────────

export interface CategoryPlacement {
  /** Ausente al crear. */
  id?: string;
  parentId: string | null;
  name: string;
  usesTemperature: boolean;
}

/**
 * Valida nivel, padre, nombre entre hermanas e interruptor de temperatura (D10, A1, A10).
 * Lanza `CafeteriaError` con el campo del formulario.
 */
export function validateCategoryPlacement(input: CategoryPlacement, categories: readonly CategoryRecord[]): void {
  const live = categories.filter(isLive);
  if (input.parentId !== null) {
    if (input.id !== undefined && input.parentId === input.id) {
      throw invalid('Una categoría no puede ser su propio padre.', 'parentId');
    }
    const parent = live.find((c) => c.id === input.parentId);
    if (!parent) throw new CafeteriaError('NOT_FOUND', 'La categoría padre no existe.', 'parentId');
    if (parent.parentId !== null) {
      throw invalid('Solo hay dos niveles: una subcategoría no puede tener subcategorías.', 'parentId');
    }
    if (input.id !== undefined && live.some((c) => c.parentId === input.id)) {
      throw invalid('Esta categoría tiene subcategorías; no puede volverse subcategoría.', 'parentId');
    }
    if (input.usesTemperature) {
      throw invalid('«Usa temperatura» solo se define en la categoría padre.', 'usesTemperature');
    }
  }
  if (isCategoryNameTaken(input.name, input.parentId, categories, input.id)) {
    throw new CafeteriaError('CONFLICT', 'Ya existe una categoría con ese nombre en este nivel.', 'name');
  }
}

/** Nombre único entre hermanas no eliminadas, sin distinguir mayúsculas. */
export function isCategoryNameTaken(
  name: string,
  parentId: string | null,
  categories: readonly CategoryRecord[],
  excludeId?: string
): boolean {
  const key = name.trim().toLowerCase();
  return categories.some(
    (c) => isLive(c) && c.id !== excludeId && c.parentId === parentId && c.name.trim().toLowerCase() === key
  );
}

/** Producto único por categoría, nombre y temperatura: un Latte frío y uno caliente conviven (D5). */
export function isProductNameTaken(
  input: { name: string; categoryId: string; temperature: Temperature | null },
  products: readonly ProductRecord[],
  excludeId?: string
): boolean {
  const key = input.name.trim().toLowerCase();
  return products.some(
    (p) =>
      isLive(p) &&
      p.id !== excludeId &&
      p.categoryId === input.categoryId &&
      p.name.trim().toLowerCase() === key &&
      p.temperature === input.temperature
  );
}

/** Motivo por el que no se puede eliminar, o `null` si se puede (§4.5). */
export function categoryDeletionBlocker(
  categoryId: string,
  categories: readonly CategoryRecord[],
  products: readonly ProductRecord[]
): string | null {
  const subcategories = categories.filter((c) => isLive(c) && c.parentId === categoryId).length;
  const items = products.filter((p) => isLive(p) && p.categoryId === categoryId).length;
  if (subcategories === 0 && items === 0) return null;
  const parts = [
    subcategories > 0 ? `${subcategories} ${subcategories === 1 ? 'subcategoría' : 'subcategorías'}` : null,
    items > 0 ? `${items} ${items === 1 ? 'producto' : 'productos'}` : null,
  ].filter(Boolean);
  return `Tiene ${parts.join(' y ')}. Elimínalos o muévelos primero.`;
}

// ── Temperatura (A1) ─────────────────────────────────────────────────────────

export function requiresTemperature(categoryId: string, index: CategoryIndex): boolean {
  const category = index.get(categoryId);
  return category ? rootOf(category, index).usesTemperature : false;
}

/** Bebida (raíz con temperatura) ⇒ `cold`/`hot` obligatorio; comida ⇒ `null`. */
export function validateProductTemperature(
  temperature: Temperature | null,
  categoryId: string,
  index: CategoryIndex
): void {
  if (requiresTemperature(categoryId, index)) {
    if (temperature === null) throw invalid('Elige si es fría o caliente.', 'temperature');
  } else if (temperature !== null) {
    throw invalid('Esta categoría no usa temperatura.', 'temperature');
  }
}

/**
 * Productos de la rama de `rootId` que dejarían de cumplir la regla si el interruptor
 * cambia a `usesTemperature`. Lista vacía ⇒ el cambio se permite.
 */
export function productsBreakingTemperatureRule(
  rootId: string,
  usesTemperature: boolean,
  categories: readonly CategoryRecord[],
  products: readonly ProductRecord[]
): ProductRecord[] {
  const branch = categoryWithDescendants(rootId, categories.filter(isLive));
  return products.filter(
    (p) => isLive(p) && branch.has(p.categoryId) && (usesTemperature ? p.temperature === null : p.temperature !== null)
  );
}

// ── Visibilidad (A10) ────────────────────────────────────────────────────────

export function isCategoryVisible(category: CategoryRecord, index: CategoryIndex): boolean {
  if (!isLive(category) || !category.isActive) return false;
  if (category.parentId === null) return true;
  const parent = index.get(category.parentId);
  return parent !== undefined && isLive(parent) && parent.isActive;
}

/** Visible en la caja y en /menu: él, su categoría y su padre activos y no eliminados. */
export function isProductVisible(product: ProductRecord, index: CategoryIndex): boolean {
  if (!isLive(product) || !product.isActive) return false;
  const category = index.get(product.categoryId);
  return category !== undefined && isCategoryVisible(category, index);
}

/** Se puede vender: visible y no agotado. */
export function isProductSellable(product: ProductRecord, index: CategoryIndex): boolean {
  return isProductVisible(product, index) && product.isAvailable;
}

// ── Menú ─────────────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  name: string;
  priceCents: Cents;
  temperature: Temperature | null;
  isAvailable: boolean;
  categoryId: string;
  rootCategoryId: string;
}

export interface MenuSubcategory {
  id: string;
  name: string;
  items: MenuItem[];
}

export interface MenuSection {
  id: string;
  name: string;
  usesTemperature: boolean;
  /** Productos que cuelgan directo del padre; se muestran antes que las subcategorías. */
  items: MenuItem[];
  subcategories: MenuSubcategory[];
}

const bySortThenName = <T extends { sortOrder: number; name: string }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es');

/**
 * Árbol visible del menú: padre › subcategorías › productos, ordenado por `sort_order`.
 * Solo nodos visibles; una rama sin productos visibles no aparece.
 */
export function buildMenuTree(categories: readonly CategoryRecord[], products: readonly ProductRecord[]): MenuSection[] {
  const index = indexCategories(categories);
  const visibleProducts = products.filter((p) => isProductVisible(p, index)).sort(bySortThenName);
  const itemsOf = (categoryId: string, rootCategoryId: string): MenuItem[] =>
    visibleProducts
      .filter((p) => p.categoryId === categoryId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        priceCents: p.priceCents,
        temperature: p.temperature,
        isAvailable: p.isAvailable,
        categoryId: p.categoryId,
        rootCategoryId,
      }));

  return categories
    .filter((c) => c.parentId === null && isCategoryVisible(c, index))
    .sort(bySortThenName)
    .map((root) => ({
      id: root.id,
      name: root.name,
      usesTemperature: root.usesTemperature,
      items: itemsOf(root.id, root.id),
      subcategories: categories
        .filter((c) => c.parentId === root.id && isCategoryVisible(c, index))
        .sort(bySortThenName)
        .map((sub) => ({ id: sub.id, name: sub.name, items: itemsOf(sub.id, root.id) }))
        .filter((sub) => sub.items.length > 0),
    }))
    .filter((section) => section.items.length > 0 || section.subcategories.length > 0);
}

/** Todos los artículos del árbol, en orden de menú. */
export function flattenMenu(sections: readonly MenuSection[]): MenuItem[] {
  return sections.flatMap((section) => [...section.items, ...section.subcategories.flatMap((sub) => sub.items)]);
}
