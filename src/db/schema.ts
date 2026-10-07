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
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// Relative import: drizzle-kit and the seed script run without the @/ alias.
import { CLASS_TYPES } from '../lib/utils/class-type';

// Enums
export const userRoleEnum = pgEnum('user_role', ['client', 'coach', 'admin']);
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
