/**
 * Dinero en centavos enteros (SPEC-CAFETERIA D4, §4.1). Ningún cálculo usa decimales:
 * la conversión texto ↔ centavos vive solo aquí.
 */
export type Cents = number;

/** Precio máximo de un producto: $10,000.00 (CHECK `price_cents BETWEEN 1 AND 1000000`). */
export const MAX_PRICE_CENTS = 1_000_000;
/** Tope para montos de caja (efectivo entregado o recibido): $1,000,000.00. */
export const MAX_AMOUNT_CENTS = 100_000_000;

export type ParsePesosResult = { ok: true; cents: Cents } | { ok: false; error: string };

const PESOS_PATTERN = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

/**
 * `'42.5'` → 4250, `'42.50'` → 4250, `'42'` → 4200, `'0.05'` → 5. Acepta comas de miles
 * (`'1,250.00'`) y el signo `$`. Rechaza más de 2 decimales, negativos, vacío y texto.
 */
export function parsePesos(input: string, { max = MAX_PRICE_CENTS }: { max?: Cents } = {}): ParsePesosResult {
  const value = input.trim().replace(/^\$/, '').replace(/,(?=\d{3}(?:\D|$))/g, '');
  if (value === '') return { ok: false, error: 'Escribe un monto.' };
  if (value.startsWith('-')) return { ok: false, error: 'El monto no puede ser negativo.' };
  const match = PESOS_PATTERN.exec(value);
  if (!match) {
    return /^\d+\.\d{3,}$/.test(value)
      ? { ok: false, error: 'Usa máximo 2 decimales.' }
      : { ok: false, error: 'Escribe un monto válido, por ejemplo 42.50.' };
  }
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (cents > max) return { ok: false, error: `El monto máximo es ${formatPesos(max)}.` };
  return { ok: true, cents };
}

/** 4250 → `'$42.50'`, 500000 → `'$5,000.00'`. */
export function formatPesos(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const pesos = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${pesos}.${String(abs % 100).padStart(2, '0')}`;
}

/** 4250 → `'42.50'`: valor inicial de un campo de precio al editar. */
export function centsToInput(cents: Cents): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, value) => total + value, 0);
}
