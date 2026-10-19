'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { indexCategories, TEMPERATURE_LABELS, type CategoryRecord } from '@/modules/cafeteria/domain/category-tree';
import { effectiveCourtesyEligibility, MONTHLY_COURTESY_MAX, type EligibilitySource } from '@/modules/cafeteria/domain/courtesy';
import { updateCourtesyRulesAction } from '@/modules/cafeteria/presentation/actions/admin';
import type { CourtesyRules as CourtesyRulesData } from '@/modules/cafeteria/presentation/types';

type Tri = boolean | null;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const triValue = (value: Tri) => (value === null ? 'inherit' : value ? 'yes' : 'no');
const fromTri = (value: string): Tri => (value === 'inherit' ? null : value === 'yes');

const SOURCE_LABEL: Record<EligibilitySource, string> = {
  product: 'por el producto',
  subcategory: 'por la subcategoría',
  parent: 'por la categoría padre',
  default: 'sin regla',
};

function TriSelect({ label, value, onChange, inheritLabel }: { label: string; value: Tri; onChange: (v: Tri) => void; inheritLabel: string }) {
  return (
    <select
      aria-label={label}
      value={triValue(value)}
      onChange={(e) => onChange(fromTri(e.target.value))}
      className="min-h-11 px-2 rounded-lg border border-outline-variant bg-surface font-body text-sm"
    >
      <option value="inherit">{inheritLabel}</option>
      <option value="yes">Sí</option>
      <option value="no">No</option>
    </select>
  );
}

/** Reglas de cortesía de coaches y correos del corte (SPEC-CAFETERIA D3, §8.2). */
export function CourtesyRules({ rules }: { rules: CourtesyRulesData }) {
  const router = useRouter();
  const [limit, setLimit] = useState(String(rules.limit));
  const [emails, setEmails] = useState<string[]>(rules.notifyEmails);
  const [newEmail, setNewEmail] = useState('');
  const [categories, setCategories] = useState<Record<string, Tri>>(() => Object.fromEntries(rules.categories.map((c) => [c.id, c.courtesyEligible])));
  const [products, setProducts] = useState<Record<string, Tri>>(() => Object.fromEntries(rules.products.map((p) => [p.id, p.courtesyOverride])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const liveCategories: CategoryRecord[] = useMemo(() => rules.categories.map((c) => ({ ...c, courtesyEligible: categories[c.id] ?? null })), [rules.categories, categories]);
  const index = useMemo(() => indexCategories(liveCategories), [liveCategories]);
  const roots = liveCategories.filter((c) => c.parentId === null).sort((a, b) => a.sortOrder - b.sortOrder);

  const changedCategories = rules.categories.filter((c) => c.courtesyEligible !== categories[c.id]).map((c) => ({ id: c.id, eligible: categories[c.id] }));
  const changedProducts = rules.products.filter((p) => p.courtesyOverride !== products[p.id]).map((p) => ({ id: p.id, override: products[p.id] }));
  const emailsChanged = emails.join(',') !== rules.notifyEmails.join(',');

  function addEmail() {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) return setErrors({ notifyEmails: 'Correo no válido.' });
    if (emails.includes(email)) return setErrors({ notifyEmails: 'Ese correo ya está en la lista.' });
    setEmails([...emails, email]);
    setNewEmail('');
    setErrors({});
  }

  function openConfirm() {
    const n = Number(limit);
    const found: Record<string, string> = {};
    if (!Number.isInteger(n) || n < 0 || n > MONTHLY_COURTESY_MAX) found.limit = `El límite va de 0 a ${MONTHLY_COURTESY_MAX}.`;
    if (emails.length === 0) found.notifyEmails = 'Agrega al menos un correo.';
    setErrors(found);
    if (Object.keys(found).length === 0) setConfirming(true);
  }

  function save() {
    setConfirming(false);
    startTransition(async () => {
      const result = await updateCourtesyRulesAction({ limit: Number(limit), notifyEmails: emails, categories: changedCategories, products: changedProducts });
      if (result.success) {
        setMessage({ ok: true, text: 'Reglas guardadas.' });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error });
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  function productRows(categoryId: string) {
    return rules.products
      .filter((p) => p.categoryId === categoryId)
      .map((p) => {
        const effective = effectiveCourtesyEligibility({ categoryId: p.categoryId, courtesyOverride: products[p.id] ?? null }, index);
        const name = p.temperature ? `${p.name} (${TEMPERATURE_LABELS[p.temperature]})` : p.name;
        return (
          <li key={p.id} data-testid={`rule-product-${p.id}`} className="flex flex-wrap items-center gap-2 py-1 pl-4">
            <span className="flex-1 min-w-0 font-body text-sm">{name}</span>
            <span className={`font-body text-xs ${effective.eligible ? 'text-primary' : 'text-outline'}`}>
              {effective.eligible ? 'Sí' : 'No'} · {SOURCE_LABEL[effective.source]}
            </span>
            <TriSelect label={`Cortesía de ${name}`} value={products[p.id] ?? null} onChange={(v) => setProducts({ ...products, [p.id]: v })} inheritLabel="Heredar" />
          </li>
        );
      });
  }

  return (
    <div className="space-y-5">
      {message && (
        <p role="status" className={`font-body text-sm ${message.ok ? 'text-primary' : 'text-error'}`}>
          {message.text}
        </p>
      )}

      <section className="rounded-lg bg-surface p-4 shadow-sm space-y-2">
        <label htmlFor="monthly-limit" className="block font-body text-body-md font-semibold text-on-surface">
          Cortesías por coach al mes
        </label>
        <input id="monthly-limit" type="number" min={0} max={MONTHLY_COURTESY_MAX} value={limit} onChange={(e) => setLimit(e.target.value)} className="w-32 min-h-11 px-3 rounded-lg border border-outline-variant bg-surface" />
        {errors.limit && <p className="font-body text-xs text-error">{errors.limit}</p>}
        <p className="font-body text-xs text-on-surface-variant">El mes se cuenta en horario de Ciudad de México. Los regalos a usuarios son aparte.</p>
      </section>

      <section aria-label="Qué cubre el cupo de coaches" className="rounded-lg bg-surface p-4 shadow-sm space-y-3">
        <h2 className="font-headline text-lg text-on-surface">Qué cubre el cupo de coaches</h2>
        <p className="font-body text-xs text-on-surface-variant">«Heredar» toma el valor del nivel de arriba. Un producto puede excluirse aunque su categoría sí aplique.</p>
        {roots.map((root) => (
          <div key={root.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 font-body text-body-md font-semibold">{root.name}</h3>
              <TriSelect label={`Cortesía de ${root.name}`} value={categories[root.id] ?? null} onChange={(v) => setCategories({ ...categories, [root.id]: v })} inheritLabel="Sin definir (no)" />
            </div>
            <ul>{productRows(root.id)}</ul>
            {liveCategories
              .filter((c) => c.parentId === root.id)
              .map((sub) => (
                <div key={sub.id} className="ml-3 border-l-2 border-outline-variant/40 pl-3">
                  <div className="flex items-center gap-2">
                    <h4 className="flex-1 font-body text-sm font-semibold">{sub.name}</h4>
                    <TriSelect label={`Cortesía de ${sub.name}`} value={categories[sub.id] ?? null} onChange={(v) => setCategories({ ...categories, [sub.id]: v })} inheritLabel={`Heredar de ${root.name}`} />
                  </div>
                  <ul>{productRows(sub.id)}</ul>
                </div>
              ))}
          </div>
        ))}
      </section>

      <section className="rounded-lg bg-surface p-4 shadow-sm space-y-2">
        <h2 className="font-headline text-lg text-on-surface">Correos del corte de caja</h2>
        <ul className="space-y-1">
          {emails.map((email) => (
            <li key={email} className="flex items-center gap-2 font-body text-sm">
              <span className="flex-1 break-all">{email}</span>
              <button type="button" aria-label={`Quitar ${email}`} onClick={() => setEmails(emails.filter((e) => e !== email))} className="min-h-11 px-2 text-error">
                Quitar
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input aria-label="Nuevo correo" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="flex-1 min-h-11 px-3 rounded-lg border border-outline-variant bg-surface" />
          <button type="button" onClick={addEmail} className="min-h-11 px-4 rounded-DEFAULT border border-outline-variant">
            Agregar
          </button>
        </div>
        {errors.notifyEmails && <p className="font-body text-xs text-error">{errors.notifyEmails}</p>}
      </section>

      <button type="button" disabled={isPending} onClick={openConfirm} className="w-full min-h-12 rounded-DEFAULT bg-soft-charcoal font-semibold uppercase tracking-widest text-label-caps text-on-primary disabled:opacity-50">
        Guardar reglas
      </button>

      <Modal isOpen={confirming} onClose={() => setConfirming(false)} onConfirm={save} title="Guardar reglas de cortesía" confirmLabel="Sí, guardar">
        <ul className="space-y-1 text-sm">
          <li>
            Límite mensual: {rules.limit}
            {Number(limit) !== rules.limit ? ` → ${limit}` : ' (sin cambio)'}
          </li>
          <li>{changedCategories.length} categorías y {changedProducts.length} productos cambian</li>
          <li>Correos: {emailsChanged ? emails.join(', ') : 'sin cambio'}</li>
        </ul>
      </Modal>
    </div>
  );
}
