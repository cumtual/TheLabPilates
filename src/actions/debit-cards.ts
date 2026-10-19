'use server';

import { eq, and, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { debitCards } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/types';

export async function addDebitCardAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  const cardName = formData.get('cardName') as string;
  const cardNumber = formData.get('cardNumber') as string;
  const cardBank = formData.get('cardBank') as string;

  if (!cardName || !cardNumber || !cardBank) {
    return { success: false, error: 'Todos los campos son obligatorios.' };
  }

  await db.insert(debitCards).values({
    cardName,
    cardNumber,
    cardBank,
    active: false,
  });

  revalidatePath('/admin/debit-cards');
  return { success: true, message: 'Tarjeta agregada exitosamente.' };
}

export async function activateDebitCardAction(cardId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!cardId) {
    return { success: false, error: 'ID de tarjeta no proporcionado.' };
  }

  // Deactivate all other cards first (only one active at a time)
  await db
    .update(debitCards)
    .set({ active: false })
    .where(and(eq(debitCards.active, true), isNull(debitCards.deletedAt)));

  // Activate the selected card
  await db
    .update(debitCards)
    .set({ active: true })
    .where(eq(debitCards.id, cardId));

  revalidatePath('/admin/debit-cards');
  return { success: true, message: 'Tarjeta activada. Esta es la tarjeta que verán los clientes.' };
}

export async function deactivateDebitCardAction(cardId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  await db
    .update(debitCards)
    .set({ active: false })
    .where(eq(debitCards.id, cardId));

  revalidatePath('/admin/debit-cards');
  return { success: true, message: 'Tarjeta desactivada.' };
}

export async function deleteDebitCardAction(cardId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (!cardId) {
    return { success: false, error: 'ID de tarjeta no proporcionado.' };
  }

  // Soft delete (también deja de ser la cuenta de la barra)
  await db
    .update(debitCards)
    .set({ deletedAt: new Date(), active: false, barActive: false })
    .where(eq(debitCards.id, cardId));

  revalidatePath('/admin/debit-cards');
  return { success: true, message: 'Tarjeta eliminada.' };
}

/**
 * Cuenta bancaria de la barra (SPEC-CAFETERIA A6): una sola a la vez, independiente de
 * `active` (suscripciones). `null` quita la marca. El índice único parcial lo respalda.
 */
export async function setBarBankAccountAction(cardId: string | null): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { success: false, error: 'No tienes permisos para esta acción.' };
  }

  if (cardId !== null) {
    const [card] = await db
      .select({ id: debitCards.id })
      .from(debitCards)
      .where(and(eq(debitCards.id, cardId), isNull(debitCards.deletedAt)))
      .limit(1);
    if (!card) return { success: false, error: 'La tarjeta no existe o fue eliminada.' };
  }

  await db.transaction(async (tx) => {
    await tx.update(debitCards).set({ barActive: false }).where(eq(debitCards.barActive, true));
    if (cardId !== null) {
      await tx
        .update(debitCards)
        .set({ barActive: true })
        .where(and(eq(debitCards.id, cardId), isNull(debitCards.deletedAt)));
    }
  });

  revalidatePath('/admin/debit-cards');
  return {
    success: true,
    message: cardId ? 'Cuenta marcada para la barra.' : 'La barra ya no tiene cuenta para transferencias.',
  };
}
