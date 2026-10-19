import {
  buildMenuTree,
  categoryDeletionBlocker,
  isProductNameTaken,
  productsBreakingTemperatureRule,
  validateCategoryPlacement,
  validateProductTemperature,
  type CategoryRecord,
  type MenuSection,
  type ProductRecord,
  type Temperature,
} from '../../domain/category-tree';
import { effectiveCourtesyEligibility } from '../../domain/courtesy';
import { CafeteriaError, invalid } from '../../domain/errors';
import { MAX_PRICE_CENTS, type Cents } from '../../domain/money';
import type { Actor, BankAccount, CafeteriaDeps, CafeteriaTx, UnitOfWork } from '../ports';
import { ADMIN_ONLY, BAR_ROLES, loadMenuSnapshot, requireRole } from '../shared';

/** Menú: CRUD del admin (SPEC-CAFETERIA §5, D5, D7, D10), menú público y datos de la caja. */

export const CATEGORY_NAME_MAX = 60;
export const PRODUCT_NAME_MAX = 80;

function cleanName(name: string, max: number): string {
  const value = name.trim().replace(/\s+/g, ' ');
  if (value === '') throw invalid('Escribe el nombre.', 'name');
  if (value.length > max) throw invalid(`Máximo ${max} caracteres.`, 'name');
  return value;
}

function checkPrice(priceCents: Cents): void {
  if (!Number.isInteger(priceCents) || priceCents < 1 || priceCents > MAX_PRICE_CENTS) {
    throw invalid('El precio va de $0.01 a $10,000.00.', 'price');
  }
}

/** Cambia el menú en una transacción y, solo si tuvo éxito, invalida el caché (D7). */
async function mutateMenu<T>(deps: CafeteriaDeps, actor: Actor | null, work: (tx: CafeteriaTx, now: Date) => Promise<T>): Promise<T> {
  requireRole(actor, ADMIN_ONLY);
  const result = await deps.uow.run(async (tx) => {
    await tx.menu.lockMenu();
    return work(tx, deps.clock.now());
  });
  await deps.menuCache.invalidate();
  return result;
}

function missingTemperatureError(products: readonly ProductRecord[], usesTemperature: boolean): CafeteriaError {
  const names = products.map((p) => p.name);
  return new CafeteriaError(
    'INVALID',
    usesTemperature
      ? `Antes, marca frío o caliente en: ${names.join(', ')}.`
      : `Antes, quita la temperatura de: ${names.join(', ')}.`,
    'usesTemperature',
    { products: names }
  );
}

// ── Categorías ───────────────────────────────────────────────────────────────

export interface CategoryInput {
  name: string;
  parentId: string | null;
  usesTemperature: boolean;
  sortOrder: number;
  isActive: boolean;
}

export async function createCategory(deps: CafeteriaDeps, actor: Actor | null, input: CategoryInput): Promise<CategoryRecord> {
  return mutateMenu(deps, actor, async (tx) => {
    const categories = await tx.menu.listCategories();
    const name = cleanName(input.name, CATEGORY_NAME_MAX);
    validateCategoryPlacement({ name, parentId: input.parentId, usesTemperature: input.usesTemperature }, categories);
    return tx.menu.insertCategory({
      name,
      parentId: input.parentId,
      usesTemperature: input.parentId === null && input.usesTemperature,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      courtesyEligible: null,
    });
  });
}

export async function updateCategory(deps: CafeteriaDeps, actor: Actor | null, id: string, input: CategoryInput): Promise<void> {
  return mutateMenu(deps, actor, async (tx) => {
    const { categories, products, index } = await loadMenuSnapshot(tx);
    const current = categories.find((c) => c.id === id && c.deletedAt === null);
    if (!current) throw new CafeteriaError('NOT_FOUND', 'La categoría no existe.');
    const name = cleanName(input.name, CATEGORY_NAME_MAX);
    validateCategoryPlacement({ id, name, parentId: input.parentId, usesTemperature: input.usesTemperature }, categories);

    // La regla de temperatura de la rama tras el cambio (A1, §4.5).
    if (input.parentId === null) {
      const breaking = productsBreakingTemperatureRule(id, input.usesTemperature, categories, products);
      if (breaking.length > 0) throw missingTemperatureError(breaking, input.usesTemperature);
    } else {
      const newRoot = index.get(input.parentId)!;
      const own = products.filter((p) => p.deletedAt === null && p.categoryId === id);
      const breaking = own.filter((p) => (newRoot.usesTemperature ? p.temperature === null : p.temperature !== null));
      if (breaking.length > 0) throw missingTemperatureError(breaking, newRoot.usesTemperature);
    }

    await tx.menu.updateCategory(id, {
      name,
      parentId: input.parentId,
      usesTemperature: input.parentId === null && input.usesTemperature,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    });
  });
}

export async function deleteCategory(deps: CafeteriaDeps, actor: Actor | null, id: string): Promise<void> {
  return mutateMenu(deps, actor, async (tx, now) => {
    const { categories, products } = await loadMenuSnapshot(tx);
    if (!categories.some((c) => c.id === id && c.deletedAt === null)) throw new CafeteriaError('NOT_FOUND', 'La categoría no existe.');
    const blocker = categoryDeletionBlocker(id, categories, products);
    if (blocker) throw new CafeteriaError('CONFLICT', blocker);
    await tx.menu.updateCategory(id, { deletedAt: now, isActive: false });
  });
}

// ── Productos ────────────────────────────────────────────────────────────────

export interface ProductInput {
  categoryId: string;
  name: string;
  priceCents: Cents;
  temperature: Temperature | null;
  sortOrder: number;
  isActive: boolean;
  isAvailable: boolean;
}

async function validateProduct(tx: CafeteriaTx, input: ProductInput, excludeId?: string): Promise<string> {
  const { categories, products, index } = await loadMenuSnapshot(tx);
  if (!categories.some((c) => c.id === input.categoryId && c.deletedAt === null)) {
    throw new CafeteriaError('NOT_FOUND', 'La categoría no existe.', 'categoryId');
  }
  const name = cleanName(input.name, PRODUCT_NAME_MAX);
  checkPrice(input.priceCents);
  validateProductTemperature(input.temperature, input.categoryId, index);
  if (isProductNameTaken({ name, categoryId: input.categoryId, temperature: input.temperature }, products, excludeId)) {
    throw new CafeteriaError(
      'CONFLICT',
      input.temperature ? 'Ya existe ese producto con esa temperatura en la categoría.' : 'Ya existe un producto con ese nombre en la categoría.',
      'name'
    );
  }
  return name;
}

export async function createProduct(deps: CafeteriaDeps, actor: Actor | null, input: ProductInput): Promise<ProductRecord> {
  return mutateMenu(deps, actor, async (tx) => {
    const name = await validateProduct(tx, input);
    return tx.menu.insertProduct({
      categoryId: input.categoryId,
      name,
      priceCents: input.priceCents,
      temperature: input.temperature,
      courtesyOverride: null,
      isAvailable: input.isAvailable,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    });
  });
}

async function requireProduct(tx: CafeteriaTx, id: string): Promise<ProductRecord> {
  const product = (await tx.menu.listProducts()).find((p) => p.id === id && p.deletedAt === null);
  if (!product) throw new CafeteriaError('NOT_FOUND', 'El producto no existe.');
  return product;
}

export async function updateProduct(deps: CafeteriaDeps, actor: Actor | null, id: string, input: ProductInput): Promise<void> {
  return mutateMenu(deps, actor, async (tx) => {
    await requireProduct(tx, id);
    const name = await validateProduct(tx, input, id);
    await tx.menu.updateProduct(id, {
      categoryId: input.categoryId,
      name,
      priceCents: input.priceCents,
      temperature: input.temperature,
      isAvailable: input.isAvailable,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    });
  });
}

export async function deleteProduct(deps: CafeteriaDeps, actor: Actor | null, id: string): Promise<void> {
  return mutateMenu(deps, actor, async (tx, now) => {
    await requireProduct(tx, id);
    await tx.menu.updateProduct(id, { deletedAt: now, isActive: false });
  });
}

/** «Agotado» / «Disponible»: no lleva confirmación (§8.4) pero sí invalida el caché. */
export async function setProductAvailability(deps: CafeteriaDeps, actor: Actor | null, id: string, isAvailable: boolean): Promise<void> {
  return mutateMenu(deps, actor, async (tx) => {
    await requireProduct(tx, id);
    await tx.menu.updateProduct(id, { isAvailable });
  });
}

// ── Lecturas ─────────────────────────────────────────────────────────────────

export interface AdminMenu {
  categories: CategoryRecord[];
  products: ProductRecord[];
}

/** Lo no eliminado, activo o no, para el CRUD. */
export async function getAdminMenu(deps: CafeteriaDeps, actor: Actor | null): Promise<AdminMenu> {
  requireRole(actor, ADMIN_ONLY);
  return deps.uow.read(async (tx) => {
    const { categories, products } = await loadMenuSnapshot(tx);
    return {
      categories: categories.filter((c) => c.deletedAt === null),
      products: products.filter((p) => p.deletedAt === null),
    };
  });
}

/** Árbol público (§7): lo que se guarda en el caché de `/menu`. Sin datos de cortesía. */
export async function loadPublicMenu(uow: UnitOfWork): Promise<MenuSection[]> {
  return uow.read(async (tx) => {
    const { categories, products } = await loadMenuSnapshot(tx);
    return buildMenuTree(categories, products);
  });
}

export interface RegisterData {
  sections: MenuSection[];
  /** Productos que el cupo mensual de coach cubre (D3). */
  monthlyEligibleIds: string[];
  barAccount: BankAccount | null;
}

/** Caja: siempre fresca (no usa el caché), con la cuenta de barra y la elegibilidad D3. */
export async function getRegisterData(deps: CafeteriaDeps, actor: Actor | null): Promise<RegisterData> {
  requireRole(actor, BAR_ROLES);
  return deps.uow.read(async (tx) => {
    const snapshot = await loadMenuSnapshot(tx);
    const sections = buildMenuTree(snapshot.categories, snapshot.products);
    const visibleIds = new Set(sections.flatMap((s) => [...s.items, ...s.subcategories.flatMap((sub) => sub.items)]).map((i) => i.id));
    const monthlyEligibleIds = snapshot.products
      .filter((p) => visibleIds.has(p.id) && effectiveCourtesyEligibility(p, snapshot.index).eligible)
      .map((p) => p.id);
    return { sections, monthlyEligibleIds, barAccount: await tx.bank.getBarAccount() };
  });
}

