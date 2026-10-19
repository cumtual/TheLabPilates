'use server';

import { z } from 'zod';
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  setProductAvailability,
  updateCategory,
  updateProduct,
  type ProductInput,
} from '../../application/use-cases/menu';
import { ADMIN_ONLY } from '../../application/shared';
import { categorySchema, idSchema, productSchema } from '../schemas';
import { runAction } from '../run-action';

/**
 * CRUD del menú (solo admin). Cada caso de uso invalida el caché del menú público
 * al terminar bien (D7); lo vigila `menu-cache-guard.test.ts`.
 */

const toProduct = ({ price, ...rest }: z.output<typeof productSchema>): ProductInput => ({ ...rest, priceCents: price });

export async function createCategoryAction(input: unknown) {
  return runAction({
    roles: ADMIN_ONLY,
    schema: categorySchema,
    input,
    message: 'Categoría creada.',
    run: async (deps, actor, data) => ({ id: (await createCategory(deps, actor, data)).id }),
  });
}

export async function updateCategoryAction(id: unknown, input: unknown) {
  return runAction({
    roles: ADMIN_ONLY,
    schema: z.object({ id: idSchema, data: categorySchema }),
    input: { id, data: input },
    message: 'Categoría actualizada.',
    run: (deps, actor, { id: categoryId, data }) => updateCategory(deps, actor, categoryId, data),
  });
}

export async function deleteCategoryAction(id: unknown) {
  return runAction({
    roles: ADMIN_ONLY,
    schema: idSchema,
    input: id,
    message: 'Categoría eliminada.',
    run: (deps, actor, categoryId) => deleteCategory(deps, actor, categoryId),
  });
}

export async function createProductAction(input: unknown) {
  return runAction({
    roles: ADMIN_ONLY,
    schema: productSchema,
    input,
    message: 'Producto creado.',
    run: async (deps, actor, data) => ({ id: (await createProduct(deps, actor, toProduct(data))).id }),
  });
}

export async function updateProductAction(id: unknown, input: unknown) {
  return runAction({
    roles: ADMIN_ONLY,
    schema: z.object({ id: idSchema, data: productSchema }),
    input: { id, data: input },
    message: 'Producto actualizado.',
    run: (deps, actor, { id: productId, data }) => updateProduct(deps, actor, productId, toProduct(data)),
  });
}

export async function deleteProductAction(id: unknown) {
  return runAction({
    roles: ADMIN_ONLY,
    schema: idSchema,
    input: id,
    message: 'Producto eliminado.',
    run: (deps, actor, productId) => deleteProduct(deps, actor, productId),
  });
}

export async function setProductAvailabilityAction(id: unknown, isAvailable: unknown) {
  return runAction({
    roles: ADMIN_ONLY,
    schema: z.object({ id: idSchema, isAvailable: z.boolean() }),
    input: { id, isAvailable },
    run: (deps, actor, data) => setProductAvailability(deps, actor, data.id, data.isAvailable),
  });
}
