-- Data migration: Set subscription status based on current active/payment state
-- This is idempotent and safe to re-run

-- 1. Set status = 'active' for subscriptions where active = true
UPDATE "user_suscriptions"
SET "status" = 'active'
WHERE "active" = true
  AND ("status" IS NULL OR "status" = 'pending');--> statement-breakpoint

-- 2. Set status = 'suspended' for subscriptions where active = false AND payment is confirmed
UPDATE "user_suscriptions"
SET "status" = 'suspended'
WHERE "active" = false
  AND ("status" IS NULL OR "status" = 'pending')
  AND "payment_id" IN (
    SELECT "id" FROM "payments" WHERE "confirmend" = true
  );--> statement-breakpoint

-- 3. Set status = 'pending' for subscriptions where payment is NOT confirmed
UPDATE "user_suscriptions"
SET "status" = 'pending'
WHERE ("status" IS NULL OR "status" = 'pending')
  AND "payment_id" IN (
    SELECT "id" FROM "payments" WHERE "confirmend" = false OR "confirmend" IS NULL
  );
