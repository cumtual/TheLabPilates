// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { packageInputSchema } from '@/lib/subscription/package-schema';
import { loadManualSql, statementsOf } from './sql-test-utils';
import { LEGACY_PRICING, dbNameOf } from './fixtures/pricing-legacy';

/** Compatibilidad y carga del catálogo de la landing (SPEC-SPECIAL-PACKAGES §3.3, D7, S2). */

const sql = loadManualSql('2026-10-07_002_catalog_compat_backfill.sql');
const statements = statementsOf(sql);
const updates = statements.filter((s) => s.startsWith('update'));
const inserts = statements.filter((s) => s.startsWith('insert'));

const sqlString = (value: string) => `'${value.toLowerCase().replace(/'/g, "''")}'`;

describe('2026-10-07_002_catalog_compat_backfill.sql', () => {
  it('es transaccional, sin borrados ni cambios de estructura', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.trim().endsWith('commit;')).toBe(true);
    for (const pattern of [/\bdelete\b/, /\bdrop\b/, /\btruncate\b/, /\balter\b/]) expect(sql).not.toMatch(pattern);
  });

  it('cada UPDATE solo aplica si el paquete aún no tiene descripción y nunca cambia sessions, guest ni price', () => {
    expect(updates).toHaveLength(LEGACY_PRICING.length);
    for (const update of updates) {
      expect(update).toMatch(/and short_description is null$/);
      expect(update).not.toMatch(/\b(sessions|guest|price)\s*=/);
    }
  });

  it('el único INSERT es el alta por nombre protegida con WHERE NOT EXISTS, con los valores de la landing', () => {
    expect(inserts).toHaveLength(1);
    const [insert] = inserts;
    expect(insert).toContain('insert into public.suscriptions (name, sessions, guest, price)');
    expect(insert).toMatch(/where not exists \(select 1 from public\.suscriptions s where s\.name = v\.name\)$/);
    for (const pkg of LEGACY_PRICING) {
      const sessions = pkg.sessions === 'UNA SESIÓN' ? 1 : pkg.premium ? 30 : Number.parseInt(pkg.sessions, 10);
      const price = Number(pkg.price.replace(',', ''));
      expect(insert).toMatch(new RegExp(`\\(${sqlString(dbNameOf(pkg.name))}, *${sessions}, *${pkg.premium}, *${price}\\)`));
    }
  });

  it('no toca suscripciones de clientes ni reservas (los NULL mantienen el comportamiento actual)', () => {
    expect(sql).not.toMatch(/user_suscriptions|class_enrolleds|user_subscription_balances/);
  });

  it('los textos de cada paquete son los de la landing', () => {
    for (const pkg of LEGACY_PRICING) {
      const update = updates.find((u) => u.includes(`where name = ${sqlString(dbNameOf(pkg.name))}`));
      expect(update, pkg.name).toBeDefined();
      expect(update).toContain(`short_description = ${sqlString(pkg.tagline)}`);
      expect(update).toContain(`features = array[${pkg.features.map(sqlString).join(',')}]`);
      expect(update?.includes('is_featured = true')).toBe(pkg.premium);
    }
  });

  it('cada paquete cargado cumple los límites de la tarjeta (descripción < 50, ≤ 4 beneficios de ≤ 24)', () => {
    for (const pkg of LEGACY_PRICING) {
      const result = packageInputSchema.safeParse({
        kind: 'standard',
        name: dbNameOf(pkg.name),
        shortDescription: pkg.tagline,
        features: [...pkg.features],
        price: Number(pkg.price.replace(',', '')),
        validity: { amount: 30, unit: 'days' },
        sessions: 1,
      });
      expect(result.success, pkg.name).toBe(true);
    }
  });
});
