'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { categoryPath, indexCategories, TEMPERATURE_LABELS } from '@/modules/cafeteria/domain/category-tree';
import { buildScopeLabel, GRANT_QUANTITY_MAX, GRANT_QUANTITY_MIN } from '@/modules/cafeteria/domain/courtesy-grants';
import { grantCourtesyAction, searchUsersForGrantAction } from '@/modules/cafeteria/presentation/actions/admin';
import { SEARCH_MIN_CHARS, type AdminMenu, type CustomerResult } from '@/modules/cafeteria/presentation/types';

type ScopeType = 'any' | 'category' | 'product';

interface Props {
  menu: AdminMenu;
  /** Hoy en CDMX (`YYYY-MM-DD`): el vencimiento no puede ser anterior. */
  today: string;
}

function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

/** Regalar cortesías (SPEC-CAFETERIA D11, A12, §8.2). */
export function GrantCourtesyForm({ menu, today }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ q: string; items: CustomerResult[] }>({ q: '', items: [] });
  const [user, setUser] = useState<CustomerResult | null>(null);
  const [scopeType, setScopeType] = useState<ScopeType>('any');
  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [expiresOn, setExpiresOn] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const ticket = useRef(0);

  const index = indexCategories(menu.categories);
  const activeCategories = menu.categories.filter((c) => c.isActive).sort((a, b) => categoryPath(a, index).localeCompare(categoryPath(b, index), 'es'));
  const activeProducts = menu.products.filter((p) => p.isActive);

  const q = query.trim();
  const searching = !user && q.length >= SEARCH_MIN_CHARS;
  const results = searching && found.q === q ? found.items : [];

  useEffect(() => {
    if (!searching) return;
    const mine = ++ticket.current;
    const timer = setTimeout(async () => {
      const result = await searchUsersForGrantAction(q);
      if (mine === ticket.current && result.success) setFound({ q, items: result.data });
    }, 300);
    return () => clearTimeout(timer);
  }, [searching, q]);

  function scopeLabel(): string {
    if (scopeType === 'any') return buildScopeLabel({ type: 'any' });
    if (scopeType === 'category') {
      const category = index.get(categoryId);
      return category ? buildScopeLabel({ type: 'category', path: categoryPath(category, index) }) : '';
    }
    const product = menu.products.find((p) => p.id === productId);
    return product ? buildScopeLabel({ type: 'product', name: product.name, temperature: product.temperature }) : '';
  }

  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    if (!user) found.userId = 'Elige a quién regalar.';
    if (scopeType === 'category' && !categoryId) found.scope = 'Elige la categoría.';
    if (scopeType === 'product' && !productId) found.scope = 'Elige el producto.';
    const n = Number(quantity);
    if (!Number.isInteger(n) || n < GRANT_QUANTITY_MIN || n > GRANT_QUANTITY_MAX) found.quantity = `La cantidad va de ${GRANT_QUANTITY_MIN} a ${GRANT_QUANTITY_MAX}.`;
    if (expiresOn && expiresOn < today) found.expiresOn = 'El vencimiento no puede ser una fecha pasada.';
    return found;
  }

  function openConfirm(e: React.FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length === 0) setConfirming(true);
  }

  function submit() {
    setConfirming(false);
    const scope = scopeType === 'any' ? { type: 'any' } : scopeType === 'category' ? { type: 'category', categoryId } : { type: 'product', productId };
    startTransition(async () => {
      const result = await grantCourtesyAction({ userId: user!.id, quantity: Number(quantity), scope, expiresOn: expiresOn || null, note: note.trim() || null });
      if (result.success) {
        setMessage({ ok: true, text: `Regalaste ${quantity} ${Number(quantity) === 1 ? 'cortesía' : 'cortesías'} a ${user!.name}.` });
        setUser(null);
        setQuery('');
        setQuantity('1');
        setExpiresOn('');
        setNote('');
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error });
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  const radio = (value: ScopeType, label: string) => (
    <label className="flex items-center gap-2 min-h-11 font-body text-sm">
      <input type="radio" name="scope" checked={scopeType === value} onChange={() => setScopeType(value)} className="accent-primary" />
      {label}
    </label>
  );

  return (
    <form aria-label="Regalar cortesías" noValidate onSubmit={openConfirm} className="rounded-lg bg-surface p-4 shadow-sm space-y-4">
      <h2 className="font-headline text-lg text-on-surface">Regalar cortesías</h2>
      {message && (
        <p role="status" className={`font-body text-sm ${message.ok ? 'text-primary' : 'text-error'}`}>
          {message.text}
        </p>
      )}

      <div>
        <p className="font-body text-sm font-semibold text-on-surface">Usuario</p>
        {user ? (
          <div className="mt-1 flex items-center justify-between gap-2 rounded-lg bg-surface-container-low p-2">
            <span className="min-w-0">
              <span className="block font-body text-sm font-semibold truncate">{user.name}</span>
              <span className="block font-body text-xs text-outline truncate">{user.email}</span>
            </span>
            <button type="button" onClick={() => setUser(null)} className="min-h-11 px-2 font-body text-sm text-primary underline">
              Cambiar
            </button>
          </div>
        ) : (
          <div className="relative mt-1">
            <input
              aria-label="Buscar usuario por nombre o correo"
              placeholder="Nombre o correo (mínimo 2 letras)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface"
            />
            {results.length > 0 && (
              <ul role="listbox" aria-label="Usuarios" className="absolute z-20 mt-1 w-full rounded-lg border border-outline-variant bg-surface shadow-lg">
                {results.map((r) => (
                  <li key={r.id}>
                    <button type="button" role="option" aria-selected={false} onClick={() => setUser(r)} className="w-full min-h-11 px-3 py-2 text-left hover:bg-surface-container-low">
                      <span className="block font-body text-sm">{r.name}</span>
                      <span className="block font-body text-xs text-outline">{r.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {errors.userId && <p className="mt-1 font-body text-xs text-error">{errors.userId}</p>}
      </div>

      <fieldset>
        <legend className="font-body text-sm font-semibold text-on-surface">Alcance</legend>
        {radio('any', 'Cualquier artículo')}
        {radio('category', 'Una categoría o subcategoría')}
        {scopeType === 'category' && (
          <select aria-label="Categoría del regalo" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="ml-6 w-[calc(100%-1.5rem)] min-h-11 px-3 rounded-lg border border-outline-variant bg-surface">
            <option value="">Elige…</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryPath(c, index)}
              </option>
            ))}
          </select>
        )}
        {radio('product', 'Un producto')}
        {scopeType === 'product' && (
          <select aria-label="Producto del regalo" value={productId} onChange={(e) => setProductId(e.target.value)} className="ml-6 w-[calc(100%-1.5rem)] min-h-11 px-3 rounded-lg border border-outline-variant bg-surface">
            <option value="">Elige…</option>
            {activeCategories.map((c) => {
              const items = activeProducts.filter((p) => p.categoryId === c.id);
              return items.length === 0 ? null : (
                <optgroup key={c.id} label={categoryPath(c, index)}>
                  {items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.temperature ? `${p.name} (${TEMPERATURE_LABELS[p.temperature]})` : p.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        )}
        {errors.scope && <p className="mt-1 font-body text-xs text-error">{errors.scope}</p>}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="grant-quantity" className="block font-body text-sm font-semibold text-on-surface">
            Cantidad
          </label>
          <input id="grant-quantity" type="number" min={GRANT_QUANTITY_MIN} max={GRANT_QUANTITY_MAX} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1 w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface" />
          {errors.quantity && <p className="mt-1 font-body text-xs text-error">{errors.quantity}</p>}
        </div>
        <div>
          <label htmlFor="grant-expires" className="block font-body text-sm font-semibold text-on-surface">
            Vence (opcional)
          </label>
          <input id="grant-expires" type="date" min={today} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className="mt-1 w-full min-h-11 px-3 rounded-lg border border-outline-variant bg-surface" />
          {errors.expiresOn && <p className="mt-1 font-body text-xs text-error">{errors.expiresOn}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="grant-note" className="block font-body text-sm font-semibold text-on-surface">
          Nota interna (opcional)
        </label>
        <textarea id="grant-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full min-h-16 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm" />
      </div>

      <button type="submit" disabled={isPending} className="w-full min-h-12 rounded-DEFAULT bg-soft-charcoal font-semibold uppercase tracking-widest text-label-caps text-on-primary disabled:opacity-50">
        Regalar
      </button>

      <Modal isOpen={confirming} onClose={() => setConfirming(false)} onConfirm={submit} title="Regalar cortesías" confirmLabel="Sí, regalar">
        <ul className="space-y-1 text-sm">
          <li>Usuario: {user?.name} ({user?.email})</li>
          <li>Cantidad: {quantity}</li>
          <li>Alcance: {scopeLabel()}</li>
          <li>Vence: {expiresOn ? formatYmd(expiresOn) : 'Sin vencimiento'}</li>
        </ul>
      </Modal>
    </form>
  );
}
