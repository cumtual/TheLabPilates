'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { sendPasswordChangedEmail } from '@/lib/email/service';
import type { ActionResult } from '@/lib/types';

/**
 * Update the authenticated user's display name (users.username).
 * Works identically for admin, coach and client roles.
 */
export async function updateNameAction(name: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }

  const trimmed = name?.trim() ?? '';
  if (trimmed.length < 2 || trimmed.length > 100) {
    return {
      success: false,
      error: 'El nombre debe tener entre 2 y 100 caracteres.',
      field: 'name',
    };
  }

  await db.update(users).set({ username: trimmed }).where(eq(users.id, session.sub));

  revalidatePath('/client');
  revalidatePath('/coach');
  revalidatePath('/admin');

  return { success: true, message: 'Nombre actualizado correctamente.' };
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Change the authenticated user's password.
 * Requires the current password; on success sends a security notification email.
 * The password is only written when every validation passes.
 */
export async function changePasswordAction(
  input: ChangePasswordInput
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'No autenticado.' };
  }

  const { currentPassword, newPassword, confirmPassword } = input ?? {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.sub),
  });

  if (!user) {
    return { success: false, error: 'Usuario no encontrado.' };
  }

  // 1. Current password must match the stored hash.
  const isCurrentValid = await verifyPassword(currentPassword ?? '', user.password);
  if (!isCurrentValid) {
    return {
      success: false,
      error: 'La contraseña actual es incorrecta.',
      field: 'currentPassword',
    };
  }

  // 2. New password robustness (same policy as register/reset: 8-72 chars).
  if (!newPassword || newPassword.length < 8 || newPassword.length > 72) {
    return {
      success: false,
      error: 'La contraseña debe tener entre 8 y 72 caracteres.',
      field: 'newPassword',
    };
  }

  // 3. Confirmation must match.
  if (newPassword !== confirmPassword) {
    return {
      success: false,
      error: 'Las contraseñas no coinciden.',
      field: 'confirmPassword',
    };
  }

  // All validations passed → hash and persist.
  const hashedPassword = await hashPassword(newPassword);
  await db.update(users).set({ password: hashedPassword }).where(eq(users.id, session.sub));

  // Security notification (non-blocking, fire and forget).
  sendPasswordChangedEmail(user.email, user.username).catch(() => {
    // Email failures are logged internally by the email service.
  });

  return {
    success: true,
    message: 'Contraseña actualizada correctamente. Te enviamos un correo de confirmación.',
  };
}
