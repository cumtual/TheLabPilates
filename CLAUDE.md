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
- Enums:
  - `user_role`: client | coach | admin
  - `subscription_status`: pending | active | suspended | expired
  - `class_status`: scheduled | cancelled | completed
  - `class_type`: yoga | mat_pilates | barre | personalizada
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
- **Subscription lifecycle:**
  - **Open Lab:** valid 30 days (`days_remaining`), no credit tracking, **1 guest credit per month**.
  - **Credit packages (Progress, Practice, Entry, Pass):** credits valid for 1 month; when credits reach 0 **or** the month ends → `expired` (**NEVER** `suspended`).
  - `suspended` is reserved for **manual admin intervention only**.
- **Roles & permissions:**
  - **Admin:** full control, cancels classes, approves payments.
  - **Coach:** may edit capacity and date/time **only of their own assigned classes**. **Must not cancel classes.**
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
