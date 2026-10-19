import {
  getMexicoCityEndOfMonth,
  getMexicoCityRangeForDays,
  getMexicoCityYearMonth,
  getMexicoCityYmd,
  isValidYmd,
} from '@/lib/utils/date';
import type { CategoryRecord, ProductRecord } from '../../domain/category-tree';
import type { MemberDiscount } from '../../domain/order';
import type {
  Actor,
  BankAccount,
  CafeteriaDeps,
  CafeteriaTx,
  ClosingEmailData,
  ClosingRow,
  Clock,
  GrantRow,
  OrderItemRow,
  OrderRow,
  SettingsRow,
  UserSummary,
} from '../ports';

/**
 * Base de datos en memoria para los casos de uso. Imita lo que importa de Postgres:
 * - las escrituras de una transacción se aplican al confirmar (rollback = descartarlas);
 * - cada lectura ve lo confirmado más lo propio (READ COMMITTED);
 * - candados por llave (advisory lock / FOR UPDATE) que se liberan al terminar;
 * - cada método cede el turno, así dos transacciones simultáneas se intercalan de verdad.
 */

export interface State {
  categories: CategoryRecord[];
  products: ProductRecord[];
  settings: SettingsRow;
  users: UserSummary[];
  barAccount: BankAccount | null;
  grants: GrantRow[];
  orders: OrderRow[];
  items: OrderItemRow[];
  closings: ClosingRow[];
  /** Descuento de la membresía activa de cada usuario (lo que devolvería la consulta real). */
  memberDiscounts: Record<string, MemberDiscount>;
}

type Op = (state: State) => void;

const yieldTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function clone(state: State): State {
  return structuredClone(state);
}

export class InMemoryStore {
  state: State;
  private idSeq = 0;
  private folioSeq = 0;
  private locks = new Map<string, Promise<void>>();
  /** Lanza dentro de la transacción al llamar ese método, después de anotar su escritura. */
  failOn: string | null = null;
  /** Registro de llamadas a candados, para verificar el orden. */
  lockLog: string[] = [];

  constructor(initial: Partial<State> = {}) {
    this.state = {
      categories: [],
      products: [],
      settings: { coachMonthlyCourtesy: 4, closingNotifyEmails: ['thelabpilates77@gmail.com'], updatedBy: null, updatedAt: new Date(0) },
      users: [],
      barAccount: null,
      grants: [],
      orders: [],
      items: [],
      closings: [],
      memberDiscounts: {},
      // Copia: los tests modifican `state` y no deben tocar los fixtures compartidos.
      ...structuredClone(initial),
    };
  }

  nextId(prefix: string): string {
    this.idSeq += 1;
    return `${prefix}-${this.idSeq}`;
  }

  nextFolio(): number {
    this.folioSeq += 1;
    return this.folioSeq;
  }

  /** Espera a que nadie más tenga la llave y la toma. Devuelve la función que la libera. */
  async acquire(key: string): Promise<() => void> {
    while (this.locks.has(key)) await this.locks.get(key);
    let release!: () => void;
    this.locks.set(key, new Promise<void>((resolve) => (release = resolve)));
    this.lockLog.push(key);
    return () => {
      this.locks.delete(key);
      release();
    };
  }

  async transaction<T>(work: (tx: CafeteriaTx) => Promise<T>, readOnly = false): Promise<T> {
    const journal: Op[] = [];
    const held: (() => void)[] = [];
    const view = () => {
      const snapshot = clone(this.state);
      for (const op of journal) op(snapshot);
      return snapshot;
    };
    const write = (name: string, op: Op) => {
      if (readOnly) throw new Error(`escritura ${name} fuera de transacción`);
      journal.push(op);
      if (this.failOn === name) throw new Error(`fallo simulado en ${name}`);
    };
    const lock = async (key: string) => {
      if (readOnly) throw new Error('candado fuera de transacción');
      held.push(await this.acquire(key));
    };
    try {
      const result = await work(this.buildTx(view, write, lock));
      for (const op of journal) op(this.state);
      return result;
    } finally {
      for (const release of held) release();
    }
  }

  private buildTx(view: () => State, write: (name: string, op: Op) => void, lock: (key: string) => Promise<void>): CafeteriaTx {
    const read = async <T>(fn: (s: State) => T): Promise<T> => {
      await yieldTurn();
      return fn(view());
    };
    const paidOrderIds = (s: State) => new Set(s.orders.filter((o) => o.status === 'paid').map((o) => o.id));

    return {
      menu: {
        listCategories: () => read((s) => s.categories),
        listProducts: () => read((s) => s.products),
        lockMenu: () => lock('menu'),
        insertCategory: async (row) => {
          await yieldTurn();
          const created = { ...row, id: this.nextId('cat'), deletedAt: null };
          write('menu.insertCategory', (s) => void s.categories.push(structuredClone(created)));
          return created;
        },
        updateCategory: async (id, patch) => {
          await yieldTurn();
          write('menu.updateCategory', (s) => {
            const c = s.categories.find((x) => x.id === id);
            if (c) Object.assign(c, patch);
          });
        },
        insertProduct: async (row) => {
          await yieldTurn();
          const created = { ...row, id: this.nextId('prod'), deletedAt: null };
          write('menu.insertProduct', (s) => void s.products.push(structuredClone(created)));
          return created;
        },
        updateProduct: async (id, patch) => {
          await yieldTurn();
          write('menu.updateProduct', (s) => {
            const p = s.products.find((x) => x.id === id);
            if (p) Object.assign(p, patch);
          });
        },
      },
      settings: {
        get: () => read((s) => s.settings),
        update: async (patch) => {
          await yieldTurn();
          write('settings.update', (s) => void Object.assign(s.settings, patch));
        },
      },
      users: {
        findById: (id) => read((s) => s.users.find((u) => u.id === id) ?? null),
        findMany: (ids) => read((s) => s.users.filter((u) => ids.includes(u.id))),
        search: (query, limit) =>
          read((s) => {
            const q = query.toLowerCase();
            return s.users
              .filter((u) => u.deletedAt === null && (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)))
              .slice(0, limit);
          }),
      },
      courtesy: {
        lockCustomer: (userId) => lock(`bar-courtesy:${userId}`),
        countMonthlyUsed: (userId, period) =>
          read((s) => {
            const paid = paidOrderIds(s);
            return s.items.filter(
              (i) => paid.has(i.orderId) && i.courtesySource === 'monthly' && i.courtesyUserId === userId && i.courtesyPeriod === period
            ).length;
          }),
        listGrants: (filter) =>
          read((s) => {
            const paid = paidOrderIds(s);
            return s.grants
              .filter((g) => (filter.userId === undefined || g.userId === filter.userId) && (filter.userIds === undefined || filter.userIds.includes(g.userId)))
              .map((g) => ({ ...g, redeemed: s.items.filter((i) => i.courtesyGrantId === g.id && paid.has(i.orderId)).length }))
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          }),
        findGrant: (id) =>
          read((s) => {
            const g = s.grants.find((x) => x.id === id);
            if (!g) return null;
            const paid = paidOrderIds(s);
            return { ...g, redeemed: s.items.filter((i) => i.courtesyGrantId === g.id && paid.has(i.orderId)).length };
          }),
        insertGrant: async (row) => {
          await yieldTurn();
          const created: GrantRow = { ...row, id: this.nextId('grant'), revokedAt: null, revokedBy: null, revokeReason: null };
          write('courtesy.insertGrant', (s) => void s.grants.push(structuredClone(created)));
          return created;
        },
        revokeGrant: async (id, patch) => {
          const current = await read((s) => s.grants.find((g) => g.id === id));
          if (!current || current.revokedAt !== null) return false;
          write('courtesy.revokeGrant', (s) => void Object.assign(s.grants.find((g) => g.id === id)!, patch));
          return true;
        },
      },
      orders: {
        findByRequestId: (requestId) => read((s) => s.orders.find((o) => o.requestId === requestId) ?? null),
        insert: async (order, items) => {
          await yieldTurn();
          const created: OrderRow = {
            ...order,
            id: this.nextId('order'),
            folio: this.nextFolio(),
            status: 'paid',
            closingId: null,
            voidedAt: null,
            voidedBy: null,
            voidReason: null,
          };
          write('orders.insert', (s) => {
            if (s.orders.some((o) => o.requestId === created.requestId)) throw new Error('duplicate request_id');
            s.orders.push(structuredClone(created));
            for (const item of items) s.items.push({ ...structuredClone(item), orderId: created.id });
          });
          return created;
        },
        findById: (id) => read((s) => s.orders.find((o) => o.id === id) ?? null),
        itemsOf: (ids) => read((s) => s.items.filter((i) => ids.includes(i.orderId))),
        listOpen: async ({ forUpdate }) => {
          if (forUpdate) await lock('orders:open');
          return read((s) => s.orders.filter((o) => o.status === 'paid' && o.closingId === null).sort((a, b) => a.folio - b.folio));
        },
        listByClosing: (closingId) => read((s) => s.orders.filter((o) => o.closingId === closingId)),
        listCreatedBetween: ({ from, to }) =>
          read((s) => s.orders.filter((o) => o.createdAt >= from && o.createdAt <= to).sort((a, b) => b.folio - a.folio)),
        markClosed: async (ids, closingId) => {
          await yieldTurn();
          write('orders.markClosed', (s) => {
            for (const o of s.orders) if (ids.includes(o.id)) o.closingId = closingId;
          });
        },
        void: async (id, patch) => {
          const current = await read((s) => s.orders.find((o) => o.id === id));
          if (!current || current.status !== 'paid' || current.closingId !== null) return false;
          write('orders.void', (s) => void Object.assign(s.orders.find((o) => o.id === id)!, { ...patch, status: 'voided' }));
          return true;
        },
      },
      closings: {
        insert: async (row) => {
          await yieldTurn();
          const created: ClosingRow = {
            ...row,
            id: this.nextId('closing'),
            status: 'pending',
            resolvedBy: null,
            resolvedAt: null,
            cashReceivedCents: null,
            shortfallCents: null,
            resolutionNote: null,
            createdEmailStatus: 'pending',
            createdEmailSentAt: null,
            resolvedEmailStatus: null,
            resolvedEmailSentAt: null,
          };
          write('closings.insert', (s) => void s.closings.push(structuredClone(created)));
          return created;
        },
        findById: (id) => read((s) => s.closings.find((c) => c.id === id) ?? null),
        resolve: async (id, patch) => {
          const current = await read((s) => s.closings.find((c) => c.id === id));
          if (!current || current.status !== 'pending') return false;
          write('closings.resolve', (s) =>
            void Object.assign(s.closings.find((c) => c.id === id)!, { ...patch, resolvedEmailStatus: 'pending' })
          );
          return true;
        },
        setEmailStatus: async (id, which, status, at) => {
          await yieldTurn();
          write('closings.setEmailStatus', (s) => {
            const c = s.closings.find((x) => x.id === id)!;
            if (which === 'created') Object.assign(c, { createdEmailStatus: status, createdEmailSentAt: at });
            else Object.assign(c, { resolvedEmailStatus: status, resolvedEmailSentAt: at });
          });
        },
        listPending: () => read((s) => s.closings.filter((c) => c.status === 'pending').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())),
        listRecent: (limit) => read((s) => [...s.closings].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit)),
      },
      bank: {
        getBarAccount: () => read((s) => s.barAccount),
      },
      memberships: {
        activeBarDiscount: (userId) => read((s) => s.memberDiscounts[userId] ?? null),
      },
    };
  }
}

/** Reloj fijo con el calendario CDMX real de `date.ts`. */
export function fixedClock(iso = '2026-10-15T10:00:00.000-06:00'): Clock & { set(iso: string): void } {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    set: (next) => {
      current = new Date(next);
    },
    yearMonth: getMexicoCityYearMonth,
    endOfMonth: getMexicoCityEndOfMonth,
    ymd: getMexicoCityYmd,
    isValidYmd,
    dayRange: getMexicoCityRangeForDays,
  };
}

export function fakeNotifier(result = true) {
  const calls: { kind: 'created' | 'resolved'; data: ClosingEmailData }[] = [];
  return {
    calls,
    result,
    async closingCreated(data: ClosingEmailData) {
      calls.push({ kind: 'created', data });
      return this.result;
    },
    async closingResolved(data: ClosingEmailData) {
      calls.push({ kind: 'resolved', data });
      return this.result;
    },
  };
}

export function fakeMenuCache() {
  return { invalidations: 0, invalidate() { this.invalidations += 1; } };
}

export function makeDeps(store: InMemoryStore, clock = fixedClock()) {
  const notifier = fakeNotifier();
  const menuCache = fakeMenuCache();
  const deps: CafeteriaDeps = {
    uow: { run: (work) => store.transaction(work), read: (work) => store.transaction(work, true) },
    clock,
    notifier,
    menuCache,
  };
  return { deps, notifier, menuCache, clock };
}

export const admin: Actor = { id: 'admin-1', role: 'admin' };
export const barra: Actor = { id: 'barra-1', role: 'barra' };
export const coachActor: Actor = { id: 'coach-1', role: 'coach' };
export const clientActor: Actor = { id: 'client-1', role: 'client' };

export const people: UserSummary[] = [
  { id: 'admin-1', name: 'Admin', email: 'admin@lab.mx', role: 'admin', deletedAt: null },
  { id: 'barra-1', name: 'Beto Barra', email: 'barra@lab.mx', role: 'barra', deletedAt: null },
  { id: 'coach-1', name: 'Carla Coach', email: 'carla@lab.mx', role: 'coach', deletedAt: null },
  { id: 'coach-2', name: 'Diego Coach', email: 'diego@lab.mx', role: 'coach', deletedAt: null },
  { id: 'client-1', name: 'Ana Cliente', email: 'ana@correo.com', role: 'client', deletedAt: null },
  { id: 'gone-1', name: 'Eliminado', email: 'gone@correo.com', role: 'client', deletedAt: new Date('2026-01-01') },
];

export const barAccount: BankAccount = { id: 'card-bar', bank: 'BBVA', holder: 'The Lab Pilates', number: '012345678901234567' };
