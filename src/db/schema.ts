import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

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
export const classTypeEnum = pgEnum('class_type', [
  'yoga',
  'mat_pilates',
  'barre',
]);
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

// Tables
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username').notNull(),
  email: varchar('email').notNull().unique(),
  password: varchar('password').notNull(),
  role: userRoleEnum('role').notNull().default('client'),
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

export const subscriptions = pgTable('suscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name'),
  sessions: integer('sessions'),
  guest: boolean('guest'),
  price: integer('price'),
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
  expirationDate: timestamp('expiration_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
  status: classStatusEnum('status').default('scheduled'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

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
