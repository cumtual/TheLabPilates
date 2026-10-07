// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatValidity, toCreditBalanceViews, toPackageCardView, type PackageCardSource } from '../package-view';
import { LEGACY_PRICING, dbNameOf } from '@/db/__tests__/fixtures/pricing-legacy';

/** Vistas del catálogo y de saldos (SPEC-SPECIAL-PACKAGES §4.4). */

const base: PackageCardSource = {
  id: 'p',
  name: 'Lab Entry',
  kind: 'standard',
  guest: false,
  sessions: 4,
  price: 360,
  validityDays: null,
  guestCredits: 0,
  shortDescription: 'Empieza a descubrir de lo que eres capaz.',
  features: ['Flexibilidad de horario'],
  isFeatured: false,
};

describe('toPackageCardView', () => {
  it('reproduce los textos de cada tarjeta actual de la landing', () => {
    const sessionsByName: Record<string, number> = { 'Lab Pass': 1, 'Lab Entry': 4, 'Lab Practice': 8, 'Lab Progress': 12, 'Open Lab': 30 };
    for (const legacy of LEGACY_PRICING) {
      const name = dbNameOf(legacy.name);
      const view = toPackageCardView({
        ...base,
        name,
        guest: legacy.premium,
        sessions: sessionsByName[name],
        price: Number(legacy.price.replace(',', '')),
        shortDescription: legacy.tagline,
        features: [...legacy.features],
        isFeatured: legacy.premium,
      });
      expect(view).toMatchObject({
        displayName: legacy.name,
        shortDescription: legacy.tagline,
        sessionsLabel: legacy.sessions,
        priceLabel: legacy.price,
        features: [...legacy.features],
        isFeatured: legacy.premium,
        ctaLabel: legacy.premium ? 'RESERVAR TODO' : 'ELEGIR',
        guestBadge: null,
      });
    }
  });

  it('especial: desglose en la línea de sesiones, pases de invitado y vigencia', () => {
    const view = toPackageCardView({
      ...base,
      name: 'Reset Pass',
      kind: 'special',
      sessions: 2,
      price: 179,
      validityDays: 14,
      guestCredits: 2,
      rules: [
        { label: null, credits: 1, allowedClassTypes: ['yoga'], windowStart: '07:00:00', windowEnd: '11:00:00' },
        { label: null, credits: 1, allowedClassTypes: ['mat_pilates', 'barre'], windowStart: null, windowEnd: null },
      ],
    });
    expect(view).toMatchObject({
      sessionsLabel: '1 YOGA · 1 MAT PILATES / BARRE',
      guestBadge: '+2 Invitados',
      validityLabel: 'Vigencia: 2 semanas',
      breakdown: ['1 clase de Yoga · 07:00–11:00', '1 clase de Mat Pilates / Barre'],
      ctaLabel: 'ELEGIR',
    });
  });

  it('nunca entrega más de 4 beneficios', () => {
    expect(toPackageCardView({ ...base, features: ['a', 'b', 'c', 'd', 'e'] }).features).toHaveLength(4);
  });

  it('formatea la vigencia en días o semanas', () => {
    expect(formatValidity(null)).toBe('Vigencia: 30 días');
    expect(formatValidity(7)).toBe('Vigencia: 1 semana');
    expect(formatValidity(28)).toBe('Vigencia: 28 días');
    expect(formatValidity(1)).toBe('Vigencia: 1 día');
  });
});

describe('toCreditBalanceViews', () => {
  it('ordena por sort_order y marca los grupos agotados', () => {
    const views = toCreditBalanceViews([
      { id: 'b', label: null, allowedClassTypes: ['mat_pilates', 'barre'], windowStart: null, windowEnd: null, creditsRemaining: 0, creditsTotal: 1, sortOrder: 1 },
      { id: 'a', label: null, allowedClassTypes: ['yoga'], windowStart: '07:00:00', windowEnd: '11:00:00', creditsRemaining: 1, creditsTotal: 1, sortOrder: 0 },
    ]);
    expect(views).toEqual([
      { balanceId: 'a', label: 'Yoga', remaining: 1, total: 1, timeWindow: '07:00–11:00', summary: '1 clase de Yoga', exhausted: false },
      { balanceId: 'b', label: 'Mat Pilates / Barre', remaining: 0, total: 1, timeWindow: null, summary: '0 clases de Mat Pilates / Barre', exhausted: true },
    ]);
  });
});
