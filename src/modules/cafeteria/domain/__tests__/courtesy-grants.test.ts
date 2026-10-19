import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  allocateCourtesies,
  buildScopeLabel,
  grantCovers,
  grantRemaining,
  grantStatus,
  specificityOf,
  type CourtesyLine,
  type CourtesySource,
  type GrantRecord,
  type GrantScope,
  type ItemPlacement,
} from '../courtesy-grants';

/** Cortesías regaladas y reparto (SPEC-CAFETERIA D11, A11–A13, TASK-CF-DOM-06). */

const latte: ItemPlacement = { productId: 'latte-hot', categoryId: 'cafe', rootCategoryId: 'bebidas' };
const brownie: ItemPlacement = { productId: 'brownie', categoryId: 'postres', rootCategoryId: 'comida' };
const panini: ItemPlacement = { productId: 'panini', categoryId: 'sandwiches', rootCategoryId: 'comida' };
const comidaDirecto: ItemPlacement = { productId: 'fruta', categoryId: 'comida', rootCategoryId: 'comida' };

function grant(overrides: Partial<GrantRecord> = {}): GrantRecord {
  return {
    id: 'g1',
    userId: 'u1',
    quantity: 2,
    scope: { type: 'any' },
    scopeLabel: 'Cualquier artículo',
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    redeemed: 0,
    ...overrides,
  };
}

function source(key: string, scope: GrantScope, remaining: number, expiresAt: string | null, createdAt = '2026-10-01T12:00:00Z'): CourtesySource {
  return {
    key,
    kind: 'grant',
    remaining,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    specificity: specificityOf(scope),
    createdAt: new Date(createdAt),
    covers: (item) => grantCovers(scope, item),
  };
}

const monthlyOct = (remaining: number, covers: (item: ItemPlacement) => boolean = () => true): CourtesySource => ({
  key: 'monthly',
  kind: 'monthly',
  remaining,
  expiresAt: new Date('2026-11-01T05:59:59.999Z'),
  specificity: 1,
  createdAt: new Date('2026-10-01T06:00:00Z'),
  covers,
});

describe('alcance', () => {
  it('any cubre todo', () => {
    for (const item of [latte, brownie, panini]) expect(grantCovers({ type: 'any' }, item)).toBe(true);
  });

  it('una categoría cubre sus productos y los de sus subcategorías', () => {
    const comida: GrantScope = { type: 'category', categoryId: 'comida' };
    expect(grantCovers(comida, brownie)).toBe(true);
    expect(grantCovers(comida, panini)).toBe(true);
    expect(grantCovers(comida, comidaDirecto)).toBe(true);
    expect(grantCovers(comida, latte)).toBe(false);
    const postres: GrantScope = { type: 'category', categoryId: 'postres' };
    expect(grantCovers(postres, brownie)).toBe(true);
    expect(grantCovers(postres, panini)).toBe(false);
  });

  it('product cubre solo ese producto', () => {
    expect(grantCovers({ type: 'product', productId: 'latte-hot' }, latte)).toBe(true);
    expect(grantCovers({ type: 'product', productId: 'latte-hot' }, { ...latte, productId: 'latte-cold' })).toBe(false);
  });
});

describe('vigencia y restantes', () => {
  const expiresOct20 = new Date('2026-10-20T23:59:59.999-06:00');

  it('un regalo que vence el 20/oct vale hasta el último milisegundo de ese día CDMX', () => {
    const g = grant({ expiresAt: expiresOct20 });
    expect(grantStatus(g, new Date('2026-10-20T23:59:59.999-06:00'), true)).toBe('active');
    expect(grantStatus(g, new Date('2026-10-21T00:00:00.000-06:00'), true)).toBe('expired');
  });

  it('sin vencimiento vale siempre; revocado o sin alcance disponible no', () => {
    expect(grantStatus(grant(), new Date('2030-01-01T00:00:00Z'), true)).toBe('active');
    expect(grantStatus(grant({ revokedAt: new Date() }), new Date(), true)).toBe('revoked');
    expect(grantStatus(grant(), new Date(), false)).toBe('unavailable');
  });

  it('restantes = cantidad − canjeadas, nunca negativo; agotado gana a vencido', () => {
    expect(grantRemaining(grant({ quantity: 3, redeemed: 1 }))).toBe(2);
    expect(grantRemaining(grant({ quantity: 1, redeemed: 3 }))).toBe(0);
    expect(grantStatus(grant({ quantity: 1, redeemed: 1, expiresAt: new Date('2020-01-01') }), new Date(), true)).toBe('used');
  });
});

describe('prioridad (A11)', () => {
  it('vence antes primero', () => {
    const r = allocateCourtesies([{ key: 'l', item: latte }], [
      source('late', { type: 'any' }, 1, '2026-12-31T23:59:59.999-06:00'),
      source('soon', { type: 'any' }, 1, '2026-10-20T23:59:59.999-06:00'),
    ]);
    expect(r.assignments.get('l')).toBe('soon');
  });

  it('con el mismo vencimiento, el alcance más específico; luego el más antiguo', () => {
    const r = allocateCourtesies([{ key: 'l', item: latte }], [
      source('any', { type: 'any' }, 1, null),
      source('cat', { type: 'category', categoryId: 'bebidas' }, 1, null),
      source('prod', { type: 'product', productId: 'latte-hot' }, 1, null),
    ]);
    expect(r.assignments.get('l')).toBe('prod');
    const older = allocateCourtesies([{ key: 'l', item: latte }], [
      source('new', { type: 'any' }, 1, null, '2026-10-10T00:00:00Z'),
      source('old', { type: 'any' }, 1, null, '2026-10-02T00:00:00Z'),
    ]);
    expect(older.assignments.get('l')).toBe('old');
  });

  it('el mensual (vence el 31/oct) va antes que un regalo sin vencimiento; un regalo del 20/oct va antes que el mensual', () => {
    const noExpiry = source('g', { type: 'any' }, 1, null);
    expect(allocateCourtesies([{ key: 'l', item: latte }], [noExpiry, monthlyOct(1)]).assignments.get('l')).toBe('monthly');
    const oct20 = source('g20', { type: 'any' }, 1, '2026-10-20T23:59:59.999-06:00');
    expect(allocateCourtesies([{ key: 'l', item: latte }], [monthlyOct(1), oct20]).assignments.get('l')).toBe('g20');
  });

  it('el mensual solo cubre lo elegible por D3; el regalo no depende de D3', () => {
    const onlyDrinks = monthlyOct(4, (item) => item.rootCategoryId === 'bebidas');
    const r = allocateCourtesies([{ key: 'b', item: brownie }], [onlyDrinks, source('g', { type: 'category', categoryId: 'comida' }, 1, null)]);
    expect(r.assignments.get('b')).toBe('g');
  });
});

describe('reparto óptimo', () => {
  it('A (cualquiera, vence pronto) y B (solo Latte), con Latte + Brownie → Latte→B y Brownie→A', () => {
    const A = source('A', { type: 'any' }, 1, '2026-10-20T23:59:59.999-06:00');
    const B = source('B', { type: 'product', productId: 'latte-hot' }, 1, null);
    const r = allocateCourtesies([{ key: 'latte', item: latte }, { key: 'brownie', item: brownie }], [A, B]);
    expect(Object.fromEntries(r.assignments)).toEqual({ latte: 'B', brownie: 'A' });
    expect(r.uncovered).toEqual([]);
  });

  it('con una línea más que créditos devuelve cuál queda sin cubrir', () => {
    const r = allocateCourtesies(
      [{ key: '1', item: latte }, { key: '2', item: brownie }, { key: '3', item: panini }],
      [source('comida', { type: 'category', categoryId: 'comida' }, 1, null), source('latte', { type: 'product', productId: 'latte-hot' }, 1, null)]
    );
    expect(r.assignments.size).toBe(2);
    expect(r.uncovered).toHaveLength(1);
    expect(['2', '3']).toContain(r.uncovered[0]);
  });
});

/** Fuerza bruta: máximo de líneas cubiertas probando todas las asignaciones. */
function bruteForceMax(lines: CourtesyLine[], sources: CourtesySource[]): number {
  let best = 0;
  const used = new Map(sources.map((s) => [s.key, 0]));
  function go(i: number, covered: number) {
    if (covered + (lines.length - i) <= best) return;
    if (i === lines.length) {
      best = Math.max(best, covered);
      return;
    }
    go(i + 1, covered);
    for (const s of sources) {
      if (s.covers(lines[i].item) && used.get(s.key)! < s.remaining) {
        used.set(s.key, used.get(s.key)! + 1);
        go(i + 1, covered + 1);
        used.set(s.key, used.get(s.key)! - 1);
      }
    }
  }
  go(0, 0);
  return best;
}

describe('propiedad contra fuerza bruta', () => {
  const items = [latte, brownie, panini, comidaDirecto, { productId: 'latte-cold', categoryId: 'cafe', rootCategoryId: 'bebidas' }];
  const scopes: GrantScope[] = [
    { type: 'any' },
    { type: 'category', categoryId: 'comida' },
    { type: 'category', categoryId: 'postres' },
    { type: 'category', categoryId: 'bebidas' },
    { type: 'product', productId: 'latte-hot' },
    { type: 'product', productId: 'panini' },
  ];
  const sourceArb = fc.record({
    scope: fc.integer({ min: 0, max: scopes.length - 1 }),
    remaining: fc.integer({ min: 0, max: 3 }),
    expiry: fc.option(fc.integer({ min: 1, max: 60 }), { nil: null }),
  });

  it('cubre el máximo posible, respeta saldos, usa fuentes que cubren y es determinista', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: items.length - 1 }), { maxLength: 6 }),
        fc.array(sourceArb, { maxLength: 4 }),
        (lineIdx, specs) => {
          const lines = lineIdx.map((i, n) => ({ key: `l${n}`, item: items[i] }));
          const sources = specs.map((s, n) =>
            source(`s${n}`, scopes[s.scope], s.remaining, s.expiry === null ? null : new Date(Date.UTC(2026, 9, s.expiry)).toISOString())
          );
          const result = allocateCourtesies(lines, sources);
          expect(result.assignments.size).toBe(bruteForceMax(lines, sources));
          expect(result.assignments.size + result.uncovered.length).toBe(lines.length);
          const counts = new Map<string, number>();
          for (const [lineKey, sourceKey] of result.assignments) {
            const s = sources.find((x) => x.key === sourceKey)!;
            expect(s.covers(lines.find((l) => l.key === lineKey)!.item)).toBe(true);
            counts.set(sourceKey, (counts.get(sourceKey) ?? 0) + 1);
          }
          for (const s of sources) expect(counts.get(s.key) ?? 0).toBeLessThanOrEqual(s.remaining);
          const again = allocateCourtesies(lines, sources);
          expect([...again.assignments]).toEqual([...result.assignments]);
        }
      ),
      { numRuns: 300 }
    );
  });
});

describe('buildScopeLabel', () => {
  it('textos legibles', () => {
    expect(buildScopeLabel({ type: 'any' })).toBe('Cualquier artículo');
    expect(buildScopeLabel({ type: 'category', path: 'Comida › Postres' })).toBe('Comida › Postres');
    expect(buildScopeLabel({ type: 'category', path: 'Comida' })).toBe('Comida');
    expect(buildScopeLabel({ type: 'product', name: 'Latte', temperature: 'hot' })).toBe('Latte (caliente)');
    expect(buildScopeLabel({ type: 'product', name: 'Brownie', temperature: null })).toBe('Brownie');
  });
});
