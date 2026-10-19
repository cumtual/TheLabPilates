import type { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import type { FormActionResult } from '@/lib/types/actions';
import { toFieldErrors } from '@/lib/subscription/package-schema';
import { isCafeteriaError } from '../domain/errors';
import type { Actor, ActorRole, CafeteriaDeps } from '../application/ports';
import { cafeteriaDeps } from '../infrastructure/container';

/**
 * Esqueleto común de las Server Actions: sesión → rol → Zod → caso de uso → resultado.
 * El rol se revisa **antes** de parsear o tocar la BD (§2, §9).
 */

export const GENERIC_ERROR = 'Ocurrió un error. Intenta de nuevo.';
export const FORBIDDEN_ERROR = 'No tienes permisos para esta acción.';

export async function currentActor(): Promise<Actor | null> {
  const session = await getSession();
  return session ? { id: session.sub, role: session.role as ActorRole } : null;
}

export function failure<T>(error: unknown): FormActionResult<T> {
  if (isCafeteriaError(error)) {
    return {
      success: false,
      error: error.message,
      ...(error.field ? { field: error.field, fieldErrors: { [error.field]: error.message } } : {}),
    };
  }
  console.error('[cafetería]', error);
  return { success: false, error: GENERIC_ERROR };
}

interface RunOptions<S extends z.ZodType, T> {
  roles: readonly ActorRole[];
  schema: S;
  input: unknown;
  run: (deps: CafeteriaDeps, actor: Actor, data: z.output<S>) => Promise<T>;
  message?: string;
}

export async function runAction<S extends z.ZodType, T>({ roles, schema, input, run, message }: RunOptions<S, T>): Promise<FormActionResult<T>> {
  const actor = await currentActor();
  if (!actor || !roles.includes(actor.role)) return { success: false, error: FORBIDDEN_ERROR };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = toFieldErrors(parsed.error);
    const [field, error] = Object.entries(fieldErrors)[0] ?? ['', 'Revisa los datos.'];
    return { success: false, error, field: field || undefined, fieldErrors };
  }
  try {
    const data = await run(cafeteriaDeps(), actor, parsed.data);
    return { success: true, data, ...(message ? { message } : {}) };
  } catch (error) {
    return failure<T>(error);
  }
}
