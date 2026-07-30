'use client';

import { useActionState } from 'react';
import { loginAction } from '@/actions/auth';
import { Input } from '@/components/ui/Input';
import Link from 'next/link';
import type { ActionResult } from '@/lib/types';

export function LoginForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    loginAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-6 w-full max-w-sm mx-auto px-5">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface text-center">
        Iniciar Sesión
      </h1>

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

      <Input
        id="password"
        name="password"
        type="password"
        label="Contraseña"
        placeholder="••••••••"
        required
        autoComplete="current-password"
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
        {pending ? 'Ingresando...' : 'Ingresar'}
      </button>

      <div className="flex flex-col items-center gap-3 font-body text-body-md">
        <Link
          href="/register"
          className="text-primary underline underline-offset-2 hover:text-secondary transition-colors min-h-11 inline-flex items-center"
        >
          Crear cuenta
        </Link>
        <Link
          href="/reset-password"
          className="text-outline hover:text-on-surface-variant transition-colors min-h-11 inline-flex items-center"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
    </form>
  );
}
