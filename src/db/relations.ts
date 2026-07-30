import { relations } from 'drizzle-orm';
import {
  users,
  passwordResets,
  subscriptions,
  userSubscriptions,
  payments,
  openClasses,
  classEnrollments,
} from './schema';

export const usersRelations = relations(users, ({ many, one }) => ({
  passwordResets: one(passwordResets, {
    fields: [users.id],
    references: [passwordResets.userId],
  }),
  userSubscriptions: many(userSubscriptions),
  openClasses: many(openClasses),
}));

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
  user: one(users, {
    fields: [passwordResets.userId],
    references: [users.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ many }) => ({
  userSubscriptions: many(userSubscriptions),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  userSubscription: one(userSubscriptions, {
    fields: [payments.id],
    references: [userSubscriptions.paymentId],
  }),
}));

export const userSubscriptionsRelations = relations(userSubscriptions, ({ one, many }) => ({
  payment: one(payments, {
    fields: [userSubscriptions.paymentId],
    references: [payments.id],
  }),
  subscription: one(subscriptions, {
    fields: [userSubscriptions.subscriptionId],
    references: [subscriptions.id],
  }),
  user: one(users, {
    fields: [userSubscriptions.userId],
    references: [users.id],
  }),
  classEnrollments: many(classEnrollments),
}));

export const openClassesRelations = relations(openClasses, ({ one, many }) => ({
  coach: one(users, {
    fields: [openClasses.coachUserId],
    references: [users.id],
  }),
  classEnrollments: many(classEnrollments),
}));

export const classEnrollmentsRelations = relations(classEnrollments, ({ one }) => ({
  openClass: one(openClasses, {
    fields: [classEnrollments.openClassId],
    references: [openClasses.id],
  }),
  userSubscription: one(userSubscriptions, {
    fields: [classEnrollments.userSubscriptionId],
    references: [userSubscriptions.id],
  }),
}));


// debitCards has no relations to other tables
