@AGENTS.md

# The Pilates Lab Studio — Frontend

## 1. Overview & Tech Stack
- **Framework:** Next.js 16 (App Router, Server Actions) + React 19. Next 16 has breaking changes vs. training data — check `node_modules/next/dist/docs/` before writing framework code.
- **Backend:** Server Actions (`src/actions/`) + Route Handlers (`src/app/api/`). No separate API server.
- **DB:** PostgreSQL on Supabase (pooled via PgBouncer `:6543`; direct `:5432` for migrations).
- **ORM:** Drizzle ORM (`drizzle-orm`, `postgres` driver) + `drizzle-kit`.
- **Auth:** Custom JWT (`jose`) in cookies + `bcryptjs`; role routing in `src/middleware.ts`.
- **Email:** Resend (`src/lib/email/service.ts`).
- **Tooling:** TypeScript (strict), Tailwind CSS v4, ESLint 9, Vitest 4 + Testing Library + jsdom + `fast-check` (property tests).
- **Package manager:** pnpm only (enforced by `preinstall`).
- **Deploy:** Vercel. Cron `0 6 * * *` → `/api/cron/complete-classes` (protected by `CRON_SECRET`).
- **Official timezone:** `America/Mexico_City` (CST / UTC-6). Always use the helpers in `src/lib/utils/date.ts`; never rely on server-local time.

### Environment (`.env.local.example`)
`DATABASE_URL`, `DATABASE_URL_DIRECT`, `JWT_SECRET` (≥32 chars), `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`.

## 2. CLI Cheatsheet
```bash
pnpm dev            # next dev
pnpm build          # next build
pnpm lint           # eslint
pnpm test           # vitest run
pnpm vitest run path/to/file.test.ts   # single test file
pnpm db:generate    # ⛔ not used for the live DB (see "Production DB rules")
pnpm db:migrate     # ⛔ NEVER against the live DB
pnpm db:push        # ⛔ NEVER against the live DB
pnpm db:studio      # drizzle-kit studio (read-only inspection)
pnpm db:seed        # tsx src/db/seed.ts
```

## 3. Architecture & Directory Map
```
src/
├── app/
│   ├── (auth)/                 # login, register, password reset
│   ├── (portal)/               # authenticated area, one segment per role
│   │   ├── admin/              # attendance, classes, debit-cards, events, payments, profile, subscriptions, users
│   │   ├── coach/              # attendance, classes, profile
│   │   └── client/             # classes, events, reservations, subscription, profile
│   ├── api/cron/complete-classes, api/waitlist
│   └── aviso-de-privacidad, terminos-y-condiciones, soon   # public/legal
├── actions/                    # Server Actions (business logic entry points)
│   └── admin*.ts, coach.ts, enrollment.ts, subscription.ts, event.ts, guest.ts, auth.ts, profile.ts, debit-cards.ts
├── components/
│   ├── admin/ | coach/ | client/   # role-specific UI
│   ├── ui/, layout/, sections/     # shared UI, layout, landing-page sections
│   └── auth/, profile/, legal/
├── db/                         # schema.ts (tables + enums), relations.ts, index.ts (client), seed.ts
├── lib/
│   ├── auth/                   # jwt, session, password, rate-limiter
│   ├── queries/                # read queries, subscription expiration, class auto-completion
│   ├── guest/                  # guest capacity, credits, eligibility
│   ├── events/                 # special-event capacity
│   ├── utils/                  # date.ts (TZ), class-type.ts
│   └── types/                  # actions.ts (ActionResult types), roles.ts, guest.ts
└── middleware.ts               # JWT check + redirects each role to its own /admin|/coach|/client prefix
drizzle/                        # generated SQL migrations + meta
.kiro/specs/                    # feature specs (timezone, guests, expired subscriptions, custom classes…)
```
Tests live next to code in `__tests__/` folders.

### Key schema (`src/db/schema.ts`)
- Tables: `users`, `password_resets`, `suscriptions` (plan catalog — note spelling), `user_suscriptions`, `payments`, `open_class` (classes), `class_enrollments`, `special_events`, `special_event_discounts`, `special_event_registrations`, `debit_cards`, `guest_enrollments`, `guest_credits`.
- Special packages (`SPEC-SPECIAL-PACKAGES.md`): `subscription_rules` (catalog groups: N credits of [class types] in an optional CDMX time window) and `user_subscription_balances` (per-purchase copy of each rule with `credits_remaining`). `class_enrolleds.balance_id` records which group a booking consumed.
- Enums:
  - `user_role`: client | coach | admin
  - `subscription_status`: pending | active | suspended | expired
  - `class_status`: scheduled | cancelled | completed
  - `class_type`: yoga | mat_pilates | barre | personalizada | sculpt (source of truth: `CLASS_TYPES` in `src/lib/utils/class-type.ts`)
  - `enrollment_status`: pending | attended | absent | late_cancelled | cancelled
  - `event_registration_status`: pending | confirmed | refund_pending | refunded
  - `payment_type`: cash | transfer | card

### Production DB rules (real client data)
- The live Supabase DB has **never** been managed by Drizzle Migrations. `drizzle/` and `drizzle/meta` do not reflect what is applied.
- Schema changes are **manual SQL scripts** in `sql/manual/` (`YYYY-MM-DD_NNN_description.sql`). They must be additive and idempotent (`ADD COLUMN IF NOT EXISTS`, constraints guarded by `pg_constraint` checks), wrapped in `BEGIN/COMMIT` with `SET LOCAL lock_timeout`. **The user runs them**; Claude never does.
- **Forbidden:** `drizzle-kit push` (with or without `--force`), `pnpm db:push`, `pnpm db:migrate`, `DROP`, `TRUNCATE`, `DELETE` for cleanup, `ALTER TYPE`, `RENAME`, `SET NOT NULL`.
- Deploy order: apply the DDL in production **before** deploying code that references new columns. Drizzle selects every schema column, so a missing column breaks the app.

## 4. Core Invariants (Business Rules)
- **Class duration:** every class lasts exactly **50 minutes**.
- **Cancellations & refunds:** a credit is refunded only when cancelling **≥24 h before** the class, or within a **10-minute grace window after booking**. Otherwise the enrollment becomes `late_cancelled` (no refund).
- **Cancellation audit (`SPEC-CANCELLATION-AUDIT-AND-TERMS.md`):**
  - Cancelling never deletes the row. Every transition to `cancelled` or `late_cancelled` uses `buildEnrollmentCancellationPatch` or `buildGuestCancellationPatch` from `src/lib/enrollment/cancellation.ts`, which set `cancelled_at = now()`. The update is guarded with `status = 'pending'` so a credit is never refunded twice.
  - When a user books a class again after cancelling, the cancelled row is reactivated (`created_at = now()`) instead of inserted, because of `uk_class_user_enrollment`.
  - `created_at` and `cancelled_at` are **admin-only**. Read them only through `src/lib/queries/admin-enrollment-audit.ts`, which checks the role, and never add them to the shared coach queries in `lib/queries/coach.ts`.
  - The text in `/terminos-y-condiciones` §5 must match these rules exactly.
- **Subscription lifecycle:**
  - **Open Lab** (`guest = true`): unlimited classes, valid 30 days from payment confirmation, no credit tracking, **1 guest credit per month**. `guest = true` means "Open Lab" everywhere in the code.
  - **Credit packages (Progress, Practice, Entry, Pass):** `days_remaining` holds the remaining **credits** (not days). Valid 30 days from payment confirmation. When the 30 days end → `expired`. When credits reach 0, the subscription stays active (dashboard shows "Sin créditos") until every class booked with it is completed, then → `expired` (`lib/queries/check-subscription-expiration.ts`). **NEVER** `suspended`.
  - `suspended` is reserved for **manual admin intervention only**.
  - **One active subscription per user.** When the admin confirms the payment of a new package, the user's previous active subscription becomes `expired` (`active = false`) and its remaining credits are lost. Its existing bookings are kept and can be attended; cancelling one does **not** refund the credit. Exception: if the studio cancels the class, `cancelClassAction` reports those users and the admin restores the session on their current subscription (terms §5.7). The purchase screen warns about this before confirming. The previous subscription is expired at payment confirmation, never at purchase, so a rejected payment leaves it untouched.
  - **Prices and conditions are fixed at purchase:** each `user_suscriptions` row stores `price_snapshot`, `validity_days_snapshot` and `guest_credits_snapshot`, and special packages copy their rules into `user_subscription_balances`. Editing the catalog only affects new purchases. `NULL` snapshots mean a subscription bought before this change and follow the legacy rules (30 days, catalog price).
- **Package catalog (`/admin/packages`, admin only):**
  - Packages are never hard-deleted (`user_suscriptions.suscription_id` cascades): use `is_active` and `deleted_at`. Only active, non-deleted packages appear in the landing (`#paquetes`) and in `/client/subscription`, both read from the DB.
  - Card content: short description **< 50 characters** (max 49), **at most 4** features of up to 24 characters, validated by the shared Zod schema in `src/lib/subscription/package-schema.ts` and by DB `CHECK`s. At most one featured package.
  - Validity is configurable per package (days or weeks, stored as days, 1–365) and counts from payment confirmation.
- **Special packages (`kind = 'special'`):**
  - Made of 1–6 credit groups. Each group has N credits, a list of allowed class types and an optional time window (`HH:MM`–`HH:MM`, CDMX, inclusive on both ends, evaluated on the class **start** time). Example: "Reset Pass" = 1 Yoga + 1 of [Mat Pilates | Barre]; once Mat is booked, Barre is rejected and only Yoga remains.
  - Booking picks the most restrictive usable group (fewest class types, then with a time window, then `sort_order`). Rejections return a specific code and message (`CLASS_TYPE_NOT_INCLUDED`, `GROUP_EXHAUSTED`, `OUTSIDE_TIME_WINDOW`, `NO_CREDITS`).
  - `days_remaining` always equals the sum of the groups' `credits_remaining`, updated in the same transaction. Only `src/lib/subscription/credits.ts` writes `days_remaining`, `credits_remaining` or `balance_id`.
  - Lock order in every transaction: `open_class` → `user_suscriptions` → `user_subscription_balances`.
  - A timely cancellation refunds the credit to the **same group**. Manual admin credit adjustments on a special package require choosing the group.
  - A special package is never Open Lab (`guest = false`, enforced by a DB `CHECK`). It may include N guest passes (`guest_credits`, 0–10) for the whole validity period; cancelling a guest in time restores only that guest's pass.
  - The text in `/terminos-y-condiciones` §3 and §4 must match these rules.
- **Roles & permissions:**
  - **Admin:** full control, cancels classes, approves payments, manages the package catalog.
  - **Coach:** may edit capacity and date/time **only of their own assigned classes**. **Must not cancel classes.** May create every class type **except `personalizada`** (custom name), which is admin-only. Server actions validate with `canRoleCreateClassType`; forms use `getClassTypeOptions(role)` from `src/lib/utils/class-type.ts`.
  - **Client:** books classes; sees bank-transfer details only when they have pending payments.
- **Attendance (QR check-in, `SPEC-QR-CHECKIN.md`):**
  - Each `pending` enrollment has a single-use `checkin_token` (64 hex).
  - The QR points to `/check-in?token=…`, which `POST /api/check-in` processes. Only the class's own coach or an admin can process it; a client gets 403. The check-in runs in one `FOR UPDATE` transaction that sets `attended`, sets `checked_in_at` and clears the token.
  - It is only allowed on the class's CDMX calendar day.
  - The daily cron (`/api/cron/complete-classes`, 00:00 CDMX) sets still-`pending` enrollments to `absent` for classes from `ATTENDANCE_AUTO_CLOSE_FROM` onward. Code lives in `src/lib/checkin/`.
- **Special events:** no guests via Open Lab, no user-initiated cancellations/refunds, spots confirmed only once payment is approved.

## 5. Code Conventions & Patterns
- SOLID, Clean Code, strict typing (no `any`); Server Actions return the typed results in `src/lib/types/actions.ts`.
- Every credit/capacity mutation runs inside an atomic `db.transaction(...)`, re-validating state inside the transaction.
- Authorization is enforced server-side in each action (session + role + ownership), not only via middleware or UI.
- Dates: store UTC, compute/display in `America/Mexico_City` via `src/lib/utils/date.ts`.
- UI: mobile-first, responsive Tailwind components; role-specific components go in `components/<role>/`.
- Schema changes: follow "Production DB rules" (section 3); update `src/db/schema.ts` to mirror the manual SQL.
- Add/update Vitest tests in the nearest `__tests__/` for any business-rule change.
