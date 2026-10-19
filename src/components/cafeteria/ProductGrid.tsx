'use client';

import { useMemo, useState } from 'react';
import { flattenMenu, type MenuItem, type MenuSection, type Temperature } from '@/modules/cafeteria/domain/category-tree';
import { formatPesos } from '@/modules/cafeteria/domain/money';

interface ProductGridProps {
  sections: MenuSection[];
  onAdd: (item: MenuItem) => void;
  /** Artículos que algún crédito del cliente elegido puede cubrir. */
  isCourtesyEligible?: (item: MenuItem) => boolean;
}

type TempFilter = 'all' | Temperature;

export function TemperatureIcon({ temperature }: { temperature: Temperature | null }) {
  if (!temperature) return null;
  return (
    <span
      className={`material-symbols-outlined text-[18px] ${temperature === 'cold' ? 'text-sky-600' : 'text-orange-600'}`}
      aria-label={temperature === 'cold' ? 'Fría' : 'Caliente'}
      role="img"
    >
      {temperature === 'cold' ? 'ac_unit' : 'local_fire_department'}
    </span>
  );
}

/** Menú de la caja (SPEC-CAFETERIA §8.1): pestañas de categoría padre, chips de subcategoría y buscador. */
export function ProductGrid({ sections, onAdd, isCourtesyEligible }: ProductGridProps) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '');
  const [subId, setSubId] = useState<string | 'all'>('all');
  const [temp, setTemp] = useState<TempFilter>('all');
  const [query, setQuery] = useState('');

  const section = sections.find((s) => s.id === sectionId) ?? sections[0];
  const searching = query.trim().length > 0;

  const items = useMemo(() => {
    if (searching) {
      const q = query.trim().toLowerCase();
      return flattenMenu(sections).filter((i) => i.name.toLowerCase().includes(q));
    }
    if (!section) return [];
    const base = subId === 'all' ? [...section.items, ...section.subcategories.flatMap((s) => s.items)] : section.subcategories.find((s) => s.id === subId)?.items ?? [];
    return section.usesTemperature && temp !== 'all' ? base.filter((i) => i.temperature === temp) : base;
  }, [searching, query, sections, section, subId, temp]);

  if (sections.length === 0) {
    return <p className="font-body text-body-md text-on-surface-variant py-10 text-center">El menú está vacío. Pide al admin que agregue productos.</p>;
  }

  const chip = (active: boolean) =>
    `shrink-0 min-h-11 px-4 rounded-full font-body text-sm whitespace-nowrap ${active ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface-variant border border-outline-variant/50'}`;

  return (
    <div className="space-y-3">
      <input
        type="search"
        aria-label="Buscar producto"
        placeholder="Buscar en todo el menú"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface font-body text-sm"
      />

      {!searching && (
        <>
          <div role="tablist" aria-label="Categorías" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === section?.id}
                onClick={() => {
                  setSectionId(s.id);
                  setSubId('all');
                  setTemp('all');
                }}
                className={chip(s.id === section?.id)}
              >
                {s.name}
              </button>
            ))}
          </div>

          {section && section.subcategories.length > 0 && (
            <div aria-label="Subcategorías" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              <button type="button" aria-pressed={subId === 'all'} onClick={() => setSubId('all')} className={chip(subId === 'all')}>
                Todas
              </button>
              {section.subcategories.map((sub) => (
                <button key={sub.id} type="button" aria-pressed={subId === sub.id} onClick={() => setSubId(sub.id)} className={chip(subId === sub.id)}>
                  {sub.name}
                </button>
              ))}
            </div>
          )}

          {section?.usesTemperature && (
            <div aria-label="Temperatura" className="flex gap-2">
              {(
                [
                  ['all', 'Todas'],
                  ['cold', 'Frías'],
                  ['hot', 'Calientes'],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={temp === value} onClick={() => setTemp(value)} className={chip(temp === value)}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={!item.isAvailable}
              onClick={() => onAdd(item)}
              aria-label={`Agregar ${item.name}${item.temperature ? (item.temperature === 'cold' ? ' fría' : ' caliente') : ''}`}
              className="w-full h-full min-h-24 rounded-lg border border-outline-variant/40 bg-surface p-3 text-left shadow-sm transition hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="flex items-start justify-between gap-1">
                <span className="font-body text-sm font-semibold text-on-surface">{item.name}</span>
                <TemperatureIcon temperature={item.temperature} />
              </span>
              <span className="mt-2 block font-body text-sm text-on-surface-variant">{formatPesos(item.priceCents)}</span>
              {!item.isAvailable && <span className="mt-1 block font-body text-xs text-error">Agotado</span>}
              {item.isAvailable && isCourtesyEligible?.(item) && (
                <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 font-body text-[11px] text-primary">Cortesía</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="font-body text-sm text-on-surface-variant text-center py-6">Sin resultados.</p>}
    </div>
  );
}
