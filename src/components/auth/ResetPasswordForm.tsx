'use client';

import { useActionState } from 'react';
import { requestPasswordResetAction, resetPasswordAction } from '@/actions/auth';
import { Input } from '@/components/ui/Input';
import Link from 'next/link';
import type { ActionResult } from '@/lib/types';

/**
 * Request form — only asks for email.
 * Displayed at /reset-password
 */
export function RequestResetForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    requestPasswordResetAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-6 w-full max-w-sm mx-auto px-5">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface text-center">
        Restablecer Contraseña
      </h1>

      <p className="font-body text-body-md text-on-surface-variant text-center">
        Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
      </p>

      {state && state.success && (
        <p role="status" className="font-body text-body-md text-primary text-center bg-primary/10 rounded-DEFAULT px-4 py-3">
          {state.message}
        </p>
      )}

      {state && !state.success && (
        <p role="alert" className="font-body text-body-md text-error text-center bg-error/10 rounded-DEFAULT px-4 py-3">
          {state.error}
        </p>
      )}

      <Input
        id="email"
        name="email"
        type="email"
        label="Correo electrónico"
        placeholder="tu@correo.com"
        required
        autoComplete="email"
      />

      <button
        type="submit"
        disabled={pending}
        className={[
          'w-full min-h-11 px-6 py-3',
          'font-semibold uppercase tracking-[0.1em] text-label-caps',
          'bg-soft-charcoal text-on-primary rounded-DEFAULT',
          'transition-all duration-200 ease-out',
          'hover:-translate-y-0.5 hover:shadow-lg',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none',
          'cursor-pointer',
        ].join(' ')}
      >
        {pending ? 'Enviando...' : 'Enviar Enlace'}
      </button>

      <div className="flex justify-center font-body text-body-md">
        <Link
          href="/soon"
          className="text-primary underline underline-offset-2 hover:text-secondary transition-colors min-h-11 inline-flex items-center"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    </form>
  );
}

/**
 * Reset form — new password + confirm password.
 * Displayed at /reset-password/[token]
 * Receives the token as a prop and binds it to the action.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const resetAction = resetPasswordAction.bind(null, token);

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    resetAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-6 w-full max-w-sm mx-auto px-5">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface text-center">
        Nueva Contraseña
      </h1>

      <p className="font-body text-body-md text-on-surface-variant text-center">
        Ingresa tu nueva contraseña. Debe tener al menos 8 caracteres.
      </p>

      {state && state.success && (
        <div className="flex flex-col gap-3">
          <p role="status" className="font-body text-body-md text-primary text-center bg-primary/10 rounded-DEFAULT px-4 py-3">
            {state.message}
          </p>
          <Link
            href="/soon"
            className="font-body text-body-md text-primary underline underline-offset-2 hover:text-secondary transition-colors text-center min-h-11 inline-flex items-center justify-center"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      )}

      {state && !state.success && !state.field && (
        <p role="alert" className="font-body text-body-md text-error text-center bg-error/10 rounded-DEFAULT px-4 py-3">
          {state.error}
        </p>
      )}

      {!(state && state.success) && (
        <>
          <Input
            id="password"
            name="password"
            type="password"
            label="Nueva contraseña"
            placeholder="Mínimo 8 caracteres"
            required
            autoComplete="new-password"
            error={state && !state.success && state.field === 'password' ? state.error : undefined}
          />

          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            label="Confirmar contraseña"
            placeholder="Repite tu contraseña"
            required
            autoComplete="new-password"
            error={state && !state.success && state.field === 'confirmPassword' ? state.error : undefined}
          />

          <button
            type="submit"
            disabled={pending}
            className={[
              'w-full min-h-11 px-6 py-3',
              'font-semibold uppercase tracking-[0.1em] text-label-caps',
              'bg-soft-charcoal text-on-primary rounded-DEFAULT',
              'transition-all duration-200 ease-out',
              'hover:-translate-y-0.5 hover:shadow-lg',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none',
              'cursor-pointer',
            ].join(' ')}
          >
            {pending ? 'Actualizando...' : 'Actualizar Contraseña'}
          </button>
        </>
      )}
    </form>
  );
}
