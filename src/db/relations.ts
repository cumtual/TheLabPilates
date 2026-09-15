import { relations } from 'drizzle-orm';
import {
  users,
  passwordResets,
  subscriptions,
  userSubscriptions,
  payments,
  openClasses,
  classEnrollments,
  guestEnrollments,
  guestCredits,
  specialEvents,
  specialEventDiscounts,
  specialEventRegistrations,
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
  specialEvent: one(specialEvents, {
    fields: [openClasses.specialEventId],
    references: [specialEvents.id],
  }),
  classEnrollments: many(classEnrollments),
}));

export const specialEventsRelations = relations(specialEvents, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [specialEvents.createdById],
    references: [users.id],
  }),
  classes: many(openClasses),
  discounts: many(specialEventDiscounts),
  registrations: many(specialEventRegistrations),
}));

export const specialEventDiscountsRelations = relations(specialEventDiscounts, ({ one }) => ({
  specialEvent: one(specialEvents, {
    fields: [specialEventDiscounts.specialEventId],
    references: [specialEvents.id],
  }),
  subscription: one(subscriptions, {
    fields: [specialEventDiscounts.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const specialEventRegistrationsRelations = relations(
  specialEventRegistrations,
  ({ one }) => ({
    specialEvent: one(specialEvents, {
      fields: [specialEventRegistrations.specialEventId],
      references: [specialEvents.id],
    }),
    user: one(users, {
      fields: [specialEventRegistrations.userId],
      references: [users.id],
    }),
    openClass: one(openClasses, {
      fields: [specialEventRegistrations.openClassId],
      references: [openClasses.id],
    }),
    payment: one(payments, {
      fields: [specialEventRegistrations.paymentId],
      references: [payments.id],
    }),
  })
);

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

export const guestEnrollmentsRelations = relations(guestEnrollments, ({ one }) => ({
  openClass: one(openClasses, {
    fields: [guestEnrollments.openClassId],
    references: [openClasses.id],
  }),
  registeredBy: one(users, {
    fields: [guestEnrollments.registeredById],
    references: [users.id],
  }),
}));

export const guestCreditsRelations = relations(guestCredits, ({ one }) => ({
  user: one(users, {
    fields: [guestCredits.userId],
    references: [users.id],
  }),
  userSubscription: one(userSubscriptions, {
    fields: [guestCredits.userSubscriptionId],
    references: [userSubscriptions.id],
  }),
  guestEnrollment: one(guestEnrollments, {
    fields: [guestCredits.guestEnrollmentId],
    references: [guestEnrollments.id],
  }),
}));


// debitCards has no relations to other tables
