import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  smallint,
  time,
  bigint,
  char,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// Relative import: drizzle-kit and the seed script run without the @/ alias.
import { CLASS_TYPES } from '../lib/utils/class-type';

// Enums
// 'barra' llega con sql/manual/2026-10-15_002_barra_role.sql (SPEC-CAFETERIA D1).
export const userRoleEnum = pgEnum('user_role', ['client', 'coach', 'admin', 'barra']);
export const paymentTypeEnum = pgEnum('payment_type', [
  'cash',
  'transfer',
  'card',
]);
export const classAvailabilityEnum = pgEnum('class_availability', [
  'available',
  'not_available',
  'full',
]);
// Valores en src/lib/utils/class-type.ts (CLASS_TYPES); 'sculpt' llega con
// sql/manual/2026-10-06_001_class_type_sculpt.sql.
export const classTypeEnum = pgEnum('class_type', CLASS_TYPES);
export const classStatusEnum = pgEnum('class_status', [
  'scheduled',
  'cancelled',
  'completed',
]);
export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'pending',
  'attended',
  'absent',
  'late_cancelled',
  'cancelled',
]);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'pending',
  'active',
  'suspended',
  'expired',
]);
export const specialEventStatusEnum = pgEnum('special_event_status', [
  'active',
  'cancelled',
  'completed',
]);
export const eventRegistrationStatusEnum = pgEnum('event_registration_status', [
  'pending',
  'confirmed',
  'refund_pending',
  'refunded',
]);

// Tables
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username').notNull(),
  email: varchar('email').notNull().unique(),
  password: varchar('password').notNull(),
  role: userRoleEnum('role').notNull().default('client'),
  emailVerified: boolean('email_verified').default(false),
  emailVerificationToken: varchar('email_verification_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const passwordResets = pgTable('password_resets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  token: varchar('token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/** 'standard' = paquetes de siempre; 'special' = con reglas por disciplina/horario. */
export const PACKAGE_KINDS = ['standard', 'special'] as const;
export type PackageKind = (typeof PACKAGE_KINDS)[number];

export const subscriptions = pgTable('suscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name'),
  sessions: integer('sessions'),
  // true = Open Lab (ilimitado + invitado mensual) en todo el código.
  guest: boolean('guest'),
  price: integer('price'),
  // Paquetes especiales y catálogo — sql/manual/2026-10-07_001_special_packages.sql
  kind: varchar('kind', { length: 16 }).$type<PackageKind>().notNull().default('standard'),
  // NULL = 30 días (paquetes anteriores al cambio).
  validityDays: integer('validity_days'),
  guestCredits: integer('guest_credits').notNull().default(0),
  shortDescription: varchar('short_description', { length: 49 }),
  features: text('features').array().notNull().default(sql`'{}'::text[]`),
  isFeatured: boolean('is_featured').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // % de descuento en la barra con este paquete activo — sql/manual/2026-10-18_001_bar_member_discount.sql
  barDiscountPercent: smallint('bar_discount_percent').notNull().default(0),
});

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentType: paymentTypeEnum('payment_type').notNull(),
  confirmed: boolean('confirmend').default(false),
  dateConfirmed: timestamp('date_confirmed', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const userSubscriptions = pgTable('user_suscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  daysRemaining: integer('days_remaining').default(0),
  paymentId: uuid('payment_id')
    .notNull()
    .unique()
    .references(() => payments.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  subscriptionId: uuid('suscription_id')
    .notNull()
    .references(() => subscriptions.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  active: boolean('active').default(false),
  status: subscriptionStatusEnum('status').default('pending'),
  expirationDate: timestamp('expiration_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  // Copia al comprar (D4). NULL = comprada antes de paquetes especiales => reglas de siempre.
  priceSnapshot: integer('price_snapshot'),
  validityDaysSnapshot: integer('validity_days_snapshot'),
  guestCreditsSnapshot: integer('guest_credits_snapshot'),
});

export const openClasses = pgTable('open_class', {
  id: uuid('id').primaryKey().defaultRandom(),
  classDate: timestamp('class_date', { withTimezone: true }).defaultNow(),
  coachUserId: uuid('coach_user_id').references(() => users.id, {
    onDelete: 'cascade',
    onUpdate: 'cascade',
  }),
  capacity: integer('capacity'),
  available: classAvailabilityEnum('available').default('available'),
  classType: classTypeEnum('class_type'),
  customName: varchar('custom_name', { length: 100 }),
  status: classStatusEnum('status').default('scheduled'),
  // NULL = regular catalog class. NOT NULL = belongs exclusively to a special event.
  specialEventId: uuid('special_event_id').references(() => specialEvents.id, {
    onDelete: 'cascade',
    onUpdate: 'cascade',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Special Events
export const specialEvents = pgTable('special_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 120 }).notNull(),
  description: text('description').notNull(),
  shortDescription: varchar('short_description', { length: 150 }).notNull(),
  price: integer('price').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  status: specialEventStatusEnum('status').notNull().default('active'),
  showOnLanding: boolean('show_on_landing').notNull().default(true),
  createdById: uuid('created_by_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const specialEventDiscounts = pgTable(
  'special_event_discounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    specialEventId: uuid('special_event_id')
      .notNull()
      .references(() => specialEvents.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    discountAmount: integer('discount_amount').notNull(),
  },
  (table) => ({
    uniqueDiscount: uniqueIndex('uk_event_discount_subscription').on(
      table.specialEventId,
      table.subscriptionId
    ),
  })
);

export const specialEventRegistrations = pgTable(
  'special_event_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    specialEventId: uuid('special_event_id')
      .notNull()
      .references(() => specialEvents.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    openClassId: uuid('open_class_id')
      .notNull()
      .references(() => openClasses.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    paymentId: uuid('payment_id')
      .notNull()
      .unique()
      .references(() => payments.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    amountPaid: integer('amount_paid').notNull(),
    status: eventRegistrationStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniquePurchase: uniqueIndex('uk_event_user_registration').on(
      table.specialEventId,
      table.userId
    ),
  })
);

export const classEnrollments = pgTable(
  'class_enrolleds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    openClassId: uuid('open_class_id')
      .notNull()
      .references(() => openClasses.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    userSubscriptionId: uuid('user_suscription_id')
      .notNull()
      .references(() => userSubscriptions.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    status: enrollmentStatusEnum('status').default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    // QR check-in — applied with manual SQL: sql/manual/2026-09-22_001_qr_checkin_columns.sql
    // Single-use token, valid only while status = 'pending'; NULL after attended/absent.
    checkinToken: varchar('checkin_token', { length: 64 }).unique(
      'class_enrolleds_checkin_token_unique'
    ),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    // Cancellation audit (admin only) — sql/manual/2026-09-24_001_enrollment_cancelled_at.sql
    // Set to now() on every transition to cancelled/late_cancelled; NULL otherwise.
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    // Grupo de créditos consumido (paquetes especiales). NULL = reembolso a days_remaining.
    balanceId: uuid('balance_id').references(() => userSubscriptionBalances.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    uniqueEnrollment: uniqueIndex('uk_class_user_enrollment').on(
      table.openClassId,
      table.userSubscriptionId
    ),
  })
);

export const debitCards = pgTable('debit_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardName: varchar('card_name').notNull(),
  cardNumber: varchar('card_number').notNull(),
  cardBank: varchar('card_bank').notNull(),
  active: boolean('active').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  // Cuenta de la barra (SPEC-CAFETERIA A6), independiente de `active` (suscripciones).
  barActive: boolean('bar_active').notNull().default(false),
});

// Guest Management
export const guestOriginEnum = pgEnum('guest_origin', ['user', 'admin']);

export const guestEnrollments = pgTable('guest_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  openClassId: uuid('open_class_id')
    .notNull()
    .references(() => openClasses.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  guestName: varchar('guest_name', { length: 100 }).notNull(),
  origin: guestOriginEnum('origin').notNull(),
  registeredById: uuid('registered_by_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  status: enrollmentStatusEnum('status').default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  // Cancellation audit (admin only) — sql/manual/2026-09-24_001_enrollment_cancelled_at.sql
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
});

export const guestCredits = pgTable('guest_credits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  userSubscriptionId: uuid('user_subscription_id')
    .notNull()
    .references(() => userSubscriptions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  creditsUsed: integer('credits_used').default(0).notNull(),
  guestEnrollmentId: uuid('guest_enrollment_id')
    .references(() => guestEnrollments.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Paquetes especiales — sql/manual/2026-10-07_001_special_packages.sql
// Regla del catálogo: N créditos de [tipos de clase] en una franja opcional (hora CDMX).
export const subscriptionRules = pgTable('subscription_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('suscription_id')
    .notNull()
    .references(() => subscriptions.id, { onDelete: 'restrict' }),
  label: varchar('label', { length: 60 }),
  credits: integer('credits').notNull(),
  allowedClassTypes: classTypeEnum('allowed_class_types').array().notNull(),
  windowStart: time('window_start'),
  windowEnd: time('window_end'),
  sortOrder: smallint('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Copia de cada regla al comprar, con el saldo del alumno (D4).
export const userSubscriptionBalances = pgTable('user_subscription_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  userSubscriptionId: uuid('user_suscription_id')
    .notNull()
    .references(() => userSubscriptions.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').references(() => subscriptionRules.id, { onDelete: 'set null' }),
  label: varchar('label', { length: 60 }).notNull(),
  allowedClassTypes: classTypeEnum('allowed_class_types').array().notNull(),
  windowStart: time('window_start'),
  windowEnd: time('window_end'),
  creditsTotal: integer('credits_total').notNull(),
  creditsRemaining: integer('credits_remaining').notNull(),
  sortOrder: smallint('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Cafetería / barra — sql/manual/2026-10-15_001_cafeteria.sql (SPEC-CAFETERIA §3.1).
// Todo el dinero va en centavos enteros (*_cents). Los CHECK viven en el SQL.
export type BarTemperature = 'cold' | 'hot';
export type BarPaymentMethod = 'cash' | 'transfer';
export type BarOrderStatus = 'paid' | 'voided';
export type BarClosingStatus = 'pending' | 'approved' | 'approved_with_shortfall';
export type BarEmailStatus = 'pending' | 'sent' | 'failed';
export type CourtesyScope = 'any' | 'category' | 'product';
export type CourtesySource = 'monthly' | 'grant';

export const cafeteriaCategories = pgTable('cafeteria_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  // NULL = categoría padre; máximo dos niveles (D10).
  parentId: uuid('parent_id').references((): AnyPgColumn => cafeteriaCategories.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 60 }).notNull(),
  // Solo en el padre; las subcategorías lo heredan (A1).
  usesTemperature: boolean('uses_temperature').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  // NULL = hereda; true/false = fuerza (D3).
  courtesyEligible: boolean('courtesy_eligible'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cafeteriaProducts = pgTable('cafeteria_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => cafeteriaCategories.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 80 }).notNull(),
  priceCents: integer('price_cents').notNull(),
  temperature: varchar('temperature', { length: 4 }).$type<BarTemperature>(),
  courtesyOverride: boolean('courtesy_override'),
  // false = «agotado»: se ve en el menú pero no se vende.
  isAvailable: boolean('is_available').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Una sola fila (id = 1). */
export const cafeteriaSettings = pgTable('cafeteria_settings', {
  id: smallint('id').primaryKey().default(1),
  coachMonthlyCourtesy: integer('coach_monthly_courtesy').notNull().default(4),
  closingNotifyEmails: text('closing_notify_emails')
    .array()
    .notNull()
    .default(sql`ARRAY['thelabpilates77@gmail.com']`),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const barCashClosings = pgTable('bar_cash_closings', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 24 }).$type<BarClosingStatus>().notNull().default('pending'),
  ordersCount: integer('orders_count').notNull(),
  cashOrdersCount: integer('cash_orders_count').notNull(),
  transferOrdersCount: integer('transfer_orders_count').notNull(),
  courtesyItemsCount: integer('courtesy_items_count').notNull().default(0),
  courtesyValueCents: integer('courtesy_value_cents').notNull().default(0),
  cashTotalCents: integer('cash_total_cents').notNull(),
  transferTotalCents: integer('transfer_total_cents').notNull(),
  cashDeliveredCents: integer('cash_delivered_cents').notNull(),
  deliveryNote: text('delivery_note'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  cashReceivedCents: integer('cash_received_cents'),
  shortfallCents: integer('shortfall_cents'),
  resolutionNote: text('resolution_note'),
  createdEmailStatus: varchar('created_email_status', { length: 8 }).$type<BarEmailStatus>().notNull().default('pending'),
  createdEmailSentAt: timestamp('created_email_sent_at', { withTimezone: true }),
  resolvedEmailStatus: varchar('resolved_email_status', { length: 8 }).$type<BarEmailStatus>(),
  resolvedEmailSentAt: timestamp('resolved_email_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const barOrders = pgTable('bar_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  folio: bigint('folio', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
  // Evita doble cobro por doble clic o reintento.
  requestId: uuid('request_id').notNull().unique(),
  status: varchar('status', { length: 8 }).$type<BarOrderStatus>().notNull().default('paid'),
  customerName: varchar('customer_name', { length: 100 }),
  customerUserId: uuid('customer_user_id').references(() => users.id, { onDelete: 'set null' }),
  // NULL ⇔ total 0 (100 % cortesía).
  paymentMethod: varchar('payment_method', { length: 10 }).$type<BarPaymentMethod>(),
  bankAccountId: uuid('bank_account_id').references(() => debitCards.id, { onDelete: 'set null' }),
  totalCents: integer('total_cents').notNull(),
  // Descuento por membresía (SPEC-CAFETERIA D13). subtotal NULL = pedido anterior al cambio.
  subtotalCents: integer('subtotal_cents'),
  discountCents: integer('discount_cents').notNull().default(0),
  discountPercent: smallint('discount_percent').notNull().default(0),
  discountLabel: varchar('discount_label', { length: 80 }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closingId: uuid('closing_id').references(() => barCashClosings.id),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedBy: uuid('voided_by').references(() => users.id),
  voidReason: text('void_reason'),
});

/** Cortesías regaladas por el admin (D11, A12, A13). */
export const cafeteriaCourtesyGrants = pgTable('cafeteria_courtesy_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  grantedBy: uuid('granted_by')
    .notNull()
    .references(() => users.id),
  quantity: smallint('quantity').notNull(),
  scope: varchar('scope', { length: 8 }).$type<CourtesyScope>().notNull(),
  categoryId: uuid('category_id').references(() => cafeteriaCategories.id, { onDelete: 'restrict' }),
  productId: uuid('product_id').references(() => cafeteriaProducts.id, { onDelete: 'restrict' }),
  scopeLabel: varchar('scope_label', { length: 140 }).notNull(),
  note: text('note'),
  // Fin del día elegido en CDMX; NULL = sin vencimiento.
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by').references(() => users.id),
  revokeReason: text('revoke_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const barOrderItems = pgTable('bar_order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => barOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => cafeteriaProducts.id, { onDelete: 'set null' }),
  // Copias al vender: editar el menú no cambia ventas pasadas.
  productName: varchar('product_name', { length: 80 }).notNull(),
  categoryName: varchar('category_name', { length: 60 }).notNull(),
  parentCategoryName: varchar('parent_category_name', { length: 60 }),
  temperature: varchar('temperature', { length: 4 }).$type<BarTemperature>(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  quantity: smallint('quantity').notNull(),
  isCourtesy: boolean('is_courtesy').notNull().default(false),
  courtesyUserId: uuid('courtesy_user_id').references(() => users.id),
  courtesySource: varchar('courtesy_source', { length: 7 }).$type<CourtesySource>(),
  // 'YYYY-MM' en CDMX (solo cupo mensual).
  courtesyPeriod: char('courtesy_period', { length: 7 }),
  courtesyGrantId: uuid('courtesy_grant_id').references(() => cafeteriaCourtesyGrants.id),
  lineTotalCents: integer('line_total_cents').notNull(),
});

