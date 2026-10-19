import type { CategoryRecord, ProductRecord, Temperature } from '../../domain/category-tree';
import type { ClosingStatus } from '../../domain/closing';
import type { GrantScope } from '../../domain/courtesy-grants';
import type { Cents } from '../../domain/money';
import type { MemberDiscount, PaymentMethod } from '../../domain/order';

/**
 * Puertos del módulo (SPEC-CAFETERIA §10). La infraestructura los implementa con Drizzle,
 * Resend y el caché de Next; los tests, en memoria.
 */

export type ActorRole = 'client' | 'coach' | 'admin' | 'barra';

/** Quién ejecuta el caso de uso: siempre sale de la sesión, nunca del cliente. */
export interface Actor {
  id: string;
  role: ActorRole;
}

// ── Filas ────────────────────────────────────────────────────────────────────

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: ActorRole;
  deletedAt: Date | null;
}

export interface SettingsRow {
  coachMonthlyCourtesy: number;
  closingNotifyEmails: string[];
  updatedBy: string | null;
  updatedAt: Date;
}

export interface BankAccount {
  id: string;
  bank: string;
  holder: string;
  number: string;
}

export type CourtesySourceKind = 'monthly' | 'grant';

export interface OrderItemRow {
  orderId: string;
  productId: string | null;
  productName: string;
  categoryName: string;
  parentCategoryName: string | null;
  temperature: Temperature | null;
  unitPriceCents: Cents;
  quantity: number;
  isCourtesy: boolean;
  courtesyUserId: string | null;
  courtesySource: CourtesySourceKind | null;
  courtesyPeriod: string | null;
  courtesyGrantId: string | null;
  lineTotalCents: Cents;
}

export type NewOrderItem = Omit<OrderItemRow, 'orderId'>;

export interface OrderRow {
  id: string;
  folio: number;
  requestId: string;
  status: 'paid' | 'voided';
  customerName: string | null;
  customerUserId: string | null;
  paymentMethod: PaymentMethod | null;
  bankAccountId: string | null;
  totalCents: Cents;
  subtotalCents: Cents | null;
  discountCents: Cents;
  discountPercent: number;
  discountLabel: string | null;
  createdBy: string;
  createdAt: Date;
  closingId: string | null;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
}

export type NewOrder = Pick<
  OrderRow,
  | 'requestId'
  | 'customerName'
  | 'customerUserId'
  | 'paymentMethod'
  | 'bankAccountId'
  | 'totalCents'
  | 'subtotalCents'
  | 'discountCents'
  | 'discountPercent'
  | 'discountLabel'
  | 'createdBy'
  | 'createdAt'
>;

export type EmailStatus = 'pending' | 'sent' | 'failed';

export interface ClosingRow {
  id: string;
  createdBy: string;
  periodStart: Date;
  periodEnd: Date;
  status: ClosingStatus;
  ordersCount: number;
  cashOrdersCount: number;
  transferOrdersCount: number;
  courtesyItemsCount: number;
  courtesyValueCents: Cents;
  cashTotalCents: Cents;
  transferTotalCents: Cents;
  cashDeliveredCents: Cents;
  deliveryNote: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  cashReceivedCents: Cents | null;
  shortfallCents: Cents | null;
  resolutionNote: string | null;
  createdEmailStatus: EmailStatus;
  createdEmailSentAt: Date | null;
  resolvedEmailStatus: EmailStatus | null;
  resolvedEmailSentAt: Date | null;
  createdAt: Date;
}

export type NewClosing = Omit<
  ClosingRow,
  | 'id'
  | 'status'
  | 'resolvedBy'
  | 'resolvedAt'
  | 'cashReceivedCents'
  | 'shortfallCents'
  | 'resolutionNote'
  | 'createdEmailStatus'
  | 'createdEmailSentAt'
  | 'resolvedEmailStatus'
  | 'resolvedEmailSentAt'
>;

export interface ClosingResolutionPatch {
  status: Exclude<ClosingStatus, 'pending'>;
  resolvedBy: string;
  resolvedAt: Date;
  cashReceivedCents: Cents;
  shortfallCents: Cents;
  resolutionNote: string | null;
}

export interface GrantRow {
  id: string;
  userId: string;
  grantedBy: string;
  quantity: number;
  scope: GrantScope;
  scopeLabel: string;
  note: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokeReason: string | null;
  createdAt: Date;
}

export type GrantWithUsage = GrantRow & { redeemed: number };

export type NewGrant = Omit<GrantRow, 'id' | 'revokedAt' | 'revokedBy' | 'revokeReason'>;

export type NewCategory = Omit<CategoryRecord, 'id' | 'deletedAt'>;
export type NewProduct = Omit<ProductRecord, 'id' | 'deletedAt'>;

export interface OrderFilter {
  from: Date;
  to: Date;
}

// ── Repositorios (dentro de una transacción) ─────────────────────────────────

export interface MenuRepository {
  listCategories(): Promise<CategoryRecord[]>;
  listProducts(): Promise<ProductRecord[]>;
  /** Serializa cambios de estructura del menú (FOR UPDATE / candado). */
  lockMenu(): Promise<void>;
  insertCategory(row: NewCategory): Promise<CategoryRecord>;
  updateCategory(id: string, patch: Partial<Omit<CategoryRecord, 'id'>>): Promise<void>;
  insertProduct(row: NewProduct): Promise<ProductRecord>;
  updateProduct(id: string, patch: Partial<Omit<ProductRecord, 'id'>>): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<SettingsRow>;
  update(patch: Partial<Omit<SettingsRow, 'updatedAt'>> & { updatedAt: Date }): Promise<void>;
}

export interface UserDirectory {
  findById(id: string): Promise<UserSummary | null>;
  findMany(ids: readonly string[]): Promise<UserSummary[]>;
  /** Por nombre o correo, sin eliminados. */
  search(query: string, limit: number): Promise<UserSummary[]>;
}

export interface CourtesyRepository {
  /** Candado por cliente (cupo mensual y regalos); se toma antes de contar saldos. */
  lockCustomer(userId: string): Promise<void>;
  countMonthlyUsed(userId: string, period: string): Promise<number>;
  /** Regalos con sus canjes en pedidos `paid`. */
  listGrants(filter: { userId?: string; userIds?: readonly string[] }): Promise<GrantWithUsage[]>;
  findGrant(id: string): Promise<GrantWithUsage | null>;
  insertGrant(row: NewGrant): Promise<GrantRow>;
  /** Guarda `revoked_at IS NULL`; `false` si ya estaba revocado. */
  revokeGrant(id: string, patch: { revokedAt: Date; revokedBy: string; revokeReason: string }): Promise<boolean>;
}

export interface OrderRepository {
  findByRequestId(requestId: string): Promise<OrderRow | null>;
  insert(order: NewOrder, items: readonly NewOrderItem[]): Promise<OrderRow>;
  findById(id: string): Promise<OrderRow | null>;
  itemsOf(orderIds: readonly string[]): Promise<OrderItemRow[]>;
  /** Pagados sin corte; `forUpdate` los bloquea para el corte. */
  listOpen(options: { forUpdate: boolean }): Promise<OrderRow[]>;
  listByClosing(closingId: string): Promise<OrderRow[]>;
  listCreatedBetween(filter: OrderFilter): Promise<OrderRow[]>;
  markClosed(orderIds: readonly string[], closingId: string): Promise<void>;
  /** Guarda `status = 'paid' AND closing_id IS NULL`; `false` si no se pudo. */
  void(id: string, patch: { voidedAt: Date; voidedBy: string; voidReason: string }): Promise<boolean>;
}

export interface ClosingRepository {
  insert(row: NewClosing): Promise<ClosingRow>;
  findById(id: string): Promise<ClosingRow | null>;
  /** Guarda `status = 'pending'`; `false` si ya estaba resuelto. */
  resolve(id: string, patch: ClosingResolutionPatch): Promise<boolean>;
  setEmailStatus(id: string, which: 'created' | 'resolved', status: EmailStatus, at: Date | null): Promise<void>;
  listPending(): Promise<ClosingRow[]>;
  listRecent(limit: number): Promise<ClosingRow[]>;
}

export interface MembershipGateway {
  /**
   * Descuento en la barra de la suscripción **activa** del usuario (activa, pago confirmado,
   * sin vencer) cuyo paquete tenga `bar_discount_percent > 0`; el mayor si hubiera varias.
   */
  activeBarDiscount(userId: string): Promise<MemberDiscount | null>;
}

export interface BankAccountGateway {
  /** Solo la cuenta marcada para la barra; nunca la lista de tarjetas. */
  getBarAccount(): Promise<BankAccount | null>;
}

export interface CafeteriaTx {
  menu: MenuRepository;
  settings: SettingsRepository;
  users: UserDirectory;
  courtesy: CourtesyRepository;
  orders: OrderRepository;
  closings: ClosingRepository;
  bank: BankAccountGateway;
  memberships: MembershipGateway;
}

export interface UnitOfWork {
  /** Transacción: todo o nada. */
  run<T>(work: (tx: CafeteriaTx) => Promise<T>): Promise<T>;
  /** Solo lectura, sin transacción. */
  read<T>(work: (tx: CafeteriaTx) => Promise<T>): Promise<T>;
}

// ── Servicios ────────────────────────────────────────────────────────────────

/** Reloj y calendario CDMX (America/Mexico_City). */
export interface Clock {
  now(): Date;
  /** `'YYYY-MM'` CDMX. */
  yearMonth(at: Date): string;
  /** Último milisegundo del mes CDMX. */
  endOfMonth(at: Date): Date;
  /** `'YYYY-MM-DD'` CDMX. */
  ymd(at: Date): string;
  isValidYmd(value: string): boolean;
  /** 00:00:00.000 de `from` a 23:59:59.999 de `to`, CDMX. */
  dayRange(fromYmd: string, toYmd: string): { start: Date; end: Date };
}

export interface ClosingEmailData {
  closing: ClosingRow;
  createdByName: string;
  resolvedByName: string | null;
  items: OrderItemRow[];
  transfers: { folio: number; totalCents: Cents; createdAt: Date }[];
  /** Σ de descuentos por membresía en los pedidos del corte. */
  discountCents: Cents;
  recipients: string[];
}

export interface ClosingNotifier {
  /** `true` si se envió a todos los destinatarios. Nunca lanza. */
  closingCreated(data: ClosingEmailData): Promise<boolean>;
  closingResolved(data: ClosingEmailData): Promise<boolean>;
}

export interface MenuCache {
  /** Invalida el menú público y el de la caja (D7). */
  invalidate(): Promise<void> | void;
}

export interface CafeteriaDeps {
  uow: UnitOfWork;
  clock: Clock;
  notifier: ClosingNotifier;
  menuCache: MenuCache;
}
