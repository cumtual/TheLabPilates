'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { Modal } from '@/components/ui/Modal';
import { randomUuid } from '@/lib/utils/uuid';
import type { MenuItem } from '@/modules/cafeteria/domain/category-tree';
import { formatPesos } from '@/modules/cafeteria/domain/money';
import { MAX_LINE_QUANTITY, type PaymentMethod } from '@/modules/cafeteria/domain/order';
import { createOrderAction, searchCustomersAction } from '@/modules/cafeteria/presentation/actions/register';
import type { RegisterData } from '@/modules/cafeteria/presentation/types';
import { Cart } from './Cart';
import { CustomerPicker, type CustomerSelection } from './CustomerPicker';
import { ProductGrid } from './ProductGrid';
import {
  autoMarkCourtesies,
  canAddCourtesy,
  cartTotals,
  isCoverable,
  menuIndex,
  previewCourtesies,
  sourcesFor,
  toOrderItems,
  type CartLine,
} from './register-logic';

type Checkout = { method: PaymentMethod | null } | null;

/** Caja (SPEC-CAFETERIA §8.1, §8.4). Misma pantalla en /barra y /admin/cafeteria/caja. */
export function RegisterScreen({ data }: { data: RegisterData }) {
  const menu = useMemo(() => menuIndex(data.sections), [data.sections]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerSelection>({ type: 'none' });
  const [checkout, setCheckout] = useState<Checkout>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const submitting = useRef(false);

  const registered = customer.type === 'user' ? customer.user : null;
  const sources = useMemo(() => sourcesFor(registered, data.monthlyEligibleIds, new Date()), [registered, data.monthlyEligibleIds]);
  const preview = useMemo(() => previewCourtesies(cart, menu, registered, sources), [cart, menu, registered, sources]);
  const memberDiscount = registered?.discount ?? null;
  const totals = cartTotals(cart, menu, memberDiscount?.percent ?? 0);

  function changeCustomer(next: CustomerSelection) {
    setCustomer(next);
    const nextSources = sourcesFor(next.type === 'user' ? next.user : null, data.monthlyEligibleIds, new Date());
    // Cambiar de cliente limpia las cortesías y vuelve a marcar las que cubren sus créditos.
    setCart((prev) => autoMarkCourtesies(prev, menu, nextSources));
  }

  function add(item: MenuItem) {
    setNotice(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === item.id);
      const next = existing
        ? prev.map((l) => (l.productId === item.id ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, l.quantity + 1) } : l))
        : [...prev, { productId: item.id, quantity: 1, courtesy: 0 }];
      // Por defecto, la unidad nueva va como cortesía si hay crédito que la cubra.
      return canAddCourtesy(next, item.id, menu, sources)
        ? next.map((l) => (l.productId === item.id ? { ...l, courtesy: l.courtesy + 1 } : l))
        : next;
    });
  }

  function setQuantity(productId: string, quantity: number) {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, quantity, courtesy: Math.min(l.courtesy, quantity) } : l))
    );
  }

  function setCourtesy(productId: string, courtesy: number) {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, courtesy: Math.max(0, Math.min(l.quantity, courtesy)) } : l)));
  }

  function confirmCheckout() {
    if (!checkout || submitting.current) return;
    submitting.current = true;
    const method = totals.totalCents === 0 ? null : checkout.method;
    const requestId = randomUuid();
    setCheckout(null);
    startTransition(async () => {
      const result = await createOrderAction({
        requestId,
        customer:
          customer.type === 'user'
            ? { type: 'user', userId: customer.user.id }
            : customer.type === 'name'
              ? { type: 'name', name: customer.name }
              : { type: 'none' },
        items: toOrderItems(cart),
        paymentMethod: method,
      });
      submitting.current = false;
      if (result.success) {
        setNotice({ ok: true, text: `Pedido #${result.data.folio} registrado por ${formatPesos(result.data.totalCents)}.` });
        setCart([]);
        setCustomer({ type: 'none' });
      } else {
        setNotice({ ok: false, text: result.error });
      }
    });
  }

  const canPay = cart.length > 0 && preview.uncoveredProductIds.size === 0 && !isPending;
  const summary = `${totals.items} ${totals.items === 1 ? 'artículo' : 'artículos'}${totals.courtesies ? ` (${totals.courtesies} de cortesía)` : ''}`;
  const account = data.barAccount;

  return (
    <div className="pb-[58vh] md:pb-0 md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:gap-6">
      <div className="space-y-4">
        <CustomerPicker value={customer} onChange={changeCustomer} search={searchCustomersAction} />
        {notice && (
          <p role="status" className={`rounded-lg p-3 font-body text-sm ${notice.ok ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}`}>
            {notice.text}
          </p>
        )}
        <ProductGrid sections={data.sections} onAdd={add} isCourtesyEligible={registered ? (item) => isCoverable(item, sources) : undefined} />
      </div>

      <Cart
        lines={cart}
        menu={menu}
        totalCents={totals.totalCents}
        discount={memberDiscount ? { label: memberDiscount.label, subtotalCents: totals.subtotalCents, discountCents: totals.discountCents } : null}
        courtesyLabels={preview.labels}
        courtesyEnabled={sources.length > 0}
        canAddCourtesy={(productId) => canAddCourtesy(cart, productId, menu, sources)}
        onQuantity={setQuantity}
        onCourtesy={setCourtesy}
      >
        <div className="mt-4 grid gap-2">
          {totals.totalCents === 0 && totals.courtesies > 0 ? (
            <button
              type="button"
              disabled={!canPay}
              onClick={() => setCheckout({ method: null })}
              className="min-h-12 rounded-DEFAULT bg-soft-charcoal font-semibold uppercase tracking-widest text-label-caps text-on-primary disabled:opacity-50"
            >
              Registrar cortesía
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canPay}
                onClick={() => setCheckout({ method: 'cash' })}
                className="min-h-12 rounded-DEFAULT bg-soft-charcoal font-semibold uppercase tracking-widest text-label-caps text-on-primary disabled:opacity-50"
              >
                Efectivo
              </button>
              <button
                type="button"
                disabled={!canPay || !account}
                onClick={() => setCheckout({ method: 'transfer' })}
                className="min-h-12 rounded-DEFAULT border border-soft-charcoal font-semibold uppercase tracking-widest text-label-caps text-on-surface disabled:opacity-50"
              >
                Transferencia
              </button>
            </div>
          )}
          {!account && totals.totalCents > 0 && (
            <p className="font-body text-xs text-on-surface-variant">Transferencia no disponible: el admin no ha marcado la cuenta de la barra.</p>
          )}
          {preview.uncoveredProductIds.size > 0 && (
            <p className="font-body text-xs text-error">Hay cortesías sin crédito que las cubra. Quítalas para cobrar.</p>
          )}
        </div>
      </Cart>

      <Modal
        isOpen={checkout !== null && (checkout.method !== 'transfer' || totals.totalCents === 0)}
        onClose={() => setCheckout(null)}
        onConfirm={confirmCheckout}
        title="Confirmar cobro"
        confirmLabel={totals.totalCents === 0 ? 'Sí, registrar' : 'Sí, cobrar'}
        confirmDisabled={isPending}
      >
        <p>
          {totals.totalCents === 0 ? (
            <>Registrar {summary}, sin cobro.</>
          ) : (
            <>
              Cobrar <strong>{formatPesos(totals.totalCents)}</strong> en efectivo — {summary}
            </>
          )}
        </p>
        {totals.discountCents > 0 && (
          <p className="mt-2 text-sm">
            Incluye descuento {memberDiscount?.label}: −{formatPesos(totals.discountCents)} (subtotal {formatPesos(totals.subtotalCents)})
          </p>
        )}
        {registered && <p className="mt-2 text-sm">Cliente: {registered.name}</p>}
      </Modal>

      <Modal
        isOpen={checkout?.method === 'transfer' && totals.totalCents > 0}
        onClose={() => setCheckout(null)}
        onConfirm={confirmCheckout}
        title="Cobro por transferencia"
        confirmLabel="Transferencia recibida, cobrar"
        confirmDisabled={isPending || !account}
      >
        {account && (
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt>Banco</dt>
              <dd className="font-semibold text-on-surface">{account.bank}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Titular</dt>
              <dd className="font-semibold text-on-surface">{account.holder}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Cuenta / CLABE</dt>
              <dd className="font-semibold text-on-surface break-all">{account.number}</dd>
            </div>
          </dl>
        )}
        <p className="mt-3">
          Total: <strong>{formatPesos(totals.totalCents)}</strong> — {summary}
        </p>
        {totals.discountCents > 0 && (
          <p className="mt-1 text-sm">
            Incluye descuento {memberDiscount?.label}: −{formatPesos(totals.discountCents)}
          </p>
        )}
      </Modal>
    </div>
  );
}
