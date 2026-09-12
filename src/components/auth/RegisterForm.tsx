'use client';

import { useActionState } from 'react';
import { registerAction } from '@/actions/auth';
import { Input } from '@/components/ui/Input';
import Link from 'next/link';
import type { ActionResult } from '@/lib/types';

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    registerAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-6 w-full max-w-sm mx-auto px-5">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface text-center">
        Crear Cuenta
      </h1>

      {state && !state.success && !state.field && (
        <p role="alert" className="font-body text-body-md text-error text-center bg-error/10 rounded-DEFAULT px-4 py-3">
          {state.error}
        </p>
      )}

      {state?.success && (
        <div className="text-center space-y-4">
          <span className="material-symbols-outlined text-primary text-[48px]">mark_email_read</span>
          <p role="status" className="font-body text-body-md text-primary bg-primary/10 rounded-DEFAULT px-4 py-3">
            {state.message}
          </p>
          <Link
            href="/login"
            className="font-body text-body-md text-primary underline underline-offset-2 hover:text-secondary transition-colors"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      )}

      {!state?.success && (
      <>
      <Input
        id="username"
        name="username"
        type="text"
        label="Nombre de usuario"
        placeholder="Tu nombre"
        required
        autoComplete="name"
        error={state && !state.success && state.field === 'username' ? state.error : undefined}
      />

      <Input
        id="email"
        name="email"
        type="email"
        label="Correo electrónico"
        placeholder="tu@correo.com"
        required
        autoComplete="email"
        error={state && !state.success && state.field === 'email' ? state.error : undefined}
      />

      <Input
        id="password"
        name="password"
        type="password"
        label="Contraseña"
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
        {pending ? 'Creando cuenta...' : 'Crear Cuenta'}
      </button>

      <div className="flex justify-center font-body text-body-md">
        <Link
          href="/login"
          className="text-primary underline underline-offset-2 hover:text-secondary transition-colors min-h-11 inline-flex items-center"
        >
          ¿Ya tienes cuenta? Inicia sesión
        </Link>
      </div>
      </>
      )}
    </form>
  );
}
