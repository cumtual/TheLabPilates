'use client';

import { useState } from 'react';
import type { CategoryRecord } from '@/modules/cafeteria/domain/category-tree';

export interface CategoryDraft {
  name: string;
  parentId: string | null;
  usesTemperature: boolean;
  sortOrder: string;
  isActive: boolean;
}

interface CategoryFormProps {
  /** Categoría a editar; sin ella se crea. */
  category?: CategoryRecord;
  /** Padre fijo al crear una subcategoría. */
  defaultParentId?: string | null;
  categories: CategoryRecord[];
  errors: Record<string, string>;
  pending: boolean;
  onSubmit: (draft: CategoryDraft) => void;
  onCancel: () => void;
}

/** Alta y edición de categoría padre o subcategoría (SPEC-CAFETERIA D10, A1). */
export function CategoryForm({ category, defaultParentId = null, categories, errors, pending, onSubmit, onCancel }: CategoryFormProps) {
  const [draft, setDraft] = useState<CategoryDraft>({
    name: category?.name ?? '',
    parentId: category ? category.parentId : defaultParentId,
    usesTemperature: category?.usesTemperature ?? false,
    sortOrder: String(category?.sortOrder ?? 0),
    isActive: category?.isActive ?? true,
  });
  const hasChildren = category ? categories.some((c) => c.parentId === category.id) : false;
  const roots = categories.filter((c) => c.parentId === null && c.id !== category?.id);
  const isRoot = draft.parentId === null;
  const title = category ? `Editar ${category.name}` : isRoot ? 'Nueva categoría padre' : 'Nueva subcategoría';

  return (
    <form
      aria-label={title}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...draft, usesTemperature: isRoot && draft.usesTemperature });
      }}
      className="rounded-lg bg-surface p-4 shadow-sm space-y-3"
    >
      <h2 className="font-headline text-lg text-on-surface">{title}</h2>
      <div>
        <label htmlFor="category-name" className="block font-body text-sm font-semibold text-on-surface">
          Nombre
        </label>
        <input
          id="category-name"
          maxLength={60}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="mt-1 w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface"
        />
        {errors.name && <p className="mt-1 font-body text-xs text-error">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="category-parent" className="block font-body text-sm font-semibold text-on-surface">
          Nivel
        </label>
        <select
          id="category-parent"
          value={draft.parentId ?? ''}
          disabled={hasChildren}
          onChange={(e) => setDraft({ ...draft, parentId: e.target.value || null, usesTemperature: e.target.value ? false : draft.usesTemperature })}
          className="mt-1 w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface disabled:opacity-60"
        >
          <option value="">Categoría padre</option>
          {roots.map((root) => (
            <option key={root.id} value={root.id}>
              Subcategoría de {root.name}
            </option>
          ))}
        </select>
        {hasChildren && <p className="mt-1 font-body text-xs text-on-surface-variant">Tiene subcategorías: no puede volverse subcategoría.</p>}
        {errors.parentId && <p className="mt-1 font-body text-xs text-error">{errors.parentId}</p>}
      </div>

      {isRoot && (
        <label className="flex items-start gap-2 min-h-11 font-body text-sm text-on-surface">
          <input
            type="checkbox"
            checked={draft.usesTemperature}
            onChange={(e) => setDraft({ ...draft, usesTemperature: e.target.checked })}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            Usa temperatura (frío / caliente)
            <span className="block text-xs text-on-surface-variant">Para bebidas. Sus subcategorías lo heredan.</span>
          </span>
        </label>
      )}
      {errors.usesTemperature && <p className="font-body text-xs text-error">{errors.usesTemperature}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="category-order" className="block font-body text-sm font-semibold text-on-surface">
            Orden
          </label>
          <input
            id="category-order"
            type="number"
            min={0}
            value={draft.sortOrder}
            onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
            className="mt-1 w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface"
          />
        </div>
        <label className="flex items-center gap-2 mt-6 min-h-11 font-body text-sm text-on-surface">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="h-4 w-4 accent-primary" />
          Visible en el menú
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
