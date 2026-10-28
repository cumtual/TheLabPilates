'use client';

import { useState } from 'react';
import {
  categoryPath,
  indexCategories,
  requiresTemperature,
  type CategoryRecord,
  type ProductRecord,
  type Temperature,
} from '@/modules/cafeteria/domain/category-tree';
import { centsToInput, parsePesos } from '@/modules/cafeteria/domain/money';

export interface ProductDraft {
  categoryId: string;
  name: string;
  price: string;
  temperature: Temperature | null;
  sortOrder: string;
  isActive: boolean;
  isAvailable: boolean;
}

interface ProductFormProps {
  product?: ProductRecord;
  defaultCategoryId?: string;
  categories: CategoryRecord[];
  errors: Record<string, string>;
  pending: boolean;
  onSubmit: (draft: ProductDraft) => void;
  onCancel: () => void;
}

/** Validación local antes de confirmar: precio con centavos y temperatura según la categoría (A1). */
export function validateProductDraft(draft: ProductDraft, categories: CategoryRecord[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.name.trim() === '') errors.name = 'Escribe el nombre.';
  if (!draft.categoryId) errors.categoryId = 'Elige una categoría.';
  const price = parsePesos(draft.price);
  if (!price.ok) errors.price = price.error;
  else if (price.cents === 0) errors.price = 'El monto debe ser mayor a $0.00.';
  if (draft.categoryId && requiresTemperature(draft.categoryId, indexCategories(categories)) && draft.temperature === null) {
    errors.temperature = 'Elige si es frío o caliente.';
  }
  return errors;
}

/** Alta y edición de producto (SPEC-CAFETERIA D4, D5, A1). */
export function ProductForm({ product, defaultCategoryId = '', categories, errors, pending, onSubmit, onCancel }: ProductFormProps) {
  const index = indexCategories(categories);
  const [draft, setDraft] = useState<ProductDraft>({
    categoryId: product?.categoryId ?? defaultCategoryId,
    name: product?.name ?? '',
    price: product ? centsToInput(product.priceCents) : '',
    temperature: product?.temperature ?? null,
    sortOrder: String(product?.sortOrder ?? 0),
    isActive: product?.isActive ?? true,
    isAvailable: product?.isAvailable ?? true,
  });
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const shown = { ...errors, ...localErrors };
  const usesTemperature = draft.categoryId ? requiresTemperature(draft.categoryId, index) : false;
  const options = [...categories].sort((a, b) => categoryPath(a, index).localeCompare(categoryPath(b, index), 'es'));
  const title = product ? `Editar ${product.name}` : 'Nuevo producto';

  return (
    <form
      aria-label={title}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const found = validateProductDraft(draft, categories);
        setLocalErrors(found);
        if (Object.keys(found).length === 0) onSubmit({ ...draft, temperature: usesTemperature ? draft.temperature : null });
      }}
      className="rounded-lg bg-surface p-4 shadow-sm space-y-3"
    >
      <h2 className="font-headline text-lg text-on-surface">{title}</h2>
      <div>
        <label htmlFor="product-category" className="block font-body text-sm font-semibold text-on-surface">
          Categoría
        </label>
        <select
          id="product-category"
          value={draft.categoryId}
          onChange={(e) => {
            const categoryId = e.target.value;
            // Al pasar a una categoría sin temperatura (comida) se limpia.
            setDraft({ ...draft, categoryId, temperature: categoryId && requiresTemperature(categoryId, index) ? draft.temperature : null });
          }}
          className="mt-1 w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface"
        >
          <option value="">Elige…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryPath(c, index)}
            </option>
          ))}
        </select>
        {shown.categoryId && <p className="mt-1 font-body text-xs text-error">{shown.categoryId}</p>}
      </div>

      <div>
        <label htmlFor="product-name" className="block font-body text-sm font-semibold text-on-surface">
          Nombre
        </label>
        <input
          id="product-name"
          maxLength={80}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="mt-1 w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface"
        />
        {shown.name && <p className="mt-1 font-body text-xs text-error">{shown.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="product-price" className="block font-body text-sm font-semibold text-on-surface">
            Precio (MXN)
          </label>
          <input
            id="product-price"
            inputMode="decimal"
            placeholder="42.50"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            className="mt-1 w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface"
          />
          {shown.price && <p className="mt-1 font-body text-xs text-error">{shown.price}</p>}
        </div>
        {usesTemperature && (
          <div>
            <label htmlFor="product-temperature" className="block font-body text-sm font-semibold text-on-surface">
              Temperatura
            </label>
            <select
              id="product-temperature"
              value={draft.temperature ?? ''}
              onChange={(e) => setDraft({ ...draft, temperature: (e.target.value || null) as Temperature | null })}
              className="mt-1 w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface"
            >
              <option value="">Elige…</option>
              <option value="cold">Frío</option>
              <option value="hot">Caliente</option>
            </select>
            {shown.temperature && <p className="mt-1 font-body text-xs text-error">{shown.temperature}</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label htmlFor="product-order" className="block font-body text-sm font-semibold text-on-surface">
            Orden
          </label>
          <input
            id="product-order"
            type="number"
            min={0}
            value={draft.sortOrder}
            onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
            className="mt-1 w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface"
          />
        </div>
        <label className="flex items-center gap-2 sm:mt-6 min-h-11 font-body text-sm">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="h-4 w-4 accent-primary" />
          Visible en el menú
        </label>
        <label className="flex items-center gap-2 sm:mt-6 min-h-11 font-body text-sm">
          <input type="checkbox" checked={draft.isAvailable} onChange={(e) => setDraft({ ...draft, isAvailable: e.target.checked })} className="h-4 w-4 accent-primary" />
          Disponible (no agotado)
        </label>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="min-h-11 px-5 rounded-DEFAULT bg-soft-charcoal font-semibold text-on-primary disabled:opacity-50">
          Guardar
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 px-5 rounded-DEFAULT border border-outline-variant">
          Cancelar
        </button>
      </div>
    </form>
  );
}
