'use client';

import { useEffect, useRef, useState } from 'react';
import { formatShortDate } from '@/lib/utils/date';
import { SEARCH_MIN_CHARS, type CustomerResult } from '@/modules/cafeteria/presentation/types';
import type { FormActionResult } from '@/lib/types/actions';

export type CustomerSelection = { type: 'none' } | { type: 'name'; name: string } | { type: 'user'; user: CustomerResult };

interface CustomerPickerProps {
  value: CustomerSelection;
  onChange: (value: CustomerSelection) => void;
  search: (q: string) => Promise<FormActionResult<CustomerResult[]>>;
}

export const SEARCH_DEBOUNCE_MS = 300;

/** Cliente opcional de la caja (SPEC-CAFETERIA §8.1): nombre libre o usuario registrado. */
export function CustomerPicker({ value, onChange, search }: CustomerPickerProps) {
  const [mode, setMode] = useState<'name' | 'user'>(value.type === 'user' ? 'user' : 'name');
  const [query, setQuery] = useState('');
  /** Resultados de la última búsqueda, con el texto al que responden. */
  const [found, setFound] = useState<{ q: string; items: CustomerResult[]; error: string | null }>({ q: '', items: [], error: null });
  const latest = useRef(0);
  const q = query.trim();
  const active = mode === 'user' && value.type !== 'user' && q.length >= SEARCH_MIN_CHARS;
  const results = active && found.q === q ? found.items : [];
  const error = active && found.q === q ? found.error : null;

  useEffect(() => {
    if (!active) return;
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      const result = await search(q);
      if (ticket !== latest.current) return;
      setFound(result.success ? { q, items: result.data, error: null } : { q, items: [], error: result.error });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, q, search]);

  const clearResults = () => setFound({ q: '', items: [], error: null });

  if (value.type === 'user') {
    const { user } = value;
    const { monthly, grants } = user.courtesy;
    return (
      <section aria-label="Cliente" className="rounded-lg border border-outline-variant/40 bg-surface p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-body text-sm font-semibold text-on-surface truncate">{user.name}</p>
            <p className="font-body text-xs text-outline truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              clearResults();
              onChange({ type: 'none' });
            }}
            className="min-h-11 px-3 font-body text-sm text-primary underline underline-offset-2"
          >
            Cambiar
          </button>
        </div>
        {user.discount && (
          <p data-testid="member-discount" className="inline-block rounded-full bg-primary/10 px-2 py-0.5 font-body text-xs font-semibold text-primary">
            Descuento {user.discount.label} en la barra
          </p>
        )}
        {(monthly || grants.length > 0) && (
          <div data-testid="courtesy-panel" className="rounded-md bg-surface-container-low p-2 space-y-1 font-body text-xs text-on-surface">
            <p className="font-semibold">Cortesías</p>
            {monthly && (
              <p>
                Cupo de coach: {monthly.remaining} de {monthly.limit} este mes
              </p>
            )}
            {grants.map((g) => (
              <p key={g.id}>
                {g.scopeLabel} · quedan {g.remaining}
                {g.expiresAt ? ` · vence ${formatShortDate(g.expiresAt)}` : ''}
              </p>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Cliente" className="space-y-2">
      <div role="tablist" className="flex gap-2">
        {(['name', 'user'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setQuery('');
              clearResults();
              onChange({ type: 'none' });
            }}
            className={`min-h-11 px-3 rounded-full font-body text-sm ${mode === m ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'}`}
          >
            {m === 'name' ? 'Nombre (opcional)' : 'Cliente registrado'}
          </button>
        ))}
      </div>
      {mode === 'name' ? (
        <input
          aria-label="Nombre del cliente"
          maxLength={100}
          placeholder="Ej. Mesa 2, Ana…"
          value={value.type === 'name' ? value.name : ''}
          onChange={(e) => onChange(e.target.value.trim() ? { type: 'name', name: e.target.value } : { type: 'none' })}
          className="w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface font-body text-sm"
        />
      ) : (
        <div className="relative">
          <input
            aria-label="Buscar cliente por nombre o correo"
            placeholder="Nombre o correo (mínimo 2 letras)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface font-body text-sm"
          />
          {error && <p className="mt-1 font-body text-xs text-error">{error}</p>}
          {results.length > 0 && (
            <ul role="listbox" aria-label="Resultados" className="absolute z-20 mt-1 w-full rounded-lg border border-outline-variant bg-surface shadow-lg max-h-72 overflow-y-auto">
              {results.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      clearResults();
                      onChange({ type: 'user', user });
                    }}
                    className="w-full min-h-11 px-3 py-2 text-left hover:bg-surface-container-low"
                  >
                    <span className="block font-body text-sm text-on-surface">{user.name}</span>
                    <span className="block font-body text-xs text-outline">{user.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
