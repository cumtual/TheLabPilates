import type { BookingRejectionCode } from '@/lib/types/actions';
import { CLASS_TYPE_OPTION_LABELS, isClassType, type ClassType } from '@/lib/utils/class-type';
import { getMexicoCityMinutesOfDay, hhmmToMinutes, minutesToHHMM } from '@/lib/utils/date';

/**
 * Reglas puras de paquetes especiales (SPEC-SPECIAL-PACKAGES §5.2–§5.4).
 * Las comparte el servidor (reserva) y la UI (lista de clases, dashboard).
 */

export type TimeWindow = { start: string; end: string };

/** Lo mínimo de un `user_subscription_balances` que necesitan las reglas. */
export type BalanceForRules = {
  id: string;
  label: string | null;
  allowedClassTypes: readonly ClassType[];
  /** `HH:MM` o `HH:MM:SS` (columna `time`), hora CDMX. */
  windowStart: string | null;
  windowEnd: string | null;
  creditsRemaining: number;
  creditsTotal: number;
  sortOrder: number;
};

export type ClassForRules = {
  classType: string | null;
  classDate: Date | string;
};

export type BookingRejection = { code: BookingRejectionCode; message: string };

function windowOf(balance: Pick<BalanceForRules, 'windowStart' | 'windowEnd'>): TimeWindow | null {
  return balance.windowStart && balance.windowEnd
    ? { start: balance.windowStart, end: balance.windowEnd }
    : null;
}

/** D1: inclusiva en ambos extremos sobre la hora de inicio CDMX. */
export function isWithinTimeWindow(classDate: Date | string, window: TimeWindow | null): boolean {
  if (!window) return true;
  const minutes = getMexicoCityMinutesOfDay(classDate);
  return hhmmToMinutes(window.start) <= minutes && minutes <= hhmmToMinutes(window.end);
}

function includesClassType(balance: BalanceForRules, classType: string | null): boolean {
  return isClassType(classType) && balance.allowedClassTypes.includes(classType);
}

export function isBalanceUsableForClass(balance: BalanceForRules, cls: ClassForRules): boolean {
  return (
    balance.creditsRemaining > 0 &&
    includesClassType(balance, cls.classType) &&
    isWithinTimeWindow(cls.classDate, windowOf(balance))
  );
}

/** Más restrictivo primero: menos disciplinas, con franja, `sort_order`, `id`. */
function byRestrictiveness(a: BalanceForRules, b: BalanceForRules): number {
  return (
    a.allowedClassTypes.length - b.allowedClassTypes.length ||
    Number(windowOf(a) === null) - Number(windowOf(b) === null) ||
    a.sortOrder - b.sortOrder ||
    a.id.localeCompare(b.id)
  );
}

export function sortBalancesByRestrictiveness<T extends BalanceForRules>(balances: readonly T[]): T[] {
  return [...balances].sort(byRestrictiveness);
}

/** Grupo que consumiría una reserva de `cls`, o `null` si ninguno sirve. Determinista. */
export function pickBalanceForClass<T extends BalanceForRules>(balances: readonly T[], cls: ClassForRules): T | null {
  return sortBalancesByRestrictiveness(balances).find((b) => isBalanceUsableForClass(b, cls)) ?? null;
}

export function formatTimeWindow(window: TimeWindow | null): string | null {
  if (!window) return null;
  return `${minutesToHHMM(hhmmToMinutes(window.start))}–${minutesToHHMM(hhmmToMinutes(window.end))}`;
}

export function balanceLabel(balance: Pick<BalanceForRules, 'label' | 'allowedClassTypes'>): string {
  return balance.label?.trim() || balance.allowedClassTypes.map((t) => CLASS_TYPE_OPTION_LABELS[t]).join(' / ');
}

function classesOf(count: number, label: string): string {
  return `${count} ${count === 1 ? 'clase' : 'clases'} de ${label}`;
}

/** Etiqueta, resumen del saldo («1 clase de Yoga») y franja formateada. */
export function describeBalance(balance: BalanceForRules): { label: string; summary: string; timeWindow: string | null } {
  const label = balanceLabel(balance);
  return { label, summary: classesOf(balance.creditsRemaining, label), timeWindow: formatTimeWindow(windowOf(balance)) };
}

function remainingSummary(balances: readonly BalanceForRules[]): string {
  return balances
    .filter((b) => b.creditsRemaining > 0)
    .map((b) => describeBalance(b).summary)
    .join(', ');
}

/** Motivo exacto por el que `cls` no se puede reservar con estos grupos; `null` si sí se puede. */
export function explainRejection(
  balances: readonly BalanceForRules[],
  cls: ClassForRules,
  packageName: string
): BookingRejection | null {
  if (pickBalanceForClass(balances, cls)) return null;

  const sorted = sortBalancesByRestrictiveness(balances);
  if (!sorted.some((b) => b.creditsRemaining > 0)) {
    return { code: 'NO_CREDITS', message: `Ya usaste todos los créditos de tu ${packageName}.` };
  }

  const withType = sorted.filter((b) => includesClassType(b, cls.classType));
  if (withType.length === 0) {
    const typeLabel = isClassType(cls.classType) ? CLASS_TYPE_OPTION_LABELS[cls.classType] : 'este tipo';
    return {
      code: 'CLASS_TYPE_NOT_INCLUDED',
      message: `Tu ${packageName} no incluye clases de ${typeLabel}. Te queda: ${remainingSummary(sorted)}.`,
    };
  }

  const outsideWindow = withType.find((b) => b.creditsRemaining > 0);
  if (outsideWindow) {
    const window = windowOf(outsideWindow) as TimeWindow;
    return {
      code: 'OUTSIDE_TIME_WINDOW',
      message: `Tu crédito de ${balanceLabel(outsideWindow)} solo aplica a clases que inician entre ${minutesToHHMM(hhmmToMinutes(window.start))} y ${minutesToHHMM(hhmmToMinutes(window.end))}.`,
    };
  }

  return {
    code: 'GROUP_EXHAUSTED',
    message: `Tu ${packageName} ya no incluye clases de ${balanceLabel(withType[0])}. Te queda: ${remainingSummary(sorted)}.`,
  };
}

export type CreditHint = { usable: true; text: string } | { usable: false; text: string };

/** Indicador de la lista de clases: qué crédito usaría la reserva o por qué no se puede. */
export function creditHintFor(balances: readonly BalanceForRules[], cls: ClassForRules, packageName: string): CreditHint {
  const picked = pickBalanceForClass(balances, cls);
  if (picked) {
    return { usable: true, text: `Usa: ${describeBalance({ ...picked, creditsRemaining: 1 }).summary}` };
  }
  return { usable: false, text: explainRejection(balances, cls, packageName)?.message ?? 'Sin créditos disponibles.' };
}
