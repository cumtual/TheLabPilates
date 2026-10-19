import {
  categoryPath,
  isCategoryVisible,
  isProductVisible,
  type CategoryRecord,
  type ProductRecord,
} from '../../domain/category-tree';
import { effectiveCourtesyEligibility, MONTHLY_COURTESY_MAX, type EffectiveEligibility } from '../../domain/courtesy';
import {
  buildScopeLabel,
  GRANT_QUANTITY_MAX,
  GRANT_QUANTITY_MIN,
  grantRemaining,
  type GrantScope,
  type GrantStatus,
} from '../../domain/courtesy-grants';
import { CafeteriaError, invalid } from '../../domain/errors';
import type { MemberDiscount } from '../../domain/order';
import type { Actor, ActorRole, CafeteriaDeps, GrantRow } from '../ports';
import {
  ADMIN_ONLY,
  BAR_ROLES,
  loadCustomerCourtesy,
  loadMenuSnapshot,
  optionalText,
  requireRole,
  requiredText,
  statusOfGrant,
  type GrantBalanceView,
  type MonthlyCourtesyView,
} from '../shared';

/** Reglas de cortesía (D3), regalos del admin (D11), «Mis cortesías» (D12) y búsqueda de clientes. */

// ── Reglas y correos (admin) ─────────────────────────────────────────────────

export interface CourtesyRules {
  limit: number;
  notifyEmails: string[];
  categories: CategoryRecord[];
  products: (ProductRecord & { effective: EffectiveEligibility })[];
}

export async function getCourtesyRules(deps: CafeteriaDeps, actor: Actor | null): Promise<CourtesyRules> {
  requireRole(actor, ADMIN_ONLY);
  return deps.uow.read(async (tx) => {
    const [settings, snapshot] = await Promise.all([tx.settings.get(), loadMenuSnapshot(tx)]);
    return {
      limit: settings.coachMonthlyCourtesy,
      notifyEmails: settings.closingNotifyEmails,
      categories: snapshot.categories.filter((c) => c.deletedAt === null),
      products: snapshot.products
        .filter((p) => p.deletedAt === null)
        .map((p) => ({ ...p, effective: effectiveCourtesyEligibility(p, snapshot.index) })),
    };
  });
}

export interface UpdateCourtesyRulesInput {
  limit: number;
  notifyEmails: string[];
  categories: { id: string; eligible: boolean | null }[];
  products: { id: string; override: boolean | null }[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const NOTIFY_EMAILS_MAX = 10;

export async function updateCourtesyRules(deps: CafeteriaDeps, actor: Actor | null, input: UpdateCourtesyRulesInput): Promise<void> {
  const admin = requireRole(actor, ADMIN_ONLY);
  if (!Number.isInteger(input.limit) || input.limit < 0 || input.limit > MONTHLY_COURTESY_MAX) {
    throw invalid(`El límite va de 0 a ${MONTHLY_COURTESY_MAX}.`, 'limit');
  }
  const emails = input.notifyEmails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) throw invalid('Agrega al menos un correo.', 'notifyEmails');
  if (emails.length > NOTIFY_EMAILS_MAX) throw invalid(`Máximo ${NOTIFY_EMAILS_MAX} correos.`, 'notifyEmails');
  const bad = emails.find((e) => !EMAIL_PATTERN.test(e));
  if (bad) throw invalid(`Correo no válido: ${bad}`, 'notifyEmails');
  if (new Set(emails).size !== emails.length) throw invalid('Hay correos repetidos.', 'notifyEmails');

  await deps.uow.run(async (tx) => {
    const { categories, products } = await loadMenuSnapshot(tx);
    for (const c of input.categories) {
      if (!categories.some((x) => x.id === c.id && x.deletedAt === null)) throw new CafeteriaError('NOT_FOUND', 'Una categoría ya no existe.');
    }
    for (const p of input.products) {
      if (!products.some((x) => x.id === p.id && x.deletedAt === null)) throw new CafeteriaError('NOT_FOUND', 'Un producto ya no existe.');
    }
    const now = deps.clock.now();
    for (const c of input.categories) await tx.menu.updateCategory(c.id, { courtesyEligible: c.eligible });
    for (const p of input.products) await tx.menu.updateProduct(p.id, { courtesyOverride: p.override });
    await tx.settings.update({ coachMonthlyCourtesy: input.limit, closingNotifyEmails: emails, updatedBy: admin.id, updatedAt: now });
  });
}

// ── Regalos (admin) ──────────────────────────────────────────────────────────

export interface GrantCourtesyInput {
  userId: string;
  quantity: number;
  scope: GrantScope;
  /** Último día válido (`YYYY-MM-DD`, CDMX). */
  expiresOn?: string | null;
  note?: string | null;
}

export async function grantCourtesy(deps: CafeteriaDeps, actor: Actor | null, input: GrantCourtesyInput): Promise<GrantRow> {
  const admin = requireRole(actor, ADMIN_ONLY);
  if (!Number.isInteger(input.quantity) || input.quantity < GRANT_QUANTITY_MIN || input.quantity > GRANT_QUANTITY_MAX) {
    throw invalid(`La cantidad va de ${GRANT_QUANTITY_MIN} a ${GRANT_QUANTITY_MAX}.`, 'quantity');
  }
  const note = optionalText(input.note, 'note');
  const now = deps.clock.now();
  let expiresAt: Date | null = null;
  if (input.expiresOn) {
    if (!deps.clock.isValidYmd(input.expiresOn)) throw invalid('Fecha no válida.', 'expiresOn');
    if (input.expiresOn < deps.clock.ymd(now)) throw invalid('El vencimiento no puede ser una fecha pasada.', 'expiresOn');
    expiresAt = deps.clock.dayRange(input.expiresOn, input.expiresOn).end;
  }

  return deps.uow.run(async (tx) => {
    const user = await tx.users.findById(input.userId);
    if (!user || user.deletedAt !== null) throw new CafeteriaError('NOT_FOUND', 'El usuario no existe.', 'userId');
    const snapshot = await loadMenuSnapshot(tx);

    let scopeLabel: string;
    switch (input.scope.type) {
      case 'any':
        scopeLabel = buildScopeLabel({ type: 'any' });
        break;
      case 'category': {
        const category = snapshot.index.get(input.scope.categoryId);
        if (!category || !isCategoryVisible(category, snapshot.index)) {
          throw new CafeteriaError('NOT_FOUND', 'Elige una categoría activa.', 'scope');
        }
        scopeLabel = buildScopeLabel({ type: 'category', path: categoryPath(category, snapshot.index) });
        break;
      }
      case 'product': {
        const id = input.scope.productId;
        const product = snapshot.products.find((p) => p.id === id);
        if (!product || !isProductVisible(product, snapshot.index)) {
          throw new CafeteriaError('NOT_FOUND', 'Elige un producto activo.', 'scope');
        }
        scopeLabel = buildScopeLabel({ type: 'product', name: product.name, temperature: product.temperature });
        break;
      }
    }

    return tx.courtesy.insertGrant({
      userId: user.id,
      grantedBy: admin.id,
      quantity: input.quantity,
      scope: input.scope,
      scopeLabel,
      note,
      expiresAt,
      createdAt: now,
    });
  });
}

export async function revokeCourtesy(deps: CafeteriaDeps, actor: Actor | null, input: { grantId: string; reason: string }): Promise<void> {
  const admin = requireRole(actor, ADMIN_ONLY);
  const reason = requiredText(input.reason, 'Escribe el motivo.', 'reason');
  await deps.uow.run(async (tx) => {
    const grant = await tx.courtesy.findGrant(input.grantId);
    if (!grant) throw new CafeteriaError('NOT_FOUND', 'El regalo no existe.');
    const status = statusOfGrant(grant, deps.clock.now(), await loadMenuSnapshot(tx));
    if (status === 'revoked') throw new CafeteriaError('CONFLICT', 'Este regalo ya está revocado.');
    if (status === 'expired') throw new CafeteriaError('CONFLICT', 'Este regalo ya venció.');
    if (status === 'used') throw new CafeteriaError('CONFLICT', 'Este regalo ya se usó completo.');
    const done = await tx.courtesy.revokeGrant(grant.id, { revokedAt: deps.clock.now(), revokedBy: admin.id, revokeReason: reason });
    if (!done) throw new CafeteriaError('CONFLICT', 'Este regalo ya está revocado.');
  });
}

export interface GrantListItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  scopeLabel: string;
  quantity: number;
  redeemed: number;
  remaining: number;
  status: GrantStatus;
  expiresAt: Date | null;
  note: string | null;
  grantedByName: string;
  createdAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
}

export async function listCourtesyGrants(
  deps: CafeteriaDeps,
  actor: Actor | null,
  filter: { userQuery?: string; status?: GrantStatus } = {}
): Promise<GrantListItem[]> {
  requireRole(actor, ADMIN_ONLY);
  return deps.uow.read(async (tx) => {
    const query = filter.userQuery?.trim() ?? '';
    const userIds = query.length >= 2 ? (await tx.users.search(query, 50)).map((u) => u.id) : undefined;
    if (userIds?.length === 0) return [];
    const [grants, snapshot] = await Promise.all([tx.courtesy.listGrants(userIds ? { userIds } : {}), loadMenuSnapshot(tx)]);
    const people = await tx.users.findMany([...new Set(grants.flatMap((g) => [g.userId, g.grantedBy]))]);
    const person = (id: string) => people.find((p) => p.id === id);
    const now = deps.clock.now();
    return grants
      .map((g) => ({
        id: g.id,
        userId: g.userId,
        userName: person(g.userId)?.name ?? 'Usuario',
        userEmail: person(g.userId)?.email ?? '',
        scopeLabel: g.scopeLabel,
        quantity: g.quantity,
        redeemed: g.redeemed,
        remaining: grantRemaining(g),
        status: statusOfGrant(g, now, snapshot),
        expiresAt: g.expiresAt,
        note: g.note,
        grantedByName: person(g.grantedBy)?.name ?? 'Usuario',
        createdAt: g.createdAt,
        revokedAt: g.revokedAt,
        revokeReason: g.revokeReason,
      }))
      .filter((g) => !filter.status || g.status === filter.status);
  });
}

// ── «Mis cortesías» (D12) ────────────────────────────────────────────────────

export interface MyCourtesies {
  monthly: Pick<MonthlyCourtesyView, 'remaining' | 'limit'> | null;
  grants: Pick<GrantBalanceView, 'id' | 'scopeLabel' | 'remaining' | 'quantity' | 'expiresAt'>[];
}

/** Solo las propias: usa el id de la sesión; no muestra quién regaló ni la nota. */
export async function getMyCourtesies(deps: CafeteriaDeps, actor: Actor | null): Promise<MyCourtesies> {
  const me = requireRole(actor, ['client', 'coach', 'admin', 'barra'] satisfies ActorRole[]);
  return deps.uow.read(async (tx) => {
    const snapshot = await loadMenuSnapshot(tx);
    const courtesy = await loadCustomerCourtesy(tx, deps.clock, me, snapshot, deps.clock.now());
    return {
      monthly: courtesy.monthly ? { remaining: courtesy.monthly.remaining, limit: courtesy.monthly.limit } : null,
      grants: courtesy.grants.map(({ id, scopeLabel, remaining, quantity, expiresAt }) => ({ id, scopeLabel, remaining, quantity, expiresAt })),
    };
  });
}

// ── Búsqueda de clientes (barra, admin) ──────────────────────────────────────

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_LIMIT = 8;

export interface CustomerResult {
  id: string;
  name: string;
  email: string;
  role: ActorRole;
  /** Descuento en la barra por su membresía activa (D13), o `null`. */
  discount: MemberDiscount | null;
  courtesy: { monthly: MonthlyCourtesyView | null; grants: GrantBalanceView[] };
}

/** §9: mínimo 2 caracteres, máximo 8, solo id, nombre, correo y rol (más sus cortesías). */
export async function searchCustomers(deps: CafeteriaDeps, actor: Actor | null, input: { q: string }): Promise<CustomerResult[]> {
  requireRole(actor, BAR_ROLES);
  const q = input.q.trim();
  if (q.length < SEARCH_MIN_CHARS) return [];
  return deps.uow.read(async (tx) => {
    const [users, snapshot] = await Promise.all([tx.users.search(q, SEARCH_LIMIT), loadMenuSnapshot(tx)]);
    const now = deps.clock.now();
    return Promise.all(
      users.slice(0, SEARCH_LIMIT).map(async (user) => {
        const [{ monthly, grants }, discount] = await Promise.all([
          loadCustomerCourtesy(tx, deps.clock, user, snapshot, now),
          tx.memberships.activeBarDiscount(user.id),
        ]);
        return { id: user.id, name: user.name, email: user.email, role: user.role, discount, courtesy: { monthly, grants } };
      })
    );
  });
}
