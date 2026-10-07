# SPEC — Paquetes especiales y gestión del catálogo de suscripciones

**Versión:** 2 (2026-10-07). Reemplaza al borrador v1 e incorpora: validación con Zod, contratos formales, algoritmo de reserva explícito, conservación del diseño actual de la landing y script de compatibilidad.
**Estado:** ✅ Implementado (2026-10-07). Suite 951/951 (128 archivos), `tsc` limpio, `next build` compila. **Pendiente (usuario):** correr los scripts 001 y 002 en la BD (el prerender de `/` falla hasta entonces, a propósito) y la revisión legal de §10.
**Rama:** `feat/special-packages`, creada desde `feat/sculpt-class` (commit `24d937e`, Sculpt). Las reglas usan `CLASS_TYPES`, que ya incluye `sculpt`.
**Task runner:** sección TASK-SP de `TASK_RUNNER.md`.
**Restricción de BD:** datos reales en producción. Solo scripts manuales aditivos e idempotentes en `sql/manual/`, que **ejecuta el usuario**. Nada de `drizzle-kit push`, `DROP`, `TRUNCATE`, `DELETE` de limpieza, `ALTER TYPE`, `RENAME` ni `SET NOT NULL` sobre columnas existentes.
**Zona horaria:** toda regla de horario, vigencia o formato usa `America/Mexico_City` a través de `src/lib/utils/date.ts`.

---

## 0. Alcance y correspondencia con el código real

| El requerimiento dice | En el código existe | Decisión |
|---|---|---|
| Tabla `class_types` | **No existe.** Es el enum de PostgreSQL `class_type`, cuyo origen único es `CLASS_TYPES` en `src/lib/utils/class-type.ts`. | Las reglas guardan `class_type[]`. No se crea tabla de disciplinas. |
| Servicio `bookClass` / `createBooking` | La Server Action `enrollInClassAction` en `src/actions/enrollment.ts`. No hay endpoint REST. | Los «contratos de API» son firmas de Server Actions y modelos de lectura (§4). |
| `/admin/packages` o `/admin/paquetes` | Las rutas de admin están en inglés (`/admin/payments`, `/admin/classes`). | **`/admin/packages`**, con la etiqueta «Paquetes» en el menú. |
| Validación con Zod | `zod@4.4.3` está en `node_modules` solo como dependencia indirecta. | Se agrega como dependencia directa con la misma versión (TASK-SP-SETUP-01). Un único esquema lo usan el formulario y el servidor. |

### 0.1 Decisiones confirmadas

| # | Decisión |
|---|---|
| D1 | Franja horaria inclusiva en ambos extremos sobre la **hora de inicio** de la clase en CDMX. «07:00–11:00» admite una clase que empieza a las 11:00. |
| D2 | **Una sola suscripción activa por usuario.** Al adquirir otro paquete, la activa pasa a `status='expired'` y `active=false`. Hoy el código **no** hace esto (H1). |
| D3 | Vigencia exacta: `aprobación del pago + X días`, igual que hoy con 30. |
| D4 | Lo vendido no cambia: al comprar se copian reglas, precio, vigencia y créditos de invitado. Editar el catálogo solo afecta compras nuevas. |
| D5 | Ajustes manuales de crédito en paquetes especiales: el admin elige el grupo. |
| D6 | Un paquete especial puede incluir créditos de invitado; el admin define cuántos. |
| D7 | La landing y la tienda leen el catálogo de la BD. Se cargan los 5 paquetes actuales con su contenido de hoy. |

### 0.2 Decisiones complementarias (confirmadas 2026-10-07)

| # | Decisión |
|---|---|
| S1 | Las reservas pendientes de una suscripción reemplazada se **conservan** y se puede asistir. Si el cliente las cancela, aunque sea a tiempo, el crédito **no** se reintegra: «Reserva cancelada. El crédito no se reintegra porque esa suscripción fue reemplazada por tu nuevo paquete.» **Excepción:** si el Estudio cancela la clase, `cancelClassAction` lista a esos alumnos y el admin repone la sesión en su suscripción vigente (Términos §5.7). |
| S2 | Todo lo que hoy muestra la landing pasa a la BD. Los paquetes de la landing que **no existan** en la BD (por ejemplo «Lab Pass») se **insertan** con sus datos actuales; los que existen solo reciben los metadatos. |
| S3 | La suscripción anterior vence cuando se **confirma el pago** del paquete nuevo, nunca al comprar. |

**Relación con la regla existente de créditos agotados (H17).** Hoy, una suscripción por créditos que llega a 0 sigue activa («Sin créditos») hasta que se completan todas las clases reservadas con ella, y entonces pasa a `expired` (`check-subscription-expiration.ts`). Esa regla **se conserva** para el caso normal. El cambio de paquete es otro momento: al confirmarse el pago del paquete nuevo, la anterior vence de inmediato aunque tenga clases pendientes. Esas clases se mantienen (S1), y como la anterior ya está inactiva, `checkAndExpireSubscriptions` la omite (`if (!subscription.active) continue`), así que no hay conflicto entre las dos reglas.

---

## 1. Hallazgos del código actual

| # | Hallazgo | Dónde | Consecuencia |
|---|---|---|---|
| H1 | Hoy pueden convivir varias suscripciones activas. `purchaseSubscriptionAction` solo expira las `suspended`; `confirmPaymentAction` activa la nueva sin tocar la anterior. `ActiveSubscriptionWarning` dice «los créditos se **acumularán**», lo cual es falso. | `actions/subscription.ts:51-58`, `actions/admin.ts:205-224`, `components/client/ActiveSubscriptionWarning.tsx` | D2 es una regla **nueva**. Se aplica al confirmar el pago (§6.2) y se corrige el aviso. |
| H2 | `suscriptions` solo tiene `name, sessions, guest, price`. | `db/schema.ts:84` | Columnas nuevas (§3.1). |
| H3 | `user_suscriptions.suscription_id` tiene FK con **`ON DELETE CASCADE`**. | `db/schema.ts:107` | Borrar físicamente un paquete borraría suscripciones de clientes. Solo borrado lógico. |
| H4 | Un único saldo, `days_remaining`, que en realidad son **créditos**. | `db/schema.ts:102` | Saldo por grupo en tabla nueva; `days_remaining` queda como total (INV-1). |
| H5 | `guest = true` significa «Open Lab» (ilimitado + invitado) en 6 lugares. | `enrollment.ts`, `guest.ts`, `admin.ts`, `client/page.tsx`, `guest/eligibility.ts`, expiración | Un especial **nunca** tiene `guest = true`; sus invitados van en `guest_credits`. |
| H6 | Cinco escrituras de `days_remaining ± 1` sin saber qué grupo consumió la reserva. | `enrollment.ts`, `admin.ts:88, 335, 377, 436` | Módulo único de créditos y `class_enrolleds.balance_id` (§5). |
| H7 | Vigencia fija de 30 días en dos lugares. | `admin.ts:221` (SQL), `admin.ts:526` (ms) | Se lee de la copia hecha al comprar. |
| H8 | `payments` no guarda monto; el admin ve el precio actual del catálogo. | `pending-transfers.ts:38`, `admin/payments/page.tsx:31` | `price_snapshot`. |
| H9 | `purchaseSubscriptionAction` no valida que el paquete exista ni que se pueda comprar. | `actions/subscription.ts:27` | Validar `is_active AND deleted_at IS NULL`. |
| H10 | Créditos de invitado: una fila por `(user, user_sub)`; `restoreGuestCredit` borra **todas** las de esa suscripción. | `lib/guest/credits.ts` | Con N créditos se cuentan filas y se restaura solo la del invitado cancelado. |
| H11 | La landing tiene los paquetes escritos a mano y la cuadrícula fija `md:grid-cols-3 lg:grid-cols-5`; la home usa `revalidate = 300`. | `components/sections/Pricing.tsx`, `app/page.tsx:16` | Server Component con datos de la BD, **mismo diseño de tarjeta** y cuadrícula según la cantidad (§9). |
| H12 | «Lab Pass» está en la landing pero no en `seed.ts`. | `Pricing.tsx:5`, `db/seed.ts` | Consulta previa (§3.3); si falta, el script 002 lo inserta (S2). |
| H13 | El dashboard lee solo la suscripción más reciente (`limit(1)`). | `client/page.tsx:41-53` | Con D2 deja de ser un problema. |
| H14 | `cancelClassAction` suma `+1` a `days_remaining` también en Open Lab. | `admin.ts:84-91` | Se corrige al pasar por `restoreEnrollmentCredit`. |
| H15 | No hay pantalla de catálogo; «Suscripciones» administra las de clientes. | `PortalNav.tsx:42` | Entrada «Paquetes» → `/admin/packages`. |
| H16 | `ActionResult` de error solo tiene `error` y `field`. | `lib/types/actions.ts` | Tipos derivados compatibles con `fieldErrors` y `code` (§4.2). |
| H17 | Una suscripción por créditos con 0 créditos sigue activa hasta que se completan sus clases reservadas; mientras tanto, `/client/subscription` muestra «Ya cuentas con una suscripción activa». | `lib/queries/check-subscription-expiration.ts:77-135`, `client/page.tsx:103-110` | Se conserva. El cambio de paquete la vence al confirmar el pago (S1, S3). |

---

## 2. Modelo conceptual

```
suscriptions (catálogo) ──1:N── subscription_rules         "N créditos de [tipos] [en franja]"
       │ (copia al comprar)
user_suscriptions ──1:N── user_subscription_balances       copia de cada regla + saldo
       │                              ▲
class_enrolleds ─── balance_id ───────┘                    qué grupo consumió la reserva
guest_credits ──── guest_enrollment_id                     una fila por invitado consumido
```

- **`kind = 'standard'`:** los 5 paquetes actuales. Se comportan exactamente como hoy.
- **`kind = 'special'`:** tiene de 1 a 6 reglas, `guest = false` obligatorio y `guest_credits` de 0 a 10.
- `kind` es **inmutable** después de crear el paquete.

**Ejemplo «Reset Pass»** ($179, 14 días, 0 invitados): regla A = 1 crédito de `[yoga]`; regla B = 1 crédito de `[mat_pilates, barre]`. `sessions = 2`, calculado en el servidor.

---

## 3. Base de datos

### 3.1 DDL — `sql/manual/2026-10-07_001_special_packages.sql`

```sql
-- Feature: paquetes especiales (SPEC-SPECIAL-PACKAGES §3.1)
-- Aditivo e idempotente. No modifica filas existentes: los defaults reproducen el comportamiento actual.
-- Ejecutar: psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f sql/manual/2026-10-07_001_special_packages.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Catálogo
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'standard';
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS validity_days integer NULL;          -- NULL = 30
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS guest_credits integer NOT NULL DEFAULT 0;
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS short_description varchar(49) NULL;
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS features text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscriptions_kind_chk') THEN
    ALTER TABLE public.suscriptions ADD CONSTRAINT suscriptions_kind_chk
      CHECK (kind IN ('standard', 'special'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscriptions_validity_chk') THEN
    ALTER TABLE public.suscriptions ADD CONSTRAINT suscriptions_validity_chk
      CHECK (validity_days IS NULL OR validity_days BETWEEN 1 AND 365);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscriptions_guest_credits_chk') THEN
    ALTER TABLE public.suscriptions ADD CONSTRAINT suscriptions_guest_credits_chk
      CHECK (guest_credits BETWEEN 0 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscriptions_features_max4_chk') THEN
    ALTER TABLE public.suscriptions ADD CONSTRAINT suscriptions_features_max4_chk
      CHECK (cardinality(features) <= 4);
  END IF;
  -- H5: guest=true significa Open Lab (ilimitado). Un especial nunca lo es.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscriptions_special_not_open_lab_chk') THEN
    ALTER TABLE public.suscriptions ADD CONSTRAINT suscriptions_special_not_open_lab_chk
      CHECK (kind <> 'special' OR guest IS NOT TRUE);
  END IF;
END $$;

-- Reglas del catálogo
CREATE TABLE IF NOT EXISTS public.subscription_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscription_id      uuid NOT NULL REFERENCES public.suscriptions(id) ON DELETE RESTRICT,
  label               varchar(60) NULL,                 -- NULL => se deriva de los tipos
  credits             integer NOT NULL CHECK (credits BETWEEN 1 AND 100),
  allowed_class_types public.class_type[] NOT NULL CHECK (cardinality(allowed_class_types) >= 1),
  window_start        time NULL,                        -- hora local America/Mexico_City
  window_end          time NULL,
  sort_order          smallint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_rules_window_pair_chk  CHECK ((window_start IS NULL) = (window_end IS NULL)),
  CONSTRAINT subscription_rules_window_order_chk CHECK (window_start IS NULL OR window_start < window_end)
);
CREATE INDEX IF NOT EXISTS subscription_rules_suscription_idx ON public.subscription_rules (suscription_id);

-- Saldo por grupo del alumno (copia de la regla al comprar, D4)
CREATE TABLE IF NOT EXISTS public.user_subscription_balances (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_suscription_id uuid NOT NULL REFERENCES public.user_suscriptions(id) ON DELETE CASCADE,
  rule_id             uuid NULL REFERENCES public.subscription_rules(id) ON DELETE SET NULL,
  label               varchar(60) NOT NULL,
  allowed_class_types public.class_type[] NOT NULL,
  window_start        time NULL,
  window_end          time NULL,
  credits_total       integer NOT NULL CHECK (credits_total > 0),
  credits_remaining   integer NOT NULL,
  sort_order          smallint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usb_remaining_range_chk CHECK (credits_remaining BETWEEN 0 AND credits_total),
  CONSTRAINT usb_unique_rule UNIQUE (user_suscription_id, rule_id)
);
CREATE INDEX IF NOT EXISTS usb_user_suscription_idx ON public.user_subscription_balances (user_suscription_id);

-- Copia al comprar (D4). NULL = suscripción anterior a este cambio => comportamiento actual.
ALTER TABLE public.user_suscriptions ADD COLUMN IF NOT EXISTS price_snapshot integer NULL;
ALTER TABLE public.user_suscriptions ADD COLUMN IF NOT EXISTS validity_days_snapshot integer NULL;
ALTER TABLE public.user_suscriptions ADD COLUMN IF NOT EXISTS guest_credits_snapshot integer NULL;

-- Qué grupo consumió cada reserva. NULL = reserva anterior => reembolso a days_remaining como hoy.
ALTER TABLE public.class_enrolleds ADD COLUMN IF NOT EXISTS balance_id uuid NULL
  REFERENCES public.user_subscription_balances(id) ON DELETE SET NULL;

COMMIT;
```

- `ADD COLUMN … NOT NULL DEFAULT <constante>` solo cambia metadatos en PostgreSQL 11+; no reescribe la tabla.
- Las filas existentes cumplen todos los `CHECK` con los defaults.
- La fecha de expiración **no** necesita columna nueva: sigue en `user_suscriptions.expiration_date`, ahora calculada con `validity_days_snapshot` al aprobar el pago (§6.2).
- El largo de **cada** beneficio (≤ 24) lo valida Zod; un `CHECK` por elemento requeriría una función.

### 3.2 Drizzle — `src/db/schema.ts` (espejo exacto del SQL)

```ts
export const PACKAGE_KINDS = ['standard', 'special'] as const;
export type PackageKind = (typeof PACKAGE_KINDS)[number];

export const subscriptions = pgTable('suscriptions', {
  /* id, name, sessions, guest, price (sin cambios) */
  kind: varchar('kind', { length: 16 }).$type<PackageKind>().notNull().default('standard'),
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

export const subscriptionRules = pgTable('subscription_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('suscription_id').notNull().references(() => subscriptions.id, { onDelete: 'restrict' }),
  label: varchar('label', { length: 60 }),
  credits: integer('credits').notNull(),
  allowedClassTypes: classTypeEnum('allowed_class_types').array().notNull(),
  windowStart: time('window_start'),
  windowEnd: time('window_end'),
  sortOrder: smallint('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userSubscriptionBalances = pgTable('user_subscription_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  userSubscriptionId: uuid('user_suscription_id').notNull()
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

// userSubscriptions += priceSnapshot, validityDaysSnapshot, guestCreditsSnapshot (integer, nullable)
// classEnrollments  += balanceId (uuid, nullable, FK set null)
```

Las relaciones se agregan en `src/db/relations.ts`.

### 3.3 Compatibilidad y carga del catálogo — `sql/manual/2026-10-07_002_catalog_compat_backfill.sql`

**Qué recibe cada dato existente (sin tocarlo):**

| Dato existente | Después del script 001 | Comportamiento |
|---|---|---|
| Fila de `suscriptions` | `kind='standard'`, `validity_days NULL`, `is_active=true`, `features='{}'` | Igual que hoy; 30 días de vigencia. |
| Fila de `user_suscriptions` | Los tres snapshots en `NULL` | Camino actual: `days_remaining`, 30 días, precio del catálogo. **No se rellenan snapshots**: el `NULL` es lo que activa el camino de siempre. |
| Fila de `class_enrolleds` | `balance_id NULL` | El reembolso suma `+1` a `days_remaining` como hoy (excepto Open Lab, H14). |
| Open Lab | `guest = true` sin cambios | Ilimitado y su ciclo de invitado actual. |

**Paso previo obligatorio (solo lectura, lo corre el usuario):**

```sql
SELECT id, name, sessions, guest, price FROM public.suscriptions ORDER BY name;
-- Usuarios con más de una suscripción activa hoy (H1). No se corrigen automáticamente.
SELECT user_id, count(*) FROM public.user_suscriptions WHERE active GROUP BY user_id HAVING count(*) > 1;
```

Sirve para confirmar que los `name` coinciden con los del script y que los precios de la BD son los que hoy muestra la landing. A partir de este cambio la landing mostrará el precio de la BD.

**Script (DML idempotente, no destructivo).** Tiene dos partes:
1. **Alta de los paquetes de la landing que falten en la BD (S2):** `INSERT … SELECT … WHERE NOT EXISTS` por `name`, con los valores actuales de la landing. Si el paquete ya existe, no hace nada; nunca modifica `sessions`, `guest` ni `price` de filas existentes.
2. **Metadatos:** cada `UPDATE` se aplica solo si `short_description IS NULL`, así que no pisa ediciones posteriores del admin.

⚠️ El alta compara por `name` exacto. Si en la BD el paquete existe con otro nombre (por ejemplo «LabPass»), se crearía un duplicado; por eso la consulta previa es obligatoria y, si hay diferencias de nombre, se ajusta el script antes de correrlo.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 1) Paquetes de la landing que falten en la BD (S2). Idempotente por nombre.
INSERT INTO public.suscriptions (name, sessions, guest, price)
SELECT v.name, v.sessions, v.guest, v.price
FROM (VALUES
  ('Lab Pass',      1, false,   95),
  ('Lab Entry',     4, false,  360),
  ('Lab Practice',  8, false,  680),
  ('Lab Progress', 12, false,  960),
  ('Open Lab',     30, true,  1850)
) AS v(name, sessions, guest, price)
WHERE NOT EXISTS (SELECT 1 FROM public.suscriptions s WHERE s.name = v.name);

-- 2) Metadatos de la landing (solo si no se han capturado).
UPDATE public.suscriptions SET short_description = 'Todo comienza con un primer paso.',
  features = ARRAY['Mat Pilates','Barre','Yoga'], display_order = 1
  WHERE name = 'Lab Pass' AND short_description IS NULL;
UPDATE public.suscriptions SET short_description = 'Empieza a descubrir de lo que eres capaz.',
  features = ARRAY['Flexibilidad de horario'], display_order = 2
  WHERE name = 'Lab Entry' AND short_description IS NULL;
UPDATE public.suscriptions SET short_description = 'La constancia construye resultados.',
  features = ARRAY['Flexibilidad de horario'], display_order = 3
  WHERE name = 'Lab Practice' AND short_description IS NULL;
UPDATE public.suscriptions SET short_description = 'Cada movimiento te acerca a tu mejor versión.',
  features = ARRAY['-10%OFF Coffee Bar','Flexibilidad de horario'], display_order = 4
  WHERE name = 'Lab Progress' AND short_description IS NULL;
UPDATE public.suscriptions SET short_description = 'Haz del movimiento parte de tu vida.',
  features = ARRAY['-10%OFF Coffee Bar','1 Invitado mensual','1er Kit de regalo'],
  display_order = 5, is_featured = true, guest_credits = 1
  WHERE name = 'Open Lab' AND short_description IS NULL;

COMMIT;

-- Verificación (solo lectura): la primera debe devolver 0 filas y la segunda, los 5 paquetes.
-- SELECT id, name FROM public.suscriptions WHERE is_active AND deleted_at IS NULL AND short_description IS NULL;
-- SELECT name, sessions, guest, price, short_description, features, display_order, is_featured
--   FROM public.suscriptions ORDER BY display_order;
```

- Los valores de `sessions`, `guest` y `price` del alta son los de la landing y `seed.ts` (Open Lab: 30 sesiones, como en el seed; no se usan porque es ilimitado).

- Las descripciones tienen ≤ 45 caracteres y los beneficios ≤ 23.
- En Open Lab, `guest_credits = 1` es **solo informativo** (badge); su lógica sigue usando `guest = true`.
- Si la verificación devuelve filas (paquetes adicionales que no están en la landing), el admin completa su descripción desde `/admin/packages` o los desactiva.

### 3.4 Orden de despliegue

1. Consultas de solo lectura de §3.3.
2. Script 001.
3. Script 002 y su verificación.
4. Deploy del código. Drizzle selecciona todas las columnas, así que el código nuevo con la BD vieja falla.

---

## 4. Contratos

### 4.1 Esquema Zod único — `src/lib/subscription/package-schema.ts`

Lo importan el formulario (validación inmediata) y las Server Actions (validación definitiva). Los mensajes están en español.

```ts
import { z } from 'zod';
import { CLASS_TYPES } from '@/lib/utils/class-type';

export const DESCRIPTION_MAX = 49;   // "menos de 50 caracteres"
export const FEATURES_MAX = 4;
export const FEATURE_MAX_LENGTH = 24;
export const RULES_MAX = 6;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:MM.');

export const timeWindowSchema = z
  .object({ start: hhmm, end: hhmm })
  .refine((w) => w.start < w.end, { message: 'La hora final debe ser posterior a la inicial.', path: ['end'] });

export const packageRuleSchema = z.object({
  label: z.string().trim().max(60).nullable().default(null),
  credits: z.number().int().min(1).max(100),
  allowedClassTypes: z
    .array(z.enum(CLASS_TYPES))
    .min(1, 'Elige al menos una disciplina.')
    .refine((types) => new Set(types).size === types.length, 'No repitas disciplinas.'),
  timeWindow: timeWindowSchema.nullable().default(null),
});

const validitySchema = z
  .object({ amount: z.number().int().min(1), unit: z.enum(['days', 'weeks']) })
  .transform(({ amount, unit }) => (unit === 'weeks' ? amount * 7 : amount))
  .pipe(z.number().int().min(1).max(365, 'La vigencia máxima es de 365 días.'));

const baseFields = {
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(60),
  shortDescription: z
    .string()
    .trim()
    .min(1, 'La descripción es obligatoria.')
    .max(DESCRIPTION_MAX, `La descripción debe tener menos de 50 caracteres.`),
  features: z
    .array(z.string().trim().min(1, 'El beneficio no puede ir vacío.').max(FEATURE_MAX_LENGTH))
    .max(FEATURES_MAX, `Máximo ${FEATURES_MAX} beneficios.`)
    .refine(
      (items) => new Set(items.map((i) => i.toLowerCase())).size === items.length,
      'No repitas beneficios.'
    ),
  price: z.number().int().min(1).max(100_000),
  validityDays: validitySchema,
  displayOrder: z.number().int().min(0).max(999).default(0),
  isFeatured: z.boolean().default(false),
};

export const packageInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('standard'), ...baseFields, sessions: z.number().int().min(1).max(100) }),
  z.object({
    kind: z.literal('special'),
    ...baseFields,
    guestCredits: z.number().int().min(0).max(10).default(0),
    rules: z.array(packageRuleSchema).min(1, 'Agrega al menos una regla.').max(RULES_MAX),
  }),
]);

export type PackageInput = z.input<typeof packageInputSchema>;   // lo que envía el formulario
export type PackageData = z.output<typeof packageInputSchema>;   // lo que persiste el servidor
```

**Reglas que el esquema no puede expresar y aplica el servidor:**
- `special`: `sessions = Σ rules[].credits` y `guest = false`, siempre calculados en el servidor.
- `kind` no cambia al editar: un `kind` distinto del guardado → error `field: 'kind'`.
- Open Lab (`guest = true`): al editar se conservan `guest` y `sessions`; el formulario muestra «Ilimitado».
- `isFeatured = true` desmarca a los demás paquetes en la misma transacción (un solo destacado; §9).

### 4.2 Tipos de resultado — `src/lib/types/actions.ts` (aditivo)

```ts
// ActionResult sigue igual. Tipos derivados compatibles (un FormActionResult es un ActionResult válido):
type FormActionResult<T = undefined> =
  | { success: true; message?: string; data: T }
  | { success: false; error: string; field?: string; fieldErrors?: Record<string, string> };

type BookingRejectionCode =
  | 'NO_ACTIVE_SUBSCRIPTION' | 'SUBSCRIPTION_EXPIRED' | 'NO_CREDITS'
  | 'CLASS_TYPE_NOT_INCLUDED' | 'GROUP_EXHAUSTED' | 'OUTSIDE_TIME_WINDOW'
  | 'CLASS_NOT_AVAILABLE' | 'CLASS_FULL' | 'ALREADY_ENROLLED';

type EnrollmentActionResult =
  | { success: true; message?: string; data?: { balanceId: string | null } }
  | { success: false; error: string; code?: BookingRejectionCode };
```

`fieldErrors` usa como clave la ruta del error en Zod, unida con puntos (por ejemplo `rules.1.timeWindow.end`). `field` es la primera clave, para mantener compatibilidad con los formularios existentes.

### 4.3 Server Actions del catálogo — `src/actions/admin-packages.ts` (nuevo)

Todas exigen `session.role === 'admin'` («No tienes permisos para esta acción.»), validan con `packageInputSchema.safeParse` y, al terminar bien, llaman `revalidatePath('/')`, `('/client/subscription')` y `('/admin/packages')`.

| Acción | Entrada | Éxito | Errores |
|---|---|---|---|
| `createPackageAction(input: unknown)` | `PackageInput` | `{ data: { id } }`, «Paquete creado.» | Validación (`fieldErrors`), permisos. |
| `updatePackageAction(id: string, input: unknown)` | `PackageInput` | `{ data: { id } }`, «Paquete actualizado. Los cambios aplican a compras nuevas.» | No existe o está borrado, cambio de `kind`, validación. |
| `setPackageActiveAction(id: string, active: boolean)` | — | `{ data: { id, isActive } }` | No existe o está borrado. |
| `softDeletePackageAction(id: string)` | — | `{ data: { id } }`, «Paquete eliminado.» | No existe o ya está borrado. |

- **Crear `special`:** inserta el catálogo y sus reglas en una transacción.
- **Editar:** las reglas del paquete se reemplazan completas en una transacción. Es seguro para lo vendido porque `user_subscription_balances.rule_id` es `ON DELETE SET NULL` y cada balance guarda su copia completa. Ese `DELETE` solo toca `subscription_rules`, nunca datos de clientes.
- **Eliminar:** `deleted_at = now()` e `is_active = false`. **No existe** `DELETE` sobre `suscriptions` (H3).

### 4.4 Modelos de lectura — `src/lib/queries/packages.ts` (nuevo)

```ts
type PackageCardView = {               // landing, tienda y vista previa del admin
  id: string;
  displayName: string;                 // "∞ Open Lab" si guest; si no, name
  shortDescription: string;
  sessionsLabel: string;               // "UNA SESIÓN" | "8 SESIONES" | "ACCESO ILIMITADO" | "1 YOGA · 1 MAT PILATES / BARRE"
  priceLabel: string;                  // "1,850" (Intl es-MX, sin decimales)
  features: string[];                  // 0..4
  isFeatured: boolean;
  guestBadge: string | null;           // "+2 Invitados" (especial con guestCredits > 0)
  validityLabel: string;               // "Vigencia: 14 días" | "Vigencia: 2 semanas" | "Vigencia: 30 días"
  ctaLabel: 'ELEGIR' | 'RESERVAR TODO';// "RESERVAR TODO" solo para ilimitado destacado (diseño actual)
};

type AdminPackageView = PackageCardView & {
  kind: PackageKind;
  isActive: boolean;
  price: number;
  validityDays: number;                // 30 si NULL
  guestCredits: number;
  salesCount: number;                  // user_suscriptions que lo compraron
  rules: Array<{ id: string; label: string | null; credits: number;
                 allowedClassTypes: ClassType[]; timeWindow: { start: string; end: string } | null }>;
  updatedAt: string;                   // DD/MM/YYYY, hh:mm A CDMX
};

type CreditBalanceView = {
  balanceId: string;
  label: string;                       // "Mat Pilates / Barre"
  remaining: number;
  total: number;
  timeWindow: string | null;           // "07:00–11:00"
  summary: string;                     // "1 clase de Mat Pilates / Barre"
  exhausted: boolean;
};

type SubscriptionState =               // dashboard del cliente (client/page.tsx)
  | /* estados actuales sin cambios: active | open_lab | credits_exhausted | pending | expired | suspended | none */
  | {
      type: 'special';
      packageName: string;
      expirationDate: string;          // DD/MM/YYYY CDMX
      totalRemaining: number;
      balances: CreditBalanceView[];   // en sort_order
      guestCredits: { available: number; total: number } | null;
    };
```

| Función | Contrato |
|---|---|
| `getPublicPackages(): Promise<PackageCardView[]>` | `is_active AND deleted_at IS NULL ORDER BY display_order, price`. La usan la landing y la tienda. |
| `getAdminPackages(viewer): Promise<AdminPackageView[]>` | Todos los no borrados; exige admin antes de tocar la BD. |
| `getClientSubscriptionView(userId): Promise<SubscriptionState>` | Reemplaza a `getSubscriptionState` del dashboard, agregando el estado `special`. |

---

## 5. Motor de reserva y créditos

### 5.1 Invariantes

- **INV-1:** en una suscripción `special` activa, `days_remaining = Σ credits_remaining`, actualizados en la **misma transacción**. Así siguen funcionando sin cambios todos los lectores de `days_remaining` (estado `credits_exhausted`, expiración con `daysRemaining = 0`, autocompleción de clases y «Créditos: N» en el admin).
- **INV-2:** `sessions` de un `special` = Σ `credits` de sus reglas, calculado por el servidor.
- **INV-3:** solo `src/lib/subscription/credits.ts` escribe `days_remaining`, `credits_remaining` o `balance_id`. Lo vigila un test estructural.
- **INV-4:** como máximo una suscripción `active = true` por usuario a partir de cualquier confirmación de pago (D2).
- **INV-5:** orden de bloqueo fijo en todas las transacciones: `open_class` → `user_suscriptions` → `user_subscription_balances`. Evita interbloqueos entre reservas, cancelaciones y cancelación de clases.

### 5.2 Funciones puras — `src/lib/subscription/rules.ts`

| Función | Contrato |
|---|---|
| `getMexicoCityMinutesOfDay(date)` | En `lib/utils/date.ts`. Minutos desde la medianoche CDMX (0–1439). |
| `isWithinTimeWindow(classDate, window)` | `true` si `window` es `null`. Si no: `start ≤ minutosCDMX(classDate) ≤ end`, **inclusivo en ambos extremos** (D1). |
| `isBalanceUsableForClass(balance, cls)` | `credits_remaining > 0`, `cls.classType ∈ allowed_class_types` y dentro de la franja. |
| `pickBalanceForClass(balances, cls)` | Entre los utilizables, el **más restrictivo**, ordenado por: (1) menos tipos permitidos; (2) con franja antes que sin franja; (3) `sort_order`; (4) `id`. Determinista e independiente del orden de entrada. `null` si ninguno sirve. |
| `explainRejection(balances, cls, packageName)` | Devuelve `{ code, message }` (§5.4). |
| `describeBalance(balance)` | `label ?? tipos unidos con " / "` usando `CLASS_TYPE_OPTION_LABELS`, en singular o plural: «1 clase de Yoga», «2 clases de Mat Pilates / Barre». |

### 5.3 Algoritmo de `enrollInClassAction(classId)`

```
 1. Autorización: sesión con role = 'client'. Si no → «No tienes permisos para esta acción.»
 2. sub ← suscripción activa con pago confirmado (con D2, a lo más una; si hay más por datos
    anteriores, la que vence antes).
      ninguna                      → NO_ACTIVE_SUBSCRIPTION
      expiration_date < now()      → SUBSCRIPTION_EXPIRED
 3. cls ← open_class(classId): debe existir, status = 'scheduled', class_date > now(),
    special_event_id IS NULL                           → si no, CLASS_NOT_AVAILABLE
 4. Validación previa sin bloqueo (solo para responder rápido y con el motivo exacto):
      special    → balances ← balances(sub); si pickBalanceForClass(balances, cls) = null
                   → explainRejection
      Open Lab   → sin validación de créditos
      standard   → days_remaining > 0, si no NO_CREDITS
 5. Cupo (getAvailableCapacity) → CLASS_FULL; duplicado del mismo usuario → ALREADY_ENROLLED.
 6. Transacción:
    a. SELECT … FROM open_class WHERE id = cls.id FOR UPDATE                 (ya existe)
    b. SELECT … FROM user_suscriptions WHERE id = sub.id FOR UPDATE          (nuevo, INV-5)
    c. Re-verificar cupo y duplicado bajo bloqueo                            (ya existe)
    d. consumeClassCredit(tx, sub, cls):
         special  → balances ← relectura bajo bloqueo
                    b ← pickBalanceForClass(balances, cls); null → rollback + explainRejection
                    UPDATE user_subscription_balances SET credits_remaining = credits_remaining - 1
                      WHERE id = b.id AND credits_remaining > 0 RETURNING id   (0 filas → rollback)
                    UPDATE user_suscriptions SET days_remaining = days_remaining - 1
                      WHERE id = sub.id AND days_remaining > 0 RETURNING id    (0 filas → rollback)
                    balanceId ← b.id
         standard → UPDATE … days_remaining - 1 WHERE … > 0 (como hoy); balanceId ← null
         Open Lab → sin escritura; balanceId ← null
    e. Reactivar la fila cancelada o insertar class_enrolleds, ambos con balance_id = balanceId.
 7. revalidatePath de /client, /client/classes, /client/reservations y /client/subscription.
```

**Concurrencia:**
- Dos reservas simultáneas del mismo alumno (por ejemplo Mat y Barre desde dos pestañas) se serializan por el bloqueo del paso 6b. La segunda relee los balances con el grupo B en 0 y se rechaza con `GROUP_EXHAUSTED`.
- Aunque fallara el bloqueo, las guardas `> 0` de 6d y el `CHECK usb_remaining_range_chk` impiden saldos negativos.
- La misma clase dos veces la impide la verificación de duplicado existente y el índice `uk_class_user_enrollment`.

**Traza del Reset Pass** (A = 1×[yoga], B = 1×[mat_pilates, barre]):

| Paso | Clase | Grupo elegido | Saldo A / B | Resultado |
|---|---|---|---|---|
| 1 | Mat Pilates | B | 1 / 0 | Reservada |
| 2 | Barre | — | 1 / 0 | `GROUP_EXHAUSTED` |
| 3 | Mat Pilates (otra) | — | 1 / 0 | `GROUP_EXHAUSTED` |
| 4 | Sculpt | — | 1 / 0 | `CLASS_TYPE_NOT_INCLUDED` |
| 5 | Yoga | A | 0 / 0 | Reservada |
| 6 | Cancelación a tiempo de la clase del paso 1 | B (+1) | 0 / 1 | Crédito devuelto al grupo B |

### 5.4 Mensajes de rechazo (`explainRejection`)

Se evalúan en este orden y gana la **primera** condición que se cumpla:

| # | Código | Condición | Mensaje |
|---|---|---|---|
| 1 | `NO_CREDITS` | Todos los grupos en 0. | «Ya usaste todos los créditos de tu {paquete}.» |
| 2 | `CLASS_TYPE_NOT_INCLUDED` | Ningún grupo (aun agotado) incluye el tipo de la clase. | «Tu {paquete} no incluye clases de {tipo}. Te queda: {resumen}.» |
| 3 | `OUTSIDE_TIME_WINDOW` | Algún grupo con saldo incluye el tipo, pero la hora de inicio queda fuera de su franja. | «Tu crédito de {etiqueta} solo aplica a clases que inician entre {inicio} y {fin}.» |
| 4 | `GROUP_EXHAUSTED` | Los grupos que incluyen el tipo están todos en 0. | «Tu {paquete} ya no incluye clases de {etiqueta del grupo}. Te queda: {resumen}.» |

`{resumen}` lista los grupos con saldo, por ejemplo «1 clase de Yoga».

### 5.5 Escrituras — `src/lib/subscription/credits.ts`

Todas reciben `tx` y corren dentro de la transacción del llamador.

| Función | Qué hace |
|---|---|
| `snapshotPackage(tx, userSubId, pkg)` | Al **comprar**: copia `price`, `validity_days ?? 30` y `guest_credits`. Si es `special`, inserta un balance por regla con `credits_remaining = 0`. |
| `activateBalances(tx, userSubId)` | Al **confirmar el pago**: `credits_remaining = credits_total`. |
| `consumeClassCredit(tx, sub, cls)` | Paso 6d de §5.3. Devuelve `balanceId \| null` o lanza `BookingRejection`. |
| `restoreEnrollmentCredit(tx, enrollment)` | Con `balance_id`: `+1` al grupo (guarda `credits_remaining < credits_total`) y a `days_remaining`. Sin `balance_id`: `+1` a `days_remaining` solo si **no** es Open Lab (H14). Suscripción inactiva: no reintegra y devuelve `'subscription_inactive'` (S1). |
| `adjustCreditManually(tx, userSubId, delta, balanceId?)` | D5. En `special`, `balanceId` es obligatorio y debe pertenecer a esa suscripción. |
| `expireOtherActiveSubscriptions(tx, userId, keepId)` | D2: `active=false`, `status='expired'`, `expiration_date=now()`, `days_remaining=0` en las demás activas, y `credits_remaining=0` en sus grupos. |

### 5.6 Reembolsos y ajustes

- **Automáticos:** `refundEnrollment` (`enrollment.ts`), `cancelClassAction` y `suspendSubscriptionAction` (`admin.ts`) reemplazan su `days_remaining + 1` por `restoreEnrollmentCredit`. Se mantienen la regla de 24 h, la gracia de 10 min, la auditoría de cancelaciones y la guarda `status = 'pending'` contra doble reembolso.
- **Clase cancelada por el Estudio con reservas de suscripciones reemplazadas (S1):** `restoreEnrollmentCredit` devuelve `'subscription_inactive'` para esas reservas; `cancelClassAction` las cancela igual y agrega al resultado `data.manualRestore: Array<{ userId, userName }>`. El admin ve «Repón la sesión de: {nombres}» y usa el ajuste manual de §5.6 sobre la suscripción vigente de cada uno.
- **Manuales (D5):** `refundSessionCreditAction(userId, balanceId?)` y `decrementSubscriptionCreditAction(subscriptionId, balanceId?)` usan `adjustCreditManually`. En `special` sin `balanceId` responden «Selecciona el grupo de créditos.» con `field: 'balanceId'`. El decremento sigue expirando la suscripción al llegar a 0 (sobre Σ).

### 5.7 Créditos de invitado (D6)

| Caso | Créditos disponibles | Reintegro |
|---|---|---|
| Open Lab (`guest = true`) | **Sin cambios:** 1 por suscripción/ciclo. | Igual que hoy. |
| `special` con `guest_credits_snapshot = N > 0` | `N − count(guest_credits WHERE user_subscription_id = X AND credits_used ≥ 1)` | Al cancelar **ese** invitado a tiempo, se borra solo la fila con su `guest_enrollment_id` (H10). |
| `standard` no Open Lab, o especial con N = 0 | 0 (el switch de invitado no aparece). | — |

- `lib/guest/eligibility.ts`: `isUserOpenLabEligible` se generaliza a `getGuestAllowance(userId) → { userSubscriptionId, available, total, kind } | null`.
- `lib/guest/credits.ts`: `consumeGuestCredit` cuenta filas con `FOR UPDATE` sobre la suscripción; `restoreGuestCredit(userId, userSubId, guestEnrollmentId)` borra por `guest_enrollment_id`. En Open Lab el resultado es idéntico porque hay una sola fila.
- **Reserva con invitado en un especial:** el titular consume su crédito de grupo con el algoritmo de §5.3 y el invitado consume 1 crédito de invitado. Ocupa 2 lugares, como hoy.

---

## 6. Compra y confirmación de pago

### 6.1 `purchaseSubscriptionAction`

1. Valida que el paquete exista, `is_active = true` y `deleted_at IS NULL` (H9). Si no: «Este paquete ya no está disponible.»
2. Bloqueo por pago pendiente y expiración de suspendidas: sin cambios.
3. En una transacción: `payments`, `user_suscriptions` y `snapshotPackage` (D4).
4. **No** toca la suscripción activa (S3).

### 6.2 `confirmPaymentAction` y `reactivateSubscriptionAction`

- Confirmación, dentro de la transacción actual:
  - `expiration_date = NOW() + make_interval(days => COALESCE(validity_days_snapshot, 30))`. **Expiración dinámica** calculada desde la aprobación del admin; las suscripciones anteriores siguen con 30.
  - `activateBalances` si es `special`.
  - `expireOtherActiveSubscriptions(userId, nuevaId)` (D2, S3).
- Reactivación: `COALESCE(validity_days_snapshot, 30)` en vez de los 30 días fijos.
- `ActiveSubscriptionWarning`: se reemplaza «se acumularán» por: «Al confirmarse el pago de tu nuevo paquete, tu suscripción actual (*{nombre} · {créditos} · vence {fecha}*) pasará a vencida y los créditos restantes **no** se reembolsan ni se transfieren. Tus reservas ya hechas se mantienen.»

---

## 7. UI/UX — Admin

### 7.1 Menú

`PortalNav.tsx`, rol admin: «Paquetes» → `/admin/packages`, ícono `inventory_2`, entre «Pagos» y «Clases». No aparece para coach ni cliente.

### 7.2 Listado — `/admin/packages`

- Server Component; quien no es admin es redirigido (igual que el resto de `/admin`).
- **Escritorio:** tabla con Orden, Nombre (+ badge «Especial» o «Estándar»), Precio, Vigencia, Ventas, Estado («Activo» o «Inactivo») y Acciones (Editar, Activar/Desactivar, Eliminar).
- **Móvil:** tarjetas apiladas con los mismos datos.
- Botón «Nuevo paquete». Estado vacío: «Aún no hay paquetes.»
- **Eliminar** abre un `Modal` de confirmación: «El paquete dejará de mostrarse en la landing y en la tienda. Las suscripciones ya vendidas no cambian.»
- Activar/Desactivar cambia el estado al momento (`useTransition`) y muestra el mensaje del servidor.

### 7.3 Formulario — `/admin/packages/new` y `/admin/packages/[id]/edit`

Un solo componente `PackageForm` (cliente), con estado controlado como los formularios actuales del admin. No usa `react-hook-form`, que no está instalado. Valida con `packageInputSchema.safeParse` al salir de cada campo y al enviar; el servidor vuelve a validar y sus `fieldErrors` se muestran bajo cada campo.

| Bloque | Comportamiento |
|---|---|
| Tipo | Radio «Estándar» / «Especial», solo al crear. Al editar se muestra como texto. |
| Nombre | `Input`, `maxLength=60`. |
| Descripción corta | `Input`, `maxLength=49`, contador «{n}/49» que se pone rojo al llegar a 49; mensaje «La descripción debe tener menos de 50 caracteres.» |
| Beneficios | Lista editable de 0 a 4 campos (`maxLength=24`, contador). «Agregar beneficio» se **deshabilita** con 4 y muestra «Máximo 4 beneficios». Cada campo tiene botón para quitarlo. |
| Precio | Número entero en MXN. |
| Vigencia | Número + selector «días» / «semanas»; muestra el total («= 14 días»). Texto de ayuda: «Cuenta desde que se confirma el pago.» |
| Sesiones | Solo estándar. En Open Lab se muestra «Ilimitado» sin campo. |
| Reglas (especial) | `PackageRulesBuilder`: de 1 a 6 grupos. Cada grupo tiene créditos, **multiselección de disciplinas** (casillas a partir de `CLASS_TYPES`), interruptor «Limitar horario» que muestra dos `input type="time"`, y etiqueta opcional con texto de ejemplo automático («Mat Pilates / Barre»). Debajo, el total: «Sesiones del paquete: 2». |
| Invitados (especial) | Número 0–10. |
| Destacado y orden | Casilla «Destacar en la landing» (aviso: «Solo un paquete puede estar destacado») y número de orden. |
| Vista previa | `PackageCard` con los mismos datos, en vivo. En escritorio va al lado del formulario y en móvil debajo. |
| Aviso de ventas | Si `salesCount > 0`: «Este paquete ya tiene {n} ventas. Los cambios aplican solo a compras nuevas.» |
| Envío | Botón deshabilitado mientras hay errores o está enviando; después de guardar, redirige al listado con el mensaje del servidor. |

### 7.4 `SubscriptionManagement` (suscripciones de clientes)

En suscripciones `special` muestra el desglose de grupos (`CreditBalanceView`). Los botones +1/−1 abren un selector de grupo y envían `balanceId` (D5).

---

## 8. UI/UX — Cliente

### 8.1 Dashboard (`client/page.tsx`)

Estado `special`: tarjeta «Tus créditos», con el mismo estilo que las tarjetas actuales del dashboard.
- **Encabezado:** «{paquete} · Vence {DD/MM/YYYY}» y «Te quedan {totalRemaining} clases».
- **Una fila por grupo**, en `sort_order`:
  - Con saldo: ícono `fitness_center`, `summary` en texto principal («1 clase de Yoga») y, si tiene franja, «Solo de 07:00 a 11:00» como texto secundario.
  - Agotado: texto atenuado, «0 de {total} · {label}» y la etiqueta «Usada».
- Fila de invitados si `guestCredits` no es `null`: «{available} de {total} pases de invitado».
- Con `totalRemaining = 0` se reutiliza el estado actual `credits_exhausted`.
- Estándar y Open Lab conservan su tarjeta actual sin cambios.

### 8.2 Tienda (`/client/subscription`)

- Usa `getPublicPackages()` y `PackageCard`.
- Las tarjetas de especiales muestran el desglose en `sessionsLabel` y la vigencia.
- El aviso de §6.2 aparece cuando ya hay una suscripción activa.

### 8.3 Lista de clases (`/client/classes`)

- Cada clase reservable indica «Usa: 1 clase de Yoga».
- Las no reservables con el paquete actual muestran el botón deshabilitado y el `message` de `explainRejection`.
- Usa las mismas funciones puras que el servidor.

---

## 9. UI/UX — Landing (`Pricing.tsx`)

**Se conserva el diseño actual de la tarjeta.** Solo cambia la fuente de datos y la cuadrícula.

- **Datos:** `Pricing` pasa a ser un Server Component asíncrono que usa `getPublicPackages()`, así que solo aparecen paquetes con `is_active = true` y sin borrar. Se elimina el arreglo escrito a mano. La home mantiene `revalidate = 300`, y las acciones del admin hacen `revalidatePath('/')`.
- **Tarjeta:** se extrae a `PackageCard` (compartida con la tienda y la vista previa) **con exactamente las mismas clases de Tailwind de hoy**:
  - Variante normal: `bg-surface p-8 rounded-xl …`, ícono `check` y CTA «ELEGIR» con borde.
  - Variante destacada (`isFeatured`, antes `premium`): `bg-warm-wood … scale-105 z-10 my-4`, badge «PREMIUM», ícono `all_inclusive` y CTA claro.
- **Correspondencia de campos:** `tagline` → `shortDescription`; `sessions` → `sessionsLabel`; `price` → `priceLabel`; `features` → `features`.
- **Protección contra desbordes (sin cambiar el estilo):**
  - Descripción con `line-clamp-2` (49 caracteres caben en dos líneas incluso en la columna más angosta).
  - `sessionsLabel` con `line-clamp-2`.
  - Cada beneficio con `truncate` y `title` con el texto completo.
- **Cuadrícula según la cantidad**, con la función pura `getPricingGridClass(count)` y clases literales para que Tailwind las detecte:

| Paquetes | Clases | Comentario |
|---|---|---|
| 1 | `grid-cols-1 max-w-sm mx-auto` | Centrado. |
| 2 | `grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto` | |
| 3 | `grid-cols-1 md:grid-cols-3` | |
| 4 | `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` | |
| 5 | `grid-cols-1 md:grid-cols-3 lg:grid-cols-5` | **Igual que hoy.** |
| 6 | `grid-cols-1 md:grid-cols-3` | Dos filas de 3. |
| 7 o más | `grid-cols-1 md:grid-cols-3 lg:grid-cols-4` | |

- **Sin paquetes:** se conserva el encabezado de la sección (el ancla `#paquetes` del menú sigue funcionando) con el texto «Pronto anunciaremos nuestros paquetes.»
- **Un solo destacado** (§4.1), para no repetir el `scale-105` y mantener la composición actual.

---

## 10. Términos y Condiciones (`/terminos-y-condiciones`) — ✅ aplicado (TASK-SP-LEGAL-01)

`lastUpdated` = «7 de octubre de 2026». Cambios:

| Sección | Cambio |
|---|---|
| §3, paquetes por créditos | La vigencia pasa de «1 mes natural» a «treinta (30) días naturales contados a partir de la confirmación del pago», que es lo que hace el código. El vencimiento por créditos agotados aclara que ocurre cuando «concluyan las clases ya reservadas» (H17). |
| §3, nuevo «Paquetes especiales» | Vigencia propia; disciplinas por grupo con combinaciones excluyentes («una clase de Yoga y una clase de Mat Pilates o Barre»); franja según la hora de inicio en la Ciudad de México; créditos no intercambiables entre grupos; pases de invitado. |
| §3, nuevo «Condiciones aplicables» | Cada compra se rige por las condiciones publicadas al momento de la compra (D4). |
| §3, nuevo «Cambio de paquete» | Una sola suscripción vigente; la anterior vence al confirmarse el pago; créditos remanentes no reembolsables ni transferibles; las reservas se conservan pero, si se cancelan, no se reintegra el crédito; aviso previo en la plataforma (D2, S1, S3). |
| §4 | Aplica el precio vigente al registrar la compra (`price_snapshot`). |
| §5.2 | En especiales, el crédito vuelve al mismo grupo; no aplica a reservas de una suscripción reemplazada. |
| §5.7 | Si el Estudio cancela una clase reservada con una suscripción ya no vigente, repone la sesión en la vigente. |

Tests: `src/app/terminos-y-condiciones/__tests__/page.test.tsx` (11 en verde).

⚠️ Perder créditos ya pagados al comprar otro paquete es sensible ante PROFECO (art. 90 LFPC). **Requiere revisión legal.** El aviso previo y la confirmación expresa en la tienda son obligatorios.

---

## 11. Criterios de aceptación

1. Cada decisión D1–D7 y S1–S3 tiene al menos un test.
2. La traza del Reset Pass de §5.3 se reproduce tal cual en un test de integración de `enrollInClassAction`.
3. Franja 07:00–11:00: 07:00 y 11:00 entran; 06:59 y 11:01 no.
4. Vigencia de 14 días: `expiration_date` = aprobación + 14 días exactos; las suscripciones anteriores siguen con 30.
5. Editar reglas, precio o vigencia después de una venta no cambia los balances ni el `price_snapshot` de esa venta.
6. Al confirmar un pago nuevo, la suscripción activa anterior queda `expired`, con `active=false` y sin créditos.
7. Dos reservas concurrentes que compiten por el mismo grupo: solo una se confirma.
8. Una cancelación a tiempo reintegra al **mismo** grupo, y dos cancelaciones concurrentes reintegran una sola vez.
9. Con N pases de invitado, cancelar un invitado reintegra exactamente 1; Open Lab sigue igual.
10. Zod rechaza una descripción de 50 caracteres, 5 beneficios y un beneficio de 25; la BD rechaza 5 beneficios y un especial con `guest = true`.
11. La landing renderiza 1, 5 y 8 paquetes en 375, 768 y 1280 px sin desbordes, y con 5 paquetes es idéntica a la actual.
12. Ningún archivo fuera de `lib/subscription/credits.ts` escribe `days_remaining`, `credits_remaining` o `balance_id`.
13. Suite completa, `tsc`, `build` y `lint` sin problemas nuevos.

---

## 12. Fuera de alcance

- Restricción por día de la semana (se puede agregar con `weekdays smallint[]`).
- Índice único parcial `user_suscriptions(user_id) WHERE active`: requiere `CREATE INDEX CONCURRENTLY` fuera de transacción y que la consulta de §3.3 devuelva 0 filas.
- Descuentos, cupones y pagos en línea.
- Vencimiento automático por fecha mediante cron (hoy se valida al reservar).


---

## 13. Ejecución — ajustes respecto al diseño

| Tema | Diseño | Implementado | Motivo |
|---|---|---|---|
| Campo de vigencia en Zod | `validityDays: validitySchema` | Entrada `validity: { amount, unit }`; salida `validityDays` (transform al final del esquema). | Una clave de entrada no puede renombrarse con un transform de campo. |
| Códigos de rechazo (§4.2) | En todos los errores de `enrollInClassAction` | Solo en los rechazos nuevos de paquetes especiales (`CLASS_TYPE_NOT_INCLUDED`, `GROUP_EXHAUSTED`, `OUTSIDE_TIME_WINDOW`, `NO_CREDITS`). | Los errores existentes conservan su forma exacta para no romper la UI ni los tests actuales. |
| Mensaje de S1 | «…fue reemplazada por tu nuevo paquete.» | «Reserva cancelada. El crédito no se reintegra porque la suscripción con la que reservaste ya no está vigente.» | Cubre también una suscripción vencida por fecha, que es el mismo caso. |
| INV-3 | Solo `credits.ts` escribe `balance_id` | `credits.ts` decide el grupo (`consumeClassCredit`); `enrollment.ts` y `guest.ts` solo guardan ese id en la reserva. La guarda estructural vigila la aritmética de `days_remaining` y `credits_remaining`. | El `INSERT` de la reserva vive en la acción. |
| `getClientSubscriptionView` | Función en `queries/packages.ts` | El estado `special` se arma en `client/page.tsx` con `getSubscriptionBalances`; vistas puras en `lib/subscription/package-view.ts`. | Reutiliza la función de estado que ya tenía el dashboard. |
| `getGuestAllowance` | Función nueva | Se generalizó `isUserOpenLabEligible` (ahora devuelve `guestCreditsTotal`) y `guestCreditsTotalFor`. | Menos cambios en `guest.ts`; Open Lab conserva exactamente sus consultas. |
| Open Lab y titular con invitado | — | En el flujo con invitado, toda membresía elegible que no sea especial se trata como Open Lab (sin descuento al titular). | Solo Open Lab y los especiales tienen invitados. |

**Archivos principales:** `src/lib/subscription/{rules,credits,package-schema,package-view}.ts`, `src/actions/admin-packages.ts`, `src/lib/queries/packages.ts`, `src/components/admin/packages/*`, `src/components/sections/{PackageCard,Pricing,pricing-grid}.tsx`, `src/components/client/CreditBalances.tsx`, `sql/manual/2026-10-07_00{1,2}_*.sql`.
