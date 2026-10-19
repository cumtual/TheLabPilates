/**
 * Errores de negocio del módulo de cafetería. Los casos de uso los lanzan y las
 * Server Actions los traducen a `FormActionResult` (mensaje y campo).
 */
export type CafeteriaErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID'
  | 'CONFLICT'
  | 'PRODUCT_UNAVAILABLE'
  | 'COURTESY_NOT_ALLOWED'
  | 'NO_BAR_ACCOUNT'
  | 'NO_OPEN_ORDERS'
  | 'SHIFT_CHANGED'
  | 'ALREADY_RESOLVED'
  | 'ORDER_CLOSED'
  | 'ALREADY_VOIDED';

export class CafeteriaError extends Error {
  readonly name = 'CafeteriaError';

  constructor(
    readonly code: CafeteriaErrorCode,
    message: string,
    /** Campo del formulario al que pertenece el error, si aplica. */
    readonly field?: string,
    /** Datos para la UI (p. ej. qué líneas de cortesía no se pudieron cubrir). */
    readonly details?: unknown
  ) {
    super(message);
  }
}

export function invalid(message: string, field?: string): CafeteriaError {
  return new CafeteriaError('INVALID', message, field);
}

export function isCafeteriaError(error: unknown): error is CafeteriaError {
  return error instanceof CafeteriaError;
}
