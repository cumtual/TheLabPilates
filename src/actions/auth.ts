'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '@/db';
import { users, passwordResets } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession, destroySession } from '@/lib/auth/session';
import { loginRateLimiter, passwordResetRateLimiter } from '@/lib/auth/rate-limiter';
import { sendPasswordResetEmail } from '@/lib/email/service';
import type { ActionResult } from '@/lib/types';

const GENERIC_LOGIN_ERROR = 'Credenciales inválidas. Verifica tu correo y contraseña.';

export async function loginAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { success: false, error: 'Todos los campos son obligatorios.' };
  }

  // Check rate limit before any DB queries
  if (loginRateLimiter.isRateLimited(email.toLowerCase())) {
    return { success: false, error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' };
  }

  // Find user
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (!user) {
    loginRateLimiter.recordAttempt(email.toLowerCase());
    return { success: false, error: GENERIC_LOGIN_ERROR };
  }

  // Verify password
  const isValid = await verifyPassword(password, user.password);
  if (!isValid) {
    loginRateLimiter.recordAttempt(email.toLowerCase());
    return { success: false, error: GENERIC_LOGIN_ERROR };
  }

  // Success — reset rate limiter and create session
  loginRateLimiter.reset(email.toLowerCase());
  await createSession(user.id, user.role, user.email);

  // Redirect to role-specific portal
  const dashboard = user.role === 'admin' ? '/admin' : user.role === 'coach' ? '/coach' : '/client';
  redirect(dashboard);
}

export async function registerAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const username = formData.get('username') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  // Validation: all fields required
  if (!username || !email || !password || !confirmPassword) {
    return { success: false, error: 'Todos los campos son obligatorios.' };
  }

  // Password length validation (8-72 characters)
  if (password.length < 8 || password.length > 72) {
    return {
      success: false,
      error: 'La contraseña debe tener entre 8 y 72 caracteres.',
      field: 'password',
    };
  }

  // Confirm password match
  if (password !== confirmPassword) {
    return {
      success: false,
      error: 'Las contraseñas no coinciden.',
      field: 'confirmPassword',
    };
  }

  // Check email uniqueness
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (existing) {
    return {
      success: false,
      error: 'Este correo electrónico ya está registrado.',
      field: 'email',
    };
  }

  // Hash password and create user
  const hashedPassword = await hashPassword(password);
  const [newUser] = await db
    .insert(users)
    .values({
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'client',
    })
    .returning();

  // Create session and redirect to client portal
  await createSession(newUser.id, newUser.role, newUser.email);
  redirect('/client');
}

const GENERIC_RESET_MESSAGE = 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.';

export async function requestPasswordResetAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = formData.get('email') as string;

  if (!email) {
    return { success: false, error: 'El correo electrónico es obligatorio.' };
  }

  // Rate limit check — still return generic message to not reveal information
  if (passwordResetRateLimiter.isRateLimited(email.toLowerCase())) {
    return { success: true, message: GENERIC_RESET_MESSAGE };
  }

  passwordResetRateLimiter.recordAttempt(email.toLowerCase());

  // Find user (but ALWAYS return generic response regardless)
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (user) {
    // Delete any existing tokens for this user (invalidate previous tokens)
    await db.delete(passwordResets).where(eq(passwordResets.userId, user.id));

    // Generate new token with 60-minute expiry
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Store token in password_resets
    await db.insert(passwordResets).values({
      userId: user.id,
      token,
      expiresAt,
    });

    // Send reset email via Resend
    await sendPasswordResetEmail(user.email, token);
  }

  // Always return the same generic message
  return { success: true, message: GENERIC_RESET_MESSAGE };
}

export async function resetPasswordAction(token: string, _prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const newPassword = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  // Validate required fields
  if (!newPassword || !confirmPassword) {
    return { success: false, error: 'Todos los campos son obligatorios.' };
  }

  // Validate password length (8-72 characters)
  if (newPassword.length < 8 || newPassword.length > 72) {
    return {
      success: false,
      error: 'La contraseña debe tener entre 8 y 72 caracteres.',
      field: 'password',
    };
  }

  // Validate password confirmation match
  if (newPassword !== confirmPassword) {
    return {
      success: false,
      error: 'Las contraseñas no coinciden.',
      field: 'confirmPassword',
    };
  }

  // Find token in database
  const resetRecord = await db.query.passwordResets.findFirst({
    where: eq(passwordResets.token, token),
  });

  if (!resetRecord) {
    return { success: false, error: 'Enlace inválido o expirado. Solicita un nuevo enlace.' };
  }

  // Check token expiry
  if (new Date() > resetRecord.expiresAt) {
    // Clean up expired token
    await db.delete(passwordResets).where(eq(passwordResets.id, resetRecord.id));
    return { success: false, error: 'Enlace inválido o expirado. Solicita un nuevo enlace.' };
  }

  // Hash new password and update user record
  const hashedPassword = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ password: hashedPassword })
    .where(eq(users.id, resetRecord.userId));

  // Delete ALL password reset tokens for this user (cleanup + prevents reuse)
  await db.delete(passwordResets).where(eq(passwordResets.userId, resetRecord.userId));

  return { success: true, message: 'Contraseña actualizada exitosamente. Ya puedes iniciar sesión.' };
}


export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
