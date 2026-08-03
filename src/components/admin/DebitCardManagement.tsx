'use client';

import { useState, useRef, useTransition } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import {
  addDebitCardAction,
  activateDebitCardAction,
  deactivateDebitCardAction,
  deleteDebitCardAction,
} from '@/actions/debit-cards';
import type { ActionResult } from '@/lib/types';

interface DebitCard {
  id: string;
  cardName: string;
  cardNumber: string;
  cardBank: string;
  active: boolean;
}

interface DebitCardManagementProps {
  cards: DebitCard[];
}

export function DebitCardManagement({ cards }: DebitCardManagementProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmAddData, setConfirmAddData] = useState<{ name: string; number: string; bank: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [localActiveId, setLocalActiveId] = useState<string | null>(
    cards.find((c) => c.active)?.id ?? null
  );
  const formRef = useRef<HTMLFormElement>(null);

  function handleAddSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('cardName') as string;
    const number = formData.get('cardNumber') as string;
    const bank = formData.get('cardBank') as string;

    if (!name || !number || !bank) {
      setError('Todos los campos son obligatorios.');
      return;
    }

    setConfirmAddData({ name, number, bank });
  }

  function handleConfirmAdd() {
    if (!formRef.current || !confirmAddData) return;
    setConfirmAddData(null);
    setPendingAction('add');
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData(formRef.current);
    startTransition(async () => {
      const result = await addDebitCardAction(null, formData);
      if (result.success) {
        setSuccessMessage(result.message ?? 'Tarjeta agregada.');
        setShowAddForm(false);
        formRef.current?.reset();
      } else {
        setError(result.error);
      }
      setPendingAction(null);
    });
  }

  function handleActivate(cardId: string) {
    setError(null);
    setSuccessMessage(null);
    setPendingAction(`activate-${cardId}`);

    startTransition(async () => {
      const result = await activateDebitCardAction(cardId);
      if (result.success) {
        setLocalActiveId(cardId);
        setSuccessMessage(result.message ?? 'Tarjeta activada.');
      } else {
        setError(result.error);
      }
      setPendingAction(null);
    });
  }

  function handleDeactivate(cardId: string) {
    setError(null);
    setSuccessMessage(null);
    setPendingAction(`deactivate-${cardId}`);

    startTransition(async () => {
      const result = await deactivateDebitCardAction(cardId);
      if (result.success) {
        setLocalActiveId(null);
        setSuccessMessage(result.message ?? 'Tarjeta desactivada.');
      } else {
        setError(result.error);
      }
      setPendingAction(null);
    });
  }

  function handleConfirmDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setError(null);
    setSuccessMessage(null);
    setPendingAction(`delete-${id}`);

    startTransition(async () => {
      const result = await deleteDebitCardAction(id);
      if (result.success) {
        setDeletedIds((prev) => new Set([...prev, id]));
        if (localActiveId === id) setLocalActiveId(null);
        setSuccessMessage(result.message ?? 'Tarjeta eliminada.');
      } else {
        setError(result.error);
      }
      setPendingAction(null);
    });
  }

  const visibleCards = cards.filter((c) => !deletedIds.has(c.id));

  return (
    <div className="space-y-4">
      {/* Messages */}
      {error && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-3">
          <p className="font-body text-sm text-error">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
          <p className="font-body text-sm text-primary">{successMessage}</p>
        </div>
      )}

      {/* Add Card Button / Form */}
      {!showAddForm ? (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center justify-center px-4 py-3 min-h-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg"
        >
          + Agregar Tarjeta
        </button>
      ) : (
        <Card>
          <form ref={formRef} onSubmit={handleAddSubmit} className="space-y-4">
            <h3 className="font-body text-base font-semibold text-on-surface">Nueva Tarjeta</h3>
            <Input
              id="cardName"
              name="cardName"
              label="Nombre del titular"
              placeholder="Ej: The Pilates Lab Studio"
              required
            />
            <Input
              id="cardNumber"
              name="cardNumber"
              label="Número de cuenta / CLABE"
              placeholder="Ej: 012345678901234567"
              required
            />
            <Input
              id="cardBank"
              name="cardBank"
              label="Banco"
              placeholder="Ej: BBVA"
              required
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending && pendingAction === 'add'}
                className="inline-flex items-center justify-center px-4 py-3 min-h-11 font-body text-sm font-semibold bg-primary text-on-primary rounded-lg transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending && pendingAction === 'add' ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="inline-flex items-center justify-center px-4 py-3 min-h-11 font-body text-sm font-medium text-on-surface-variant bg-surface-container-low border border-outline-variant rounded-lg transition-colors hover:bg-surface-container-high"
              >
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Card List */}
      {visibleCards.length === 0 ? (
        <Card>
          <p className="font-body text-sm text-outline text-center py-8">
            No hay tarjetas registradas. Agrega una para que tus clientes puedan hacer transferencias.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleCards.map((card) => {
            const isActive = localActiveId === card.id;

            return (
              <Card key={card.id} className={isActive ? 'border-primary/40 bg-primary/5' : ''}>
                <div className="flex flex-col gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-body text-sm font-semibold text-on-surface">
                        {card.cardBank}
                      </p>
                      {isActive && <Badge variant="confirmed">Activa</Badge>}
                    </div>
                    <p className="font-body text-sm text-on-surface-variant">
                      Titular: {card.cardName}
                    </p>
                    <p className="font-body text-sm text-on-surface font-mono">
                      {card.cardNumber}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!isActive ? (
                      <button
                        type="button"
                        onClick={() => handleActivate(card.id)}
                        disabled={isPending && pendingAction === `activate-${card.id}`}
                        className="inline-flex items-center justify-center px-3 py-2 min-h-11 font-body text-sm font-medium text-primary border border-primary/30 rounded-lg transition-colors hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPending && pendingAction === `activate-${card.id}` ? 'Activando...' : 'Activar'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(card.id)}
                        disabled={isPending && pendingAction === `deactivate-${card.id}`}
                        className="inline-flex items-center justify-center px-3 py-2 min-h-11 font-body text-sm font-medium text-on-surface-variant border border-outline-variant rounded-lg transition-colors hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPending && pendingAction === `deactivate-${card.id}` ? 'Desactivando...' : 'Desactivar'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(card.id)}
                      disabled={isPending && pendingAction === `delete-${card.id}`}
                      className="inline-flex items-center justify-center px-3 py-2 min-h-11 font-body text-sm font-medium text-error border border-error/30 rounded-lg transition-colors hover:bg-error/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirm Add Modal */}
      <Modal
        isOpen={confirmAddData !== null}
        onClose={() => setConfirmAddData(null)}
        onConfirm={handleConfirmAdd}
        title="Confirmar nueva tarjeta"
        confirmLabel="Sí, agregar"
        cancelLabel="Cancelar"
        variant="default"
      >
        {confirmAddData && (
          <div className="space-y-3">
            <p>¿Deseas agregar esta tarjeta?</p>
            <div className="bg-surface-container-low rounded-lg p-3 space-y-2">
              <div className="flex justify-between">
                <span className="font-body text-sm text-on-surface-variant">Banco:</span>
                <span className="font-body text-sm font-semibold text-on-surface">{confirmAddData.bank}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-body text-sm text-on-surface-variant">Titular:</span>
                <span className="font-body text-sm font-semibold text-on-surface">{confirmAddData.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-body text-sm text-on-surface-variant">Cuenta:</span>
                <span className="font-body text-sm font-semibold text-on-surface font-mono">{confirmAddData.number}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar tarjeta"
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        variant="danger"
      >
        <p>¿Estás seguro de que deseas eliminar esta tarjeta?</p>
        <p className="mt-2 text-sm text-on-surface-variant">
          Si esta tarjeta está activa, los clientes dejarán de ver los datos bancarios hasta que actives otra.
        </p>
      </Modal>
    </div>
  );
}
