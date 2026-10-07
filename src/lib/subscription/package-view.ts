import type { PackageKind } from '@/db/schema';
import type { ClassType } from '@/lib/utils/class-type';
import { DEFAULT_VALIDITY_DAYS } from './package-schema';
import { balanceLabel, describeBalance, formatTimeWindow, type BalanceForRules } from './rules';

/**
 * Modelos de vista del catálogo y de los saldos (SPEC-SPECIAL-PACKAGES §4.4).
 * Funciones puras: las usan la landing, la tienda, la vista previa del admin y el dashboard.
 */

export type PackageRuleView = {
  label: string | null;
  credits: number;
  allowedClassTypes: readonly ClassType[];
  windowStart: string | null;
  windowEnd: string | null;
};

/** Lo que necesita la tarjeta de un paquete (fila del catálogo + reglas). */
export type PackageCardSource = {
  id: string;
  name: string | null;
  kind: PackageKind;
  guest: boolean | null;
  sessions: number | null;
  price: number | null;
  validityDays: number | null;
  guestCredits: number;
  shortDescription: string | null;
  features: readonly string[];
  isFeatured: boolean;
  rules?: readonly PackageRuleView[];
};

export type PackageCardView = {
  id: string;
  name: string;
  displayName: string;
  shortDescription: string;
  sessionsLabel: string;
  priceLabel: string;
  price: number;
  /** Sesiones totales (Σ créditos en especiales; ignorado en ilimitados). */
  sessions: number;
  features: string[];
  isFeatured: boolean;
  isUnlimited: boolean;
  guestBadge: string | null;
  validityLabel: string;
  ctaLabel: 'ELEGIR' | 'RESERVAR TODO';
  /** Desglose de un especial: «1 clase de Yoga», «1 clase de Mat Pilates / Barre · 07:00–11:00». */
  breakdown: string[];
};

const priceFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatValidity(days: number | null): string {
  const total = days ?? DEFAULT_VALIDITY_DAYS;
  if (total % 7 === 0 && total !== 28) {
    const weeks = total / 7;
    return `Vigencia: ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
  }
  return `Vigencia: ${total} ${total === 1 ? 'día' : 'días'}`;
}

function sessionsLabelOf(source: PackageCardSource): string {
  if (source.guest) return 'ACCESO ILIMITADO';
  if (source.kind === 'special' && source.rules?.length) {
    return source.rules.map((rule) => `${rule.credits} ${balanceLabel(rule)}`.toUpperCase()).join(' · ');
  }
  const sessions = source.sessions ?? 0;
  return sessions === 1 ? 'UNA SESIÓN' : `${sessions} SESIONES`;
}

function breakdownOf(source: PackageCardSource): string[] {
  if (source.kind !== 'special' || !source.rules) return [];
  return source.rules.map((rule) => {
    const { summary } = describeBalance({
      id: '',
      label: rule.label,
      allowedClassTypes: rule.allowedClassTypes,
      windowStart: rule.windowStart,
      windowEnd: rule.windowEnd,
      creditsRemaining: rule.credits,
      creditsTotal: rule.credits,
      sortOrder: 0,
    });
    const window = formatTimeWindow(rule.windowStart && rule.windowEnd ? { start: rule.windowStart, end: rule.windowEnd } : null);
    return window ? `${summary} · ${window}` : summary;
  });
}

export function toPackageCardView(source: PackageCardSource): PackageCardView {
  const name = source.name ?? 'Paquete';
  const isUnlimited = source.guest === true;
  const guestCredits = source.kind === 'special' ? source.guestCredits : 0;
  return {
    id: source.id,
    name,
    displayName: isUnlimited ? `∞ ${name}` : name,
    shortDescription: source.shortDescription ?? '',
    sessionsLabel: sessionsLabelOf(source),
    priceLabel: priceFormatter.format(source.price ?? 0),
    price: source.price ?? 0,
    sessions: source.sessions ?? 0,
    features: source.features.slice(0, 4),
    isFeatured: source.isFeatured,
    isUnlimited,
    guestBadge: guestCredits > 0 ? `+${guestCredits} ${guestCredits === 1 ? 'Invitado' : 'Invitados'}` : null,
    validityLabel: formatValidity(source.validityDays),
    ctaLabel: source.isFeatured && isUnlimited ? 'RESERVAR TODO' : 'ELEGIR',
    breakdown: breakdownOf(source),
  };
}

export type CreditBalanceView = {
  balanceId: string;
  label: string;
  remaining: number;
  total: number;
  timeWindow: string | null;
  summary: string;
  exhausted: boolean;
};

export function toCreditBalanceView(balance: BalanceForRules): CreditBalanceView {
  const { label, summary, timeWindow } = describeBalance(balance);
  return {
    balanceId: balance.id,
    label,
    remaining: balance.creditsRemaining,
    total: balance.creditsTotal,
    timeWindow,
    summary,
    exhausted: balance.creditsRemaining <= 0,
  };
}

export function toCreditBalanceViews(balances: readonly BalanceForRules[]): CreditBalanceView[] {
  return [...balances].sort((a, b) => a.sortOrder - b.sortOrder).map(toCreditBalanceView);
}
