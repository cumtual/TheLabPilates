'use server';

import { and, eq, isNull, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { subscriptionRules, subscriptions } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import type { FormActionResult } from '@/lib/types/actions';
import {
  packageInputSchema,
  toFieldErrors,
  totalRuleCredits,
  type PackageData,
} from '@/lib/subscription/package-schema';

/**
 * CRUD del catálogo de paquetes (SPEC-SPECIAL-PACKAGES §4.3). Solo admin.
 * Nunca hay DELETE sobre `suscriptions` (H3): eliminar es lógico. Lo vendido no cambia
 * al editar (D4) porque cada compra guarda su copia de condiciones.
 */

const FORBIDDEN = 'No tienes permisos para esta acción.';
const NOT_FOUND = 'Paquete no encontrado.';
const INVALID = 'Revisa los campos marcados.';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  return session?.role === 'admin';
}

function revalidateCatalog() {
  revalidatePath('/');
  revalidatePath('/client/subscription');
  revalidatePath('/admin/packages');
}

function parse(input: unknown): { ok: true; data: PackageData } | { ok: false; result: FormActionResult<never> } {
  const parsed = packageInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors = toFieldErrors(parsed.error);
  return { ok: false, result: { success: false, error: INVALID, field: Object.keys(fieldErrors)[0], fieldErrors } };
}

/** Columnas del catálogo comunes a ambos tipos. */
function catalogValues(data: PackageData) {
  return {
    name: data.name,
    shortDescription: data.shortDescription,
    features: data.features,
    price: data.price,
    validityDays: data.validityDays,
    displayOrder: data.displayOrder,
    isFeatured: data.isFeatured,
    updatedAt: new Date(),
  };
}

function ruleRows(subscriptionId: string, data: Extract<PackageData, { kind: 'special' }>) {
  return data.rules.map((rule, index) => ({
    subscriptionId,
    label: rule.label,
    credits: rule.credits,
    allowedClassTypes: rule.allowedClassTypes,
    windowStart: rule.timeWindow?.start ?? null,
    windowEnd: rule.timeWindow?.end ?? null,
    sortOrder: index,
  }));
}

/** Un solo paquete destacado en la landing (§9). */
async function unfeatureOthers(tx: Tx, keepId: string): Promise<void> {
  await tx
    .update(subscriptions)
    .set({ isFeatured: false })
    .where(and(ne(subscriptions.id, keepId), eq(subscriptions.isFeatured, true)));
}

export async function createPackageAction(input: unknown): Promise<FormActionResult<{ id: string }>> {
  if (!(await isAdmin())) return { success: false, error: FORBIDDEN };
  const parsed = parse(input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;

  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(subscriptions)
      .values({
        ...catalogValues(data),
        kind: data.kind,
        guest: false,
        sessions: data.kind === 'special' ? totalRuleCredits(data.rules) : data.sessions,
        guestCredits: data.kind === 'special' ? data.guestCredits : 0,
      })
      .returning({ id: subscriptions.id });

    if (data.kind === 'special') {
      await tx.insert(subscriptionRules).values(ruleRows(created.id, data));
    }
    if (data.isFeatured) await unfeatureOthers(tx, created.id);
    return created.id;
  });

  revalidateCatalog();
  return { success: true, message: 'Paquete creado.', data: { id } };
}

export async function updatePackageAction(id: string, input: unknown): Promise<FormActionResult<{ id: string }>> {
  if (!(await isAdmin())) return { success: false, error: FORBIDDEN };
  const parsed = parse(input);
  if (!parsed.ok) return parsed.result;
  const data = parsed.data;

  const existing = await db.query.subscriptions.findFirst({ where: eq(subscriptions.id, id) });
  if (!existing || existing.deletedAt) return { success: false, error: NOT_FOUND };
  if (existing.kind !== data.kind) {
    return { success: false, error: 'El tipo de paquete no se puede cambiar.', field: 'kind', fieldErrors: { kind: 'El tipo de paquete no se puede cambiar.' } };
  }

  await db.transaction(async (tx) => {
    if (data.kind === 'special') {
      await tx
        .update(subscriptions)
        .set({ ...catalogValues(data), sessions: totalRuleCredits(data.rules), guestCredits: data.guestCredits })
        .where(eq(subscriptions.id, id));
      // Reemplazo completo de reglas: lo vendido conserva su copia en user_subscription_balances.
      await tx.delete(subscriptionRules).where(eq(subscriptionRules.subscriptionId, id));
      await tx.insert(subscriptionRules).values(ruleRows(id, data));
    } else {
      await tx
        .update(subscriptions)
        // Open Lab (guest = true) es ilimitado: sus sesiones no se editan.
        .set(existing.guest ? catalogValues(data) : { ...catalogValues(data), sessions: data.sessions })
        .where(eq(subscriptions.id, id));
    }
    if (data.isFeatured) await unfeatureOthers(tx, id);
  });

  revalidateCatalog();
  return { success: true, message: 'Paquete actualizado. Los cambios aplican a compras nuevas.', data: { id } };
}

export async function setPackageActiveAction(
  id: string,
  active: boolean
): Promise<FormActionResult<{ id: string; isActive: boolean }>> {
  if (!(await isAdmin())) return { success: false, error: FORBIDDEN };

  const updated = await db
    .update(subscriptions)
    .set({ isActive: active, updatedAt: new Date() })
    .where(and(eq(subscriptions.id, id), eq(subscriptions.isActive, !active), isNull(subscriptions.deletedAt)))
    .returning({ id: subscriptions.id, deletedAt: subscriptions.deletedAt });
  if (updated.length === 0) {
    const existing = await db.query.subscriptions.findFirst({ where: eq(subscriptions.id, id) });
    if (!existing || existing.deletedAt) return { success: false, error: NOT_FOUND };
  }

  revalidateCatalog();
  return {
    success: true,
    message: active ? 'Paquete activado.' : 'Paquete desactivado. Ya no aparece en la landing ni en la tienda.',
    data: { id, isActive: active },
  };
}

export async function softDeletePackageAction(id: string): Promise<FormActionResult<{ id: string }>> {
  if (!(await isAdmin())) return { success: false, error: FORBIDDEN };

  const deleted = await db
    .update(subscriptions)
    .set({ deletedAt: new Date(), isActive: false, isFeatured: false, updatedAt: new Date() })
    .where(and(eq(subscriptions.id, id), isNull(subscriptions.deletedAt)))
    .returning({ id: subscriptions.id });
  if (deleted.length === 0) return { success: false, error: NOT_FOUND };

  revalidateCatalog();
  return { success: true, message: 'Paquete eliminado.', data: { id } };
}
