'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import {
  categoryDeletionBlocker,
  categoryPath,
  indexCategories,
  TEMPERATURE_LABELS,
  type CategoryRecord,
  type ProductRecord,
} from '@/modules/cafeteria/domain/category-tree';
import { formatPesos, parsePesos } from '@/modules/cafeteria/domain/money';
import {
  createCategoryAction,
  createProductAction,
  deleteCategoryAction,
  deleteProductAction,
  setProductAvailabilityAction,
  updateCategoryAction,
  updateProductAction,
} from '@/modules/cafeteria/presentation/actions/menu';
import type { AdminMenu } from '@/modules/cafeteria/presentation/types';
import { CategoryForm, type CategoryDraft } from './CategoryForm';
import { ProductForm, type ProductDraft } from './ProductForm';
import { TemperatureIcon } from './ProductGrid';

type Editor =
  | { kind: 'category'; category?: CategoryRecord; parentId?: string | null }
  | { kind: 'product'; product?: ProductRecord; categoryId?: string }
  | null;

interface Confirm {
  title: string;
  lines: string[];
  confirmLabel: string;
  danger?: boolean;
  /** Sin acción: solo informa (p. ej. por qué no se puede eliminar). */
  run?: () => Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string }>;
}

const sortBy = <T extends { sortOrder: number; name: string }>(items: T[]) =>
  [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));

/** Menú del admin (SPEC-CAFETERIA §8.2, D9, D10): árbol de categorías y productos. */
export function MenuManager({ menu }: { menu: AdminMenu }) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const index = indexCategories(menu.categories);
  const roots = sortBy(menu.categories.filter((c) => c.parentId === null));

  function open(next: Editor) {
    setErrors({});
    setMessage(null);
    setEditor(next);
  }

  function execute() {
    const current = confirm;
    setConfirm(null);
    if (!current?.run) return;
    startTransition(async () => {
      const result = await current.run!();
      if (result.success) {
        setEditor(null);
        setMessage({ ok: true, text: result.message ?? 'Listo.' });
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        setMessage({ ok: false, text: result.error ?? 'Error.' });
      }
    });
  }

  function submitCategory(draft: CategoryDraft, category?: CategoryRecord) {
    const input = { name: draft.name, parentId: draft.parentId, usesTemperature: draft.usesTemperature, sortOrder: Number(draft.sortOrder) || 0, isActive: draft.isActive };
    const level = draft.parentId ? `Subcategoría de ${index.get(draft.parentId)?.name ?? ''}` : 'Categoría padre';
    setConfirm({
      title: category ? 'Guardar categoría' : 'Crear categoría',
      lines: [`Nombre: ${draft.name.trim()}`, `Nivel: ${level}`, ...(draft.parentId ? [] : [`Usa temperatura: ${draft.usesTemperature ? 'Sí' : 'No'}`]), `Visible: ${draft.isActive ? 'Sí' : 'No'}`],
      confirmLabel: 'Sí, guardar',
      run: () => (category ? updateCategoryAction(category.id, input) : createCategoryAction(input)),
    });
  }

  function submitProduct(draft: ProductDraft, product?: ProductRecord) {
    const input = {
      categoryId: draft.categoryId,
      name: draft.name,
      price: draft.price,
      temperature: draft.temperature,
      sortOrder: Number(draft.sortOrder) || 0,
      isActive: draft.isActive,
      isAvailable: draft.isAvailable,
    };
    const category = index.get(draft.categoryId);
    const price = parsePesos(draft.price);
    setConfirm({
      title: product ? 'Guardar producto' : 'Crear producto',
      lines: [
        `Nombre: ${draft.name.trim()}`,
        `Categoría: ${category ? categoryPath(category, index) : ''}`,
        ...(draft.temperature ? [`Temperatura: ${TEMPERATURE_LABELS[draft.temperature]}`] : []),
        `Precio: ${price.ok ? formatPesos(price.cents) : draft.price}`,
      ],
      confirmLabel: 'Sí, guardar',
      run: () => (product ? updateProductAction(product.id, input) : createProductAction(input)),
    });
  }

  function askDeleteCategory(category: CategoryRecord) {
    const blocker = categoryDeletionBlocker(category.id, menu.categories, menu.products);
    setConfirm(
      blocker
        ? { title: `No se puede eliminar ${category.name}`, lines: [blocker], confirmLabel: 'Entendido' }
        : {
            title: `Eliminar ${category.name}`,
            lines: [`${categoryPath(category, index)} saldrá del menú. Las ventas pasadas no cambian.`],
            confirmLabel: 'Sí, eliminar',
            danger: true,
            run: () => deleteCategoryAction(category.id),
          }
    );
  }

  function askDeleteProduct(product: ProductRecord) {
    setConfirm({
      title: `Eliminar ${product.name}`,
      lines: [`${product.name}${product.temperature ? ` (${TEMPERATURE_LABELS[product.temperature]})` : ''} · ${formatPesos(product.priceCents)} saldrá del menú. Las ventas pasadas no cambian.`],
      confirmLabel: 'Sí, eliminar',
      danger: true,
      run: () => deleteProductAction(product.id),
    });
  }

  /** «Agotado» / «Disponible»: sin confirmación (§8.4). */
  function toggleAvailability(product: ProductRecord) {
    startTransition(async () => {
      const result = await setProductAvailabilityAction(product.id, !product.isAvailable);
      setMessage(result.success ? { ok: true, text: product.isAvailable ? `${product.name} marcado como agotado.` : `${product.name} disponible.` } : { ok: false, text: result.error });
      if (result.success) router.refresh();
    });
  }

  function productsOf(categoryId: string) {
    const items = sortBy(menu.products.filter((p) => p.categoryId === categoryId));
    if (items.length === 0) return null;
    return (
      <ul className="mt-2 divide-y divide-outline-variant/30 rounded-md border border-outline-variant/30">
        {items.map((p) => (
          <li key={p.id} data-testid={`product-${p.id}`} className="flex flex-wrap items-center gap-2 p-2 font-body text-sm">
            <span className="flex-1 min-w-0">
              {p.name} <TemperatureIcon temperature={p.temperature} />
              {!p.isActive && <span className="ml-1 text-xs text-outline">(oculto)</span>}
            </span>
            <span className="w-20 text-right">{formatPesos(p.priceCents)}</span>
            <button type="button" onClick={() => toggleAvailability(p)} disabled={isPending} className={`min-h-11 px-2 text-xs rounded border ${p.isAvailable ? 'border-outline-variant' : 'border-error/40 text-error'}`}>
              {p.isAvailable ? 'Marcar agotado' : 'Agotado · reactivar'}
            </button>
            <button type="button" onClick={() => open({ kind: 'product', product: p })} className="min-h-11 px-2 text-xs text-primary underline">
              Editar
            </button>
            <button type="button" onClick={() => askDeleteProduct(p)} className="min-h-11 px-2 text-xs text-error">
              Eliminar
            </button>
          </li>
        ))}
      </ul>
    );
  }

  function categoryActions(category: CategoryRecord) {
    return (
      <div className="flex flex-wrap gap-1">
        {category.parentId === null && (
          <button type="button" onClick={() => open({ kind: 'category', parentId: category.id })} className="min-h-11 px-2 text-xs text-primary underline">
            Nueva subcategoría
          </button>
        )}
        <button type="button" onClick={() => open({ kind: 'product', categoryId: category.id })} className="min-h-11 px-2 text-xs text-primary underline">
          Nuevo producto
        </button>
        <button type="button" onClick={() => open({ kind: 'category', category })} className="min-h-11 px-2 text-xs text-primary underline">
          Editar
        </button>
        <button type="button" onClick={() => askDeleteCategory(category)} className="min-h-11 px-2 text-xs text-error">
          Eliminar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => open({ kind: 'category', parentId: null })} className="min-h-11 px-4 rounded-DEFAULT bg-soft-charcoal font-semibold text-on-primary">
          Nueva categoría
        </button>
        <button type="button" onClick={() => open({ kind: 'product' })} disabled={menu.categories.length === 0} className="min-h-11 px-4 rounded-DEFAULT border border-outline-variant disabled:opacity-50">
          Nuevo producto
        </button>
      </div>

      {message && (
        <p role="status" className={`font-body text-sm ${message.ok ? 'text-primary' : 'text-error'}`}>
          {message.text}
        </p>
      )}

      {editor?.kind === 'category' && (
        <CategoryForm
          key={editor.category?.id ?? `new-${editor.parentId}`}
          category={editor.category}
          defaultParentId={editor.parentId ?? null}
          categories={menu.categories}
          errors={errors}
          pending={isPending}
          onSubmit={(draft) => submitCategory(draft, editor.category)}
          onCancel={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'product' && (
        <ProductForm
          key={editor.product?.id ?? `new-${editor.categoryId}`}
          product={editor.product}
          defaultCategoryId={editor.categoryId}
          categories={menu.categories}
          errors={errors}
          pending={isPending}
          onSubmit={(draft) => submitProduct(draft, editor.product)}
          onCancel={() => setEditor(null)}
        />
      )}

      {roots.length === 0 ? (
        <p className="font-body text-body-md text-on-surface-variant py-8 text-center">Crea la primera categoría, por ejemplo «Bebidas» o «Comida».</p>
      ) : (
        <ul className="space-y-4" aria-label="Categorías del menú">
          {roots.map((root) => (
            <li key={root.id} data-testid={`category-${root.id}`} className="rounded-lg bg-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-headline text-lg text-on-surface">
                  {root.name}
                  {root.usesTemperature && <span className="ml-2 align-middle text-xs text-on-surface-variant">Fría / caliente</span>}
                  {!root.isActive && <span className="ml-2 text-xs text-outline">(oculta)</span>}
                </h2>
                {categoryActions(root)}
              </div>
              {productsOf(root.id)}
              <ul className="mt-3 space-y-3 border-l-2 border-outline-variant/40 pl-3">
                {sortBy(menu.categories.filter((c) => c.parentId === root.id)).map((sub) => (
                  <li key={sub.id} data-testid={`category-${sub.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-body text-body-md font-semibold text-on-surface">
                        {sub.name}
                        {!sub.isActive && <span className="ml-2 text-xs text-outline">(oculta)</span>}
                      </h3>
                      {categoryActions(sub)}
                    </div>
                    {productsOf(sub.id)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={execute}
        title={confirm?.title ?? ''}
        confirmLabel={confirm?.confirmLabel}
        hideCancel={!confirm?.run}
        variant={confirm?.danger ? 'danger' : 'default'}
      >
        <ul className="space-y-1">
          {confirm?.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
