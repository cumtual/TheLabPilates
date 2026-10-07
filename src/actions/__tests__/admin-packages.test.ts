// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/** CRUD del catálogo de paquetes (SPEC-SPECIAL-PACKAGES §4.3, D4, H3). */

vi.mock('@/db', () => ({ db: { transaction: vi.fn(), update: vi.fn(), query: { subscriptions: { findFirst: vi.fn() } } } }));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }) }));

import { createPackageAction, setPackageActiveAction, softDeletePackageAction, updatePackageAction } from '../admin-packages';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

const dialect = new PgDialect();
const render = (value: unknown) => dialect.sqlToQuery(value as SQL);
const nameOf = (table: unknown) => (table as Record<symbol, string>)[Symbol.for('drizzle:Name')];

type Op = { op: 'insert' | 'update' | 'delete'; table: string; values?: unknown; set?: Record<string, unknown>; where?: string };
let ops: Op[];

const resetPass = {
  kind: 'special',
  name: 'Reset Pass',
  shortDescription: 'Un respiro para tu semana.',
  features: ['Sin compromiso'],
  price: 179,
  validity: { amount: 2, unit: 'weeks' },
  guestCredits: 1,
  rules: [
    { credits: 1, allowedClassTypes: ['yoga'] },
    { credits: 1, allowedClassTypes: ['mat_pilates', 'barre'], timeWindow: { start: '07:00', end: '11:00' } },
  ],
};

function recorder() {
  return {
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        ops.push({ op: 'insert', table: nameOf(table), values });
        return Object.assign(Promise.resolve(), { returning: async () => [{ id: 'pkg-new' }] });
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: SQL) => {
          ops.push({ op: 'update', table: nameOf(table), set, where: render(where).sql });
          const rows = Promise.resolve([{ id: 'pkg-1' }]);
          return Object.assign(rows, { returning: () => rows });
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async (where: SQL) => {
        ops.push({ op: 'delete', table: nameOf(table), where: render(where).sql });
      },
    }),
  };
}

const asAdmin = () => vi.mocked(getSession).mockResolvedValue({ sub: 'admin-1', role: 'admin', email: 'a@test.com' } as never);

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  asAdmin();
  const tx = recorder();
  vi.mocked(db.transaction).mockImplementation((async (cb: (t: unknown) => unknown) => cb(tx)) as never);
  vi.mocked(db.update).mockImplementation(tx.update as never);
});

describe('permisos', () => {
  it.each(['coach', 'client'])('%s recibe el error de permisos sin tocar la BD', async (role) => {
    vi.mocked(getSession).mockResolvedValue({ sub: 'x', role, email: 'x@test.com' } as never);
    for (const result of [
      await createPackageAction(resetPass),
      await updatePackageAction('pkg-1', resetPass),
      await setPackageActiveAction('pkg-1', false),
      await softDeletePackageAction('pkg-1'),
    ]) {
      expect(result).toEqual({ success: false, error: 'No tienes permisos para esta acción.' });
    }
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('createPackageAction', () => {
  it('una entrada inválida devuelve fieldErrors con las rutas de Zod y no escribe', async () => {
    const result = await createPackageAction({ ...resetPass, shortDescription: 'x'.repeat(50), features: ['a', 'b', 'c', 'd', 'e'] });
    expect(result).toMatchObject({
      success: false,
      error: 'Revisa los campos marcados.',
      field: 'shortDescription',
      fieldErrors: { shortDescription: 'La descripción debe tener menos de 50 caracteres.', features: 'Máximo 4 beneficios.' },
    });
    expect(ops).toHaveLength(0);
  });

  it('un especial guarda guest=false, sessions = Σ créditos, vigencia en días y sus reglas en una transacción', async () => {
    expect(await createPackageAction(resetPass)).toEqual({ success: true, message: 'Paquete creado.', data: { id: 'pkg-new' } });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(ops[0]).toMatchObject({ op: 'insert', table: 'suscriptions', values: { kind: 'special', guest: false, sessions: 2, validityDays: 14, guestCredits: 1, price: 179 } });
    expect(ops[1]).toMatchObject({
      op: 'insert',
      table: 'subscription_rules',
      values: [
        { subscriptionId: 'pkg-new', credits: 1, allowedClassTypes: ['yoga'], windowStart: null, windowEnd: null, sortOrder: 0, label: null },
        { subscriptionId: 'pkg-new', allowedClassTypes: ['mat_pilates', 'barre'], windowStart: '07:00', windowEnd: '11:00', sortOrder: 1 },
      ],
    });
    for (const path of ['/', '/client/subscription', '/admin/packages']) expect(revalidatePath).toHaveBeenCalledWith(path);
  });

  it('destacar un paquete desmarca a los demás en la misma transacción', async () => {
    await createPackageAction({ ...resetPass, isFeatured: true });
    const unfeature = ops.find((o) => o.op === 'update');
    expect(unfeature).toMatchObject({ table: 'suscriptions', set: { isFeatured: false } });
    expect(unfeature?.where).toContain('"suscriptions"."id" <> $1');
  });
});

describe('updatePackageAction', () => {
  it('no permite cambiar el tipo', async () => {
    vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue({ id: 'pkg-1', kind: 'standard', guest: false, deletedAt: null } as never);
    expect(await updatePackageAction('pkg-1', resetPass)).toMatchObject({ success: false, field: 'kind' });
    expect(ops).toHaveLength(0);
  });

  it('D4: reemplaza solo las reglas de ese paquete y nunca toca lo vendido', async () => {
    vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue({ id: 'pkg-1', kind: 'special', guest: false, deletedAt: null } as never);

    expect(await updatePackageAction('pkg-1', resetPass)).toMatchObject({ success: true, message: 'Paquete actualizado. Los cambios aplican a compras nuevas.' });
    expect(ops.map((o) => `${o.op}:${o.table}`)).toEqual(['update:suscriptions', 'delete:subscription_rules', 'insert:subscription_rules']);
    expect(ops[1].where).toBe('"subscription_rules"."suscription_id" = $1');
    expect(ops.some((o) => ['user_suscriptions', 'user_subscription_balances'].includes(o.table))).toBe(false);
  });

  it('Open Lab conserva sus sesiones (ilimitado)', async () => {
    vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue({ id: 'pkg-ol', kind: 'standard', guest: true, deletedAt: null } as never);
    await updatePackageAction('pkg-ol', {
      kind: 'standard', name: 'Open Lab', shortDescription: 'Haz del movimiento parte de tu vida.', features: [], price: 1850, validity: { amount: 30, unit: 'days' }, sessions: 1,
    });
    expect(ops[0].set).not.toHaveProperty('sessions');
    expect(ops[0].set).not.toHaveProperty('guest');
  });

  it('un paquete eliminado no se edita', async () => {
    vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue({ id: 'pkg-1', kind: 'special', deletedAt: new Date() } as never);
    expect(await updatePackageAction('pkg-1', resetPass)).toEqual({ success: false, error: 'Paquete no encontrado.' });
  });
});

describe('activar / eliminar', () => {
  it('desactivar solo cambia is_active de un paquete no eliminado', async () => {
    expect(await setPackageActiveAction('pkg-1', false)).toMatchObject({ success: true, data: { id: 'pkg-1', isActive: false } });
    expect(ops[0].set).toMatchObject({ isActive: false });
    expect(ops[0].where).toContain('"suscriptions"."deleted_at" is null');
  });

  it('eliminar es lógico: deleted_at, inactivo y sin destacar', async () => {
    expect(await softDeletePackageAction('pkg-1')).toEqual({ success: true, message: 'Paquete eliminado.', data: { id: 'pkg-1' } });
    expect(ops[0].set).toMatchObject({ isActive: false, isFeatured: false });
    expect(ops[0].set?.deletedAt).toBeInstanceOf(Date);
    expect(ops.some((o) => o.op === 'delete')).toBe(false);
  });

  it('H3: ningún archivo de src borra filas del catálogo', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== '__tests__') walk(path);
        } else if (/\.(ts|tsx)$/.test(entry) && /\.delete\(\s*subscriptions\s*\)|DELETE FROM (public\.)?suscriptions\b/i.test(readFileSync(path, 'utf8'))) {
          offenders.push(path);
        }
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});
