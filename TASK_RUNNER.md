# TASK-CLASS-EDIT-RBAC — Edición de Clases Programadas (Cupos y Fecha/Hora)

**Estado:** ✅ Ejecutado
**Prioridad:** Alta (seguridad / RBAC)
**Campos editables:** únicamente `classDate` (fecha/hora, interpretada como `America/Mexico_City`) y `capacity`.
**Roles:** Admin edita cualquier clase. Coach solo las propias. Cancelación sigue siendo Admin-only.

## Archivos Modificados / Creados

| Archivo | Cambio |
|---|---|
| `src/actions/coach.ts` | Nuevo `updateClassScheduleAction` (guards de sesión, rol, ownership, allow-list, capacidad, fecha) |
| `src/components/coach/EditClassModal.tsx` | **Nuevo** modal restringido a fecha/hora + cupos (sin cancelación) |
| `src/components/coach/ClassCalendar.tsx` | Prop `currentUserId`/`occupiedByClass` + botón "Editar" solo en clases propias programadas |
| `src/app/(portal)/coach/classes/page.tsx` | Agregación de cupos ocupados por clase + pasa `currentUserId` |
| `src/components/admin/ClassManagement.tsx` | Botón "Editar" (admin, todas las clases) + modal |
| `src/actions/__tests__/update-class-schedule.test.ts` | **Nuevo** — 9 tests de guardas y validaciones |

## TASK-BACKEND-CLASS-EDIT-GUARD

**Archivo:** `src/actions/coach.ts` — `updateClassScheduleAction(classId, input)`
**Diagnóstico:** No existía endpoint de edición; sólo `createClassAction`/`completeClassAction`/`cancelClassAction`.
Se replicó el patrón de ownership ya usado en `completeClassAction` (`openClass.coachUserId !== session.sub → error`).
**Controles implementados (en orden):**
1. Sesión válida.
2. Rol `coach | admin` (otros roles rechazados).
3. `classId` presente.
4. **Allow-list estricta:** cualquier clave distinta de `classDate`/`capacity` (p. ej. `status`) → rechazo. Esto implementa la prohibición de cancelación para coach aunque se manipulase el payload.
5. Clase existe.
6. **Ownership (403-equivalente):** `session.role !== 'admin' && openClass.coachUserId !== session.sub` → `'No tienes permisos para esta clase.'`.
7. Solo `status === 'scheduled'` es editable.
8. Update con **whitelist de columnas** (`set({ classDate?, capacity? })`), nunca `status`.

## TASK-BACKEND-CAPACITY-CHECK

**Archivo:** `src/actions/coach.ts`
**Diagnóstico:** Existía `getTotalOccupied()` en `src/lib/guest/capacity.ts` (titulares + invitados activos, excluyendo `cancelled`/`late_cancelled`), reutilizado aquí.
**Snippet:**
```ts
const capacity = parseInt(String(input.capacity), 10);
if (isNaN(capacity) || capacity < 1 || capacity > 20) {
  return { success: false, error: 'La capacidad debe ser entre 1 y 20.', field: 'capacity' };
}
const occupied = await getTotalOccupied(classId);
if (capacity < occupied) {
  return {
    success: false,
    error: `La capacidad no puede ser menor a los ${occupied} cupos ocupados actuales.`,
    field: 'capacity',
  };
}
```

**Fecha (zona CDMX):**
```ts
const hasTimezone = classDate.includes('Z') || classDate.includes('+') || /T\d{2}:\d{2}.*[-+]\d/.test(classDate);
const date = hasTimezone ? new Date(classDate) : parseDateTimeLocalAsMexicoCity(classDate);
if (isNaN(date.getTime())) return { success: false, error: 'Fecha y hora no válidas.', field: 'classDate' };
if (date <= new Date()) return { success: false, error: 'La fecha debe ser en el futuro.', field: 'classDate' };
```

## TASK-UI-EDIT-MODAL

**Archivo:** `src/components/coach/EditClassModal.tsx` (nuevo, compartido Coach/Admin)
- Reutiliza `Modal.tsx` e `Input.tsx`.
- Bloque 1: `<input type="datetime-local">` etiquetado "Fecha y hora (hora de Ciudad de México)" (conversión del instante a string local CDMX vía `Intl` con `timeZone: TIMEZONE`).
- Bloque 2: `<input type="number" min={max(1, occupied)} max={20}>` con hint *"Cupos ocupados actuales: X. La capacidad no puede ser menor a X."*.
- Llama a `updateClassScheduleAction` y muestra `result.error`.
- **Sin ninguna acción de cancelación.**
- Se monta con `key={editingClass.id}` para derivar estado inicial sin `useEffect` (evita warning `react-hooks/set-state-in-effect`).

## TASK-UI-COACH (ownership en UI)

**Archivos:** `src/components/coach/ClassCalendar.tsx`, `src/app/(portal)/coach/classes/page.tsx`
- La page ya filtraba clases por `coachUserId === session.sub`; además se pasa `currentUserId` para el guard explícito en UI.
- Botón "Editar" visible solo si `!isPast && status === 'scheduled' && cls.coachUserId === currentUserId`.
- **No se añadió ningún botón/acción de cancelar**; `cancelClassAction` sigue siendo admin-only (en `ClassManagement`).

## TASK-UI-ADMIN

**Archivo:** `src/components/admin/ClassManagement.tsx`
- Botón "Editar" visible en clases `scheduled` (de cualquier coach).
- `occupied` = `enrolledStudents.length` (ya excluye canceladas desde la query de la page).
- Botón "Cancelar" existente intacto (solo admin).

## TASK-TEST-EDIT-GUARD

**Archivo:** `src/actions/__tests__/update-class-schedule.test.ts` — 9 casos:
1. Coach edita su clase → persiste solo `classDate` y `capacity` (sin `status`).
2. Coach edita clase ajena → `'No tienes permisos para esta clase.'`, sin write.
3. Admin edita clase de otro coach → éxito.
4. `capacity < occupied` → error con el conteo y `field: 'capacity'`.
5. `capacity === occupied` → permitido.
6. Payload con `status` → rechazado (anti-cancelación), sin write.
7. Fecha pasada → rechazada.
8. Clase no `scheduled` → rechazada.
9. Sin sesión → rechazado.

## Comando de Verificación

```bash
pnpm lint
pnpm build
pnpm vitest run src/actions/__tests__/update-class-schedule.test.ts
```

**Resultado:** `pnpm build` ✓, 421/421 tests ✓. El único error de `pnpm lint` en los archivos tocados
(`ClassCalendar.tsx:80` `Date.now`) es **preexistente** (existe en `git HEAD`); `EditClassModal.tsx` quedó limpio.

## Criterio de Aceptación

- [x] Solo `capacity` y `classDate` son mutables por este flujo; `status` bloqueado por allow-list.
- [x] Coach recibe rechazo al intentar editar clase ajena (403-equivalente en `ActionResult`).
- [x] Capacidad nueva ≥ cupos ocupados activos.
- [x] Coach no tiene UI de cancelación en ninguna vista; cancelar sigue admin-only.
- [x] Fechas normalizadas a `America/Mexico_City`.

---

# TASK-SCHEDULE-TIMEZONE-FIX

**Estado:** ✅ Ejecutado
**Prioridad:** Alta (bug visible en producción)
**Zona horaria oficial del estudio:** `America/Mexico_City` (CST / UTC-6, sin DST desde Oct-2022)

## Objetivo

Normalizar todo el renderizado de horarios de la landing (`Schedule`) a
`America/Mexico_City`, eliminando el uso de métodos nativos que dependen del
timezone del servidor (`getHours()`, `getMinutes()`, `getDate()`, `setHours()`).
El filtro de exclusión de clases pasadas ya era correcto (compara instantes absolutos).

## Archivos Modificados

| Archivo | Cambio |
|---|---|
| `src/components/sections/schedule-utils.ts` | Helpers de la ventana rolling de 7 días reescritos sobre el calendario CDMX |
| `src/components/sections/Schedule.tsx` | Formateo de hora reemplazado por `Intl.DateTimeFormat` con `TIMEZONE` |
| `src/components/sections/__tests__/schedule-helpers.test.ts` | Tests TZ-independientes + regresión de clase nocturna |

## Diagnóstico Exacto

- `Schedule.tsx` L91-93 (antes): `date.getHours()` / `date.getMinutes()` usaban el
  TZ del servidor (UTC en Vercel). Una clase sab 19:00 CDMX = dom 01:00 UTC se
  mostraba como `"01:00"` y se agrupaba en el día incorrecto. Día 0 se veía bien
  porque `gte(classDate, now)` filtraba el resto.
- `schedule-utils.ts` L13-22 (`getRollingWeekRange`): `setHours(0,0,0,0)` calculaba
  medianoche en TZ del server, no en CDMX.
- `schedule-utils.ts` L28-36 (`getRollingDayIndex`): bucketing por medianoche local
  del servidor → clases nocturnas CDMX caían en el día siguiente.
- `schedule-utils.ts` L42-50 (`getRollingDays`): formatter sin `timeZone` y
  `getDate()` server-local.
- **Sin cambios (correcto):** `Schedule.tsx` L36-37 — `gte(classDate, now)` /
  `lte(classDate, end)` comparan instantes absolutos; la exclusión es TZ-agnóstica.

## Corrección Aplicada

### 1) `schedule-utils.ts`

- Nuevo helper `getMexicoCityDateString(date)` → `YYYY-MM-DD` de calendario CDMX
  vía `Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE })`.
- `getRollingWeekRange`: ancla la medianoche CDMX con offset fijo `-06:00` y calcula
  `end = start + 7 días - 1ms`.
- `getRollingDayIndex`: convierte cada instante a su día calendario CDMX a medianoche
  UTC y resta, de modo que una clase 23:30 CDMX (= 05:30 UTC del día siguiente) mapea
  al día local correcto.
- `getRollingDays`: weekday label con `timeZone: TIMEZONE`; `sub` derivado del string
  de calendario CDMX (evita `getDate()` server-local).
- Importa `TIMEZONE` desde `@/lib/utils/date` (fuente única de verdad).

### 2) `Schedule.tsx`

```ts
const classTimeFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatClassTimeRange(classStart: Date): string {
  const classEnd = new Date(classStart.getTime() + 60 * 60 * 1000);
  return `${classTimeFormatter.format(classStart)} - ${classTimeFormatter.format(classEnd)}`;
}
```

En el `map`: `time: formatClassTimeRange(date)`. Se eliminaron las líneas con
`getHours()`/`getMinutes()`.

## Criterio de Exclusión de Clases Pasadas

No requirió cambios. La query usa `gte(openClasses.classDate, now)`: ambas son fechas
absolutas (timestamp with time zone), por lo que la comparación es TZ-agnóstica.
El desfase solo afectaba el render, no el filtro.

## Tests

`src/components/sections/__tests__/schedule-helpers.test.ts` reescrito con instantes
ISO explícitos (`...-06:00` / `.toISOString()`) para ser independiente del TZ del runner.
Incluye regresión: sábado 23:30 CDMX (= domingo 05:30 UTC) → `dayIndex === 3`.

## Comando de Verificación

```bash
pnpm vitest run src/components/sections/__tests__/schedule-helpers.test.ts
TZ=UTC pnpm vitest run src/components/sections/__tests__/schedule-helpers.test.ts
pnpm lint && pnpm build
```

## Criterio de Aceptación

- [x] Una clase 19:00 CDMX aparece en el tab correcto con `"19:00 - 20:00"`
      independientemente del TZ del servidor.
- [x] Los 7 tabs coinciden con el calendario CDMX.
- [x] Clases nocturnas que cruzan medianoche UTC permanecen en su día local.
- [x] Tests verdes en `TZ=UTC` y `TZ=America/Mexico_City`.

---

# SECURITY-P0-P1 — Parches Críticos/Altos (Auditoría AppSec 2026-09-14)

**Estado:** ✅ Ejecutado
**Prioridad:** Crítica / Alta
**Alcance:** solo hallazgos Críticos y Altos. NO toca diseño, UI ni tipografía.
**Fuera de alcance (lote P2/P3):** rate limiter distribuido, security headers, JWT fail-fast, waitlist, seed.

## TASK-DEPS-NEXT-SECURITY-UPGRADE

- **Archivo:** `package.json`, `pnpm-lock.yaml`
- **Contexto:** dependencia `next` en `16.2.11`.
- **Diagnóstico:** `pnpm audit` reporta 2 advisories CRÍTICOS sobre `next >=16.0.0 <16.3.3`
  (GHSA-p293-qw3h-jr36 RCE no autenticado en Windows; GHSA-2xp9-vwfh-vxw4 RCE en Image
  Optimization con AVIF). El bump resuelve además los altos transitivos (`sharp`, `postcss`, `nanoid`).
- **Comando:**
  ```bash
  pnpm update next@16.3.5
  pnpm audit
  ```
- **Verificación:** `pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`

## TASK-BACKEND-ENROLL-CAPACITY-LOCK

- **Archivos:** `src/actions/enrollment.ts` (`enrollInClassAction`), `src/lib/guest/capacity.ts`
- **Diagnóstico:** la verificación de capacidad y de duplicado corre FUERA de la transacción;
  dos requests concurrentes pasan ambos checks y sobre-reservan (race condition / CWE-362).
  `enrollWithGuestAction` ya usa `SELECT ... FOR UPDATE`; esta acción no.
- **Snippet:** `getAvailableCapacity(classId, conn = db)` / `getTotalOccupied(classId, conn = db)`
  aceptan conexión/transacción; dentro del tx se hace `SELECT id FROM open_class WHERE id = ${classId} FOR UPDATE`,
  se re-verifican capacidad y duplicado bajo el lock y recién entonces se inserta y decrementa.

## TASK-BACKEND-CANCEL-OWNERSHIP-GUARD

- **Archivo:** `src/actions/enrollment.ts`
- **Contexto:** `cancelReservationAction` (L140-241) y `confirmLateCancellationAction` (L243-298).
- **Diagnóstico:** el enrollment se obtiene solo por ID y NUNCA se valida que pertenezca a
  `session.sub` (IDOR / CWE-639). Un cliente puede cancelar reservaciones ajenas.
- **Snippet:** join `classEnrollments` → `userSubscriptions`, `where(eq(classEnrollments.id, enrollmentId))`,
  guard `enrollmentRow.userSubscription.userId !== session.sub → 'No tienes permisos para esta acción.'`.

## TASK-BACKEND-GUEST-CANCEL-OWNERSHIP-GUARD

- **Archivo:** `src/actions/guest.ts`
- **Contexto:** `cancelReservationWithGuestAction` (L723-819).
- **Diagnóstico:** el enrollment titular se obtiene solo por ID; el check `registeredById === session.sub`
  aplica solo al invitado. IDOR sobre el titular. **Hallazgo adicional durante la ejecución:**
  `confirmLateCancelBothAction` (L837-904) tenía el mismo IDOR; también fue parchado.
- **Snippet:** mismo join + guard de ownership antes de cancelar titular + invitado.

## TASK-DEPS-CHANGE — `next.config.ts`

- **Archivo:** `next.config.ts`
- **Diagnóstico:** el upgrade a `next@16.3.5` eliminó la opción experimental
  `experimental.viewTransition` (las view transitions ya son estables sin configuración).
  `tsc` fallaba con `TS2353`. Se retiró el bloque `experimental`.
- **Verificación:** `pnpm exec tsc --noEmit` (0 errores) + `pnpm build` (exitoso).

## TASK-TEST-CANCELLATION-OWNERSHIP

- **Archivo:** `src/actions/__tests__/cancellation.test.ts`
- **Diagnóstico:** los mocks usan `db.query.classEnrollments.findFirst`; tras el parche las acciones
  usan `db.select(...).from(...).innerJoin(...).where(...)`. Hay que adaptar los describes existentes
  y agregar casos de rechazo por ownership.

## TASK-VERIFY-FULL-SUITE

```bash
pnpm audit
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm lint
pnpm build
```

### Criterio de Aceptación
- [x] 0 vulnerabilidades críticas en `pnpm audit` (`--prod`: sin vulnerabilidades; restantes son dev-only transitivas).
- [x] Cancelación de enrollment ajeno rechazada (tests nuevos en `cancellation.test.ts`).
- [x] Sin overbooking bajo enrollments concurrentes (`SELECT ... FOR UPDATE` + re-verificación en tx).
- [x] Suite de tests en verde (423/423) y `pnpm build` exitoso.

### Resultado de la verificación
- `pnpm audit --prod` → **No known vulnerabilities found** (de 2 críticas + 6 altas a 0 en producción).
- `next` 16.2.11 → **16.3.5**.
- `pnpm exec tsc --noEmit` → 0 errores.
- `pnpm exec vitest run` → **51 archivos / 423 tests pasando**.
- `pnpm lint` (archivos tocados) → 0 errores; 1 warning preexistente en `guest.ts:15` (`consumeGuestCredit`).
- `pnpm build` → **Compiled successfully**.

---

# TASK_RUNNER — Feature: Eventos Especiales

**Estado:** ✅ Ejecutado
**Migración:** `drizzle/0004_keen_lake.sql` — aplicada directamente en Supabase (la DB no usa
tracking de drizzle; se creó con `db:push`). SQL 100% aditivo, sin cambios a datos existentes.
**Verificación:** `tsc` 0 errores · `pnpm test` 444/444 · `pnpm build` exitoso · eslint limpio en
todos los archivos del feature.
**Stack:** Next.js 16 (App Router) + Drizzle ORM + Postgres + Tailwind 4. Sin i18n (español hardcodeado).
**Convenciones:** server actions en `src/actions/`, `Modal` en `src/components/ui/Modal.tsx`,
timezone `America/Mexico_City` vía `src/lib/utils/date.ts`, precios `integer` MXN.

**Decisiones confirmadas:**
- Descuentos = **monto fijo MXN** (`discount_amount`) por tipo de membresía; sin fila → precio base.
- **Solo 1 evento activo a la vez** (la landing muestra ese único evento).
- Reembolsos con **estados en panel** (`refund_pending` → `refunded`).
- CTA de landing **"Reservar lugar" → `/login`**.

**Orden de ejecución estricto:**
`DB-01 → DB-02 → BE-01 → BE-02 → BE-03 → BE-04 → ISO-01 → UI-01 → UI-02 → UI-03 → UI-04 → TEST-01 → VERIFY-01`.

---

## TASK-DB-01 — Schema Drizzle: tablas de eventos

- **Archivo:** `src/db/schema.ts` (modificar), `src/db/relations.ts` (modificar)
- **Contexto:** schema.ts imports L1-10, tabla `openClasses` L111-124, final del archivo.
- **Instrucción:**
  1. Agregar `text` al import de `drizzle-orm/pg-core`.
  2. Agregar enums `specialEventStatusEnum` (`active`, `cancelled`, `completed`) y
     `eventRegistrationStatusEnum` (`pending`, `confirmed`, `refund_pending`, `refunded`), y las tablas
     `specialEvents`, `specialEventDiscounts`, `specialEventRegistrations` (DDL de referencia
     más abajo, en esta misma tarea).
  3. En `openClasses` agregar la columna nullable `specialEventId` con FK a `specialEvents`
     (`onDelete`/`onUpdate` cascade). `NULL` = clase normal del catálogo.
  4. En relations.ts: agregar `specialEventsRelations`, `specialEventDiscountsRelations`,
     `specialEventRegistrationsRelations`; extender `openClassesRelations` con
     `specialEvent: one(specialEvents, { fields: [openClasses.specialEventId], references: [specialEvents.id] })`.
- **DDL de referencia:**
  ```ts
  export const specialEventStatusEnum = pgEnum('special_event_status', [
    'active', 'cancelled', 'completed',
  ]);
  export const eventRegistrationStatusEnum = pgEnum('event_registration_status', [
    'pending', 'confirmed', 'refund_pending', 'refunded',
  ]);

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
    createdById: uuid('created_by_id').notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  });

  // En openClasses:
  specialEventId: uuid('special_event_id')
    .references(() => specialEvents.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

  export const specialEventDiscounts = pgTable(
    'special_event_discounts',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      specialEventId: uuid('special_event_id').notNull()
        .references(() => specialEvents.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
      subscriptionId: uuid('subscription_id').notNull()
        .references(() => subscriptions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
      discountAmount: integer('discount_amount').notNull(),
    },
    (t) => ({
      uniqueDiscount: uniqueIndex('uk_event_discount_subscription')
        .on(t.specialEventId, t.subscriptionId),
    })
  );

  export const specialEventRegistrations = pgTable(
    'special_event_registrations',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      specialEventId: uuid('special_event_id').notNull()
        .references(() => specialEvents.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
      userId: uuid('user_id').notNull()
        .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
      openClassId: uuid('open_class_id').notNull()
        .references(() => openClasses.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
      paymentId: uuid('payment_id').notNull().unique()
        .references(() => payments.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
      amountPaid: integer('amount_paid').notNull(),
      status: eventRegistrationStatusEnum('status').notNull().default('pending'),
      createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    },
    (t) => ({
      uniquePurchase: uniqueIndex('uk_event_user_registration')
        .on(t.specialEventId, t.userId),
    })
  );
  ```
- **Prevención de regresiones:** NO modificar ninguna columna existente; `specialEventId` nullable sin default.
- **Verificación:** `pnpm lint` y `pnpm build` (typecheck de schema).

## TASK-DB-02 — Migración

- **Archivo:** `drizzle/0004_*.sql` (generado)
- **Instrucción:** ejecutar `pnpm db:generate`. Inspeccionar el SQL: debe contener CREATE TABLE
  `special_events` / `special_event_discounts` / `special_event_registrations`,
  `ALTER TABLE open_class ADD COLUMN special_event_id`, 2 `CREATE TYPE ... AS ENUM`,
  2 `CREATE UNIQUE INDEX`. **NO ejecutar `db:migrate` ni `db:push`** (lo hará el usuario).
- **Verificación:** existe el SQL generado con los 7 objetos anteriores.

## TASK-BE-01 — Librería de capacidad y precio de eventos

- **Archivo:** `src/lib/events/capacity.ts` (crear)
- **Contexto:** replicar el patrón de `src/lib/guest/capacity.ts:17-62` (firma con `conn` opcional para correr dentro de tx).
- **Instrucción:**
  - `getEventClassOccupied(openClassId, conn?)`: COUNT de `specialEventRegistrations`
    (`openClassId`, `status='confirmed'`) + COUNT de `guestEnrollments` activos (misma exclusión
    `cancelled`/`late_cancelled` que capacity.ts).
  - `getEventClassAvailable(openClassId, conn?)`: `capacity - occupied` (leer `capacity` de `open_class`).
  - `computeEventPrice(event, userId)`: buscar la `userSubscription` activa del usuario
    (`active=true, status='active'`, pago confirmado — mismo criterio que
    `src/lib/guest/eligibility.ts:20-69`), buscar descuento por su `subscriptionId`; retornar
    `max(0, price - discountAmount)`. Sin suscripción → precio base.
- **Prevención:** NO tocar `src/lib/guest/capacity.ts`. Los `pending` NO restan cupo.
- **Verificación:** `pnpm vitest run src/lib` + `pnpm build`.

## TASK-BE-02 — Email de cancelación de evento

- **Archivo:** `src/lib/email/service.ts` (modificar)
- **Contexto:** patrón de `sendClassCancellationEmail` (L76-95) y `sendEmail` con reintentos (L21-56).
- **Instrucción:** `sendSpecialEventCancellationEmail(recipients: string[], event: { title, startDate })`:
  asunto "Evento cancelado: {title}"; cuerpo informa cancelación por causas externas al estudio y
  que el reembolso se procesará de forma manual. Usar `formatFullDateTime` de `@/lib/utils/date`.
- **Verificación:** `pnpm build`.

## TASK-BE-03 — Server actions admin de eventos

- **Archivo:** `src/actions/admin-events.ts` (crear)
- **Contexto:** validación de sesión/rol como `admin.ts` (inicio de `confirmPaymentAction` L161-190);
  creación de clase como `adminCreateClassAction` (admin.ts:476-554); lock como
  `enrollment.ts:117-160`; borrado de pago como `rejectPaymentAction` (admin.ts:557-608).
- **Instrucción — implementar:**
  1. `createSpecialEventAction(formData)`: rol admin; validar `title` ≤120, `description`,
     `shortDescription` ≤150, `price` int >0, `startDate < endDate` (America/Mexico_City),
     descuentos opcionales `[{subscriptionId, discountAmount>=0}]` (rechazar
     `discountAmount > price`). **REGLA:** rechazar si ya existe otro evento con `status='active'`
     (solo 1 activo). Insertar evento + descuentos en una tx. `revalidatePath('/')`.
  2. `addEventClassAction(eventId, formData)`: mismas validaciones que `adminCreateClassAction`
     (fecha futura CDMX, capacity 1-20, tipo válido, `customName` si personalizada, coach con rol
     coach/admin) + el evento debe estar `active`. Insertar `open_class` con `specialEventId=eventId`.
  3. `toggleEventLandingAction(eventId, show: boolean)`: update `showOnLanding`; `revalidatePath('/')`.
  4. `completeSpecialEventAction(eventId)`: `status='completed'`; `revalidatePath('/')`.
  5. `cancelSpecialEventAction(eventId)`: tx → evento `status='cancelled'`; todas sus `open_class`
     `status='cancelled'`; registrations `confirmed` → `refund_pending`; las `pending` se mantienen
     (admin decide rechazarlas). Tras commit: recolectar emails de usuarios con registrations
     `confirmed`/`pending` y fire-and-forget `sendSpecialEventCancellationEmail`. `revalidatePath('/')`.
  6. `confirmEventPaymentAction(registrationId)`: tx con
     `SELECT id FROM open_class WHERE id = ${reg.openClassId} FOR UPDATE`;
     check `getEventClassAvailable(classId, tx) >= 1` → si 0, rollback con error
     `'La clase seleccionada está llena. Rechaza el pago.'`; update `payments` `confirmed=true` +
     `dateConfirmed`; update registration `status='confirmed'`. Revalidar ruta admin del evento.
  7. `rejectEventPaymentAction(registrationId)`: borrar `registration` y luego `payment`
     (el `paymentId` unique FK cascadea); enviar `sendPaymentRejectedEmail` existente. Esto libera
     la compra única para reintento.
  8. `markRefundedAction(registrationId)`: solo si `status='refund_pending'` → `'refunded'`.
- **Prevención:** todas las actions validan `session.role === 'admin'`; NUNCA insertar en
  `classEnrollments`; NO modificar `admin.ts` existente.
- **Verificación:** `pnpm build` + tests de TASK-TEST-01.

## TASK-BE-04 — Server action de compra (cliente)

- **Archivo:** `src/actions/event.ts` (crear)
- **Contexto:** patrón de `purchaseSubscriptionAction` (`subscription.ts:9-96`).
- **Instrucción — `purchaseSpecialEventAction(eventId, classId, paymentType: 'transfer'|'cash', acceptedNoRefund: boolean)`:**
  1. Sesión rol `client`. `acceptedNoRefund === true` obligatorio (disclaimer legal).
  2. Evento existe y `status='active'`.
  3. No existe registration previa del usuario para ese evento (check en aplicación; el unique index
     `uk_event_user_registration` es la red de seguridad — capturar error 23505 y responder
     `'Ya adquiriste este evento.'`).
  4. Clase: pertenece al evento (`specialEventId=eventId`), `status='scheduled'`,
     `getEventClassAvailable(classId) >= 1` (informativo; el cupo real se valida al aprobar).
  5. `amountPaid = await computeEventPrice(event, session.sub)`.
  6. Tx: insert `payments {paymentType, confirmed:false}` → insert `registration`
     `{eventId, userId, openClassId: classId, paymentId, amountPaid, status:'pending'}`.
  7. **NO** guests, **NO** `classEnrollments`, **NO** descuento de `days_remaining`.
- **Prevención:** el componente NO debe exponer toggle de invitados (las clases de evento nunca
  pasan por `EnrollWithGuestSection`).
- **Verificación:** `pnpm build` + tests de TASK-TEST-01.

## TASK-ISO-01 — Aislamiento: excluir clases de evento de listados normales

- **Archivos (agregar `isNull(openClasses.specialEventId)` al `where` de cada query):**
  1. `src/app/(portal)/client/classes/page.tsx:31-55` — catálogo cliente.
  2. `src/components/sections/Schedule.tsx:32-50` — landing schedule.
  3. `src/app/(portal)/admin/classes/page.tsx:12-25` — gestión de clases admin.
  4. `src/app/(portal)/admin/page.tsx:19-26` — contador dashboard admin.
  5. `src/lib/queries/coach.ts:8-23` — agenda del coach.
- **NO tocar:** `src/lib/queries/class-auto-completion.ts` (las clases de evento SÍ deben
  auto-completarse) ni `getNextClass` en `client/page.tsx` (las registrations no generan
  `classEnrollments`, no hay fuga).
- **Verificación:** `pnpm build`; grep sobre queries de `openClasses` con `specialEventId` para
  confirmar que las restantes son intencionales (solo las del feature).

## TASK-UI-01 — Admin: lista y creación de eventos

- **Archivos:** `src/app/(portal)/admin/events/page.tsx` (crear),
  `src/components/admin/SpecialEventList.tsx` (crear),
  `src/components/admin/CreateSpecialEventForm.tsx` (crear),
  `src/components/layout/PortalNav.tsx:29-43` (modificar)
- **Contexto:** patrón de form+`Modal` de `AdminCreateClassForm.tsx` (Modal L205-241).
- **Instrucción:** agregar item nav admin
  `{ label: 'Eventos', href: '/admin/events', icon: 'event' }`. La página server lista eventos
  (más reciente primero) con badge de status. Botón "Crear Evento Especial" → form con: `title`,
  `description` (textarea), `shortDescription` (contador 150 chars), `price`, `startDate`,
  `endDate`, matriz de descuentos (una fila por cada `subscriptions`: input MXN opcional),
  checkbox `showOnLanding` (default true). Submit → Modal "¿Publicar evento?" →
  `createSpecialEventAction`. Si ya hay evento activo, mostrar alerta y deshabilitar el botón.
- **Verificación:** `pnpm lint` + `pnpm build`.

## TASK-UI-02 — Admin: detalle del evento (clases, inscritos, pagos, invitados, cancelar)

- **Archivos:** `src/app/(portal)/admin/events/[eventId]/page.tsx` (crear),
  `src/components/admin/EventClassPanel.tsx` (crear),
  `src/components/admin/EventRegistrationTable.tsx` (crear)
- **Contexto:** agregar clase = reutilizar campos/validaciones de `AdminCreateClassForm` pero llamando
  `addEventClassAction`; invitados = **REUSAR** `AdminAddGuestForm`/`AdminRemoveGuestButton`
  (`src/components/admin/`) apuntando al `openClassId` de la clase del evento (la action
  `adminAddGuestAction` ya funciona tal cual); aprobación = patrón `PaymentManagement.tsx` (L315-359).
- **Instrucción:** por cada clase del evento: header con fecha/tipo/coach + `"N/M lugares"`
  (`getEventClassOccupied`) + botón "Agregar Clase" (si evento activo) + tabla de inscritos
  (usuario, monto, tipo de pago, status) con botones Confirmar (`confirmEventPaymentAction`,
  mostrar error si clase llena) y Rechazar (Modal danger → `rejectEventPaymentAction`) + sección de
  invitados admin. Si `status='refund_pending'`, botón "Marcar reembolsado". Header del evento:
  toggle `showOnLanding`, botón "Finalizar evento" (Modal → `completeSpecialEventAction`),
  botón "Cancelar evento" (**Modal `variant='danger'` OBLIGATORIO** con texto que advierte que se
  notificará a inscritos y se procesarán reembolsos → `cancelSpecialEventAction`).
- **Verificación:** `pnpm lint` + `pnpm build`.

## TASK-UI-03 — Cliente: sección Eventos, banner y compra

- **Archivos:** `src/app/(portal)/client/events/page.tsx` (crear),
  `src/components/client/SpecialEventPurchase.tsx` (crear),
  `src/components/client/EventReservationCard.tsx` (crear),
  `src/components/layout/PortalNav.tsx:21-28` (modificar),
  `src/app/(portal)/client/page.tsx` (modificar — banner)
- **Contexto:** card de reserva = copiar estilo del card "Próxima Clase"
  (`client/page.tsx:171-196`: `<Card className="border-primary/30 bg-primary/5">` + `Badge`);
  modal de pago y datos bancarios = patrón de `SubscriptionCard.tsx` (Modal L186-209, bank info
  L95-111; la debit card activa se consulta en el server component como
  `subscription/page.tsx:21-26`).
- **Instrucción:**
  - Nav cliente: agregar `{ label: 'Eventos', href: '/client/events', icon: 'event' }`.
  - Dashboard: si hay evento activo y el usuario NO tiene registration → banner/alerta
    "Evento Especial Disponible" con link a `/client/events`.
  - `/client/events` (server): sin evento activo → empty state. Con evento:
    - **SIN** registration: detalles, precio con descuento aplicado (`computeEventPrice`; mostrar
      precio base tachado si hay descuento), selector de clase (radio) mostrando
      "N lugares disponibles" por clase (deshabilitar las de 0), botones Transferencia/Efectivo,
      checkbox OBLIGATORIO "Entiendo que esta compra es definitiva y no aplica cancelación ni
      devolución" (deshabilitar submit hasta aceptarlo), Modal de confirmación →
      `purchaseSpecialEventAction`. Si transferencia: mostrar datos de `debit_card` activa tras éxito.
    - **CON** registration: descripción del evento + `EventReservationCard` (estilo Próxima Clase)
      con clase elegida, fecha, monto y `Badge` de estado: "Pago pendiente de confirmación" /
      "Reserva confirmada" / "Reembolso en proceso" / "Reembolsado". Sin opción de recomprar ni cancelar.
- **Verificación:** `pnpm lint` + `pnpm build`.

## TASK-UI-04 — Landing: sección de Evento Especial

- **Archivos:** `src/components/sections/SpecialEvent.tsx` (crear), `src/app/page.tsx` (modificar)
- **Contexto:** patrón de `Schedule.tsx` (server component async con query Drizzle directa, único
  precedente de sección dinámica en `sections/`). Orden actual de secciones en `page.tsx` L44-56:
  Hero → Philosophy → MatPilatesInfo → Barre → HathaYoga → Pricing → MembershipBenefits →
  Schedule → Location.

- **Ubicación:** insertar `<SpecialEvent />` inmediatamente **DESPUÉS de `<Pricing />`** y
  **ANTES de `<MembershipBenefits />`**.

- **Comportamiento condicional estricto:**
  - Query: `findFirst special_events WHERE status='active' AND showOnLanding=true ORDER BY startDate ASC`.
  - Si NO hay evento activo → `return null` desde el server component. La sección **no debe existir
    en el DOM**: sin wrapper, sin `<section>` vacío, sin márgenes ni paddings huérfanos. El flujo
    visual debe ser como si el espacio no existiera (Pricing seguido directo de MembershipBenefits).
  - La ISR existente (`revalidate=300` en `page.tsx` L15) + los `revalidatePath('/')` de las actions
    de TASK-BE-03 garantizan que la sección aparezca/desaparezca sola.

- **Estructura y contenido visual (respetando el diseño de la landing):**
  1. Tag / Badge: **"Evento Especial"** (usar `Badge` de `@/components/ui/Badge` o el estilo de
     etiqueta que ya usen las secciones de la landing).
  2. **Nombre** del evento (`title`).
  3. **Descripción** del evento (`shortDescription`, máx. 150 chars — la variante de landing).
  4. **Fecha** del evento (`startDate`–`endDate`, formato `America/Mexico_City` vía
     `src/lib/utils/date.ts`; si start y end son el mismo día, mostrar fecha única).
  5. **Clases y cupos disponibles:**
     - Query de `open_class WHERE specialEventId = evento.id AND status='scheduled' ORDER BY classDate ASC`,
       con coach (`join users`).
     - Por cada clase: nombre (`getClassDisplayName` de `@/lib/utils/class-type`, o `customName` si
       personalizada), horario (formato **12h A.M./P.M.**, igual que `Schedule.tsx` — prohibido
       `getHours()` y formato 24h).
     - Indicador de cupos por clase:
       `disponibles = capacity - (registrations status='confirmed' + guestEnrollments activos)`,
       reutilizando la lógica de TASK-BE-01 (`src/lib/events/capacity.ts`). Mostrar
       "N lugares disponibles"; si `disponibles = 0` → tag **"SOLD OUT"** (mismo tratamiento visual
       que `Schedule`).
  6. CTA **"Reservar lugar" → `/login`** (el middleware redirige al usuario autenticado a su portal;
     el no autenticado inicia sesión y desde ahí accede a `/client/events`).

- **Prevención de regresiones:**
  - NO modificar `Pricing.tsx` ni `MembershipBenefits.tsx`; solo insertar el componente en `page.tsx`.
  - La sección es server component puro (sin `'use client'`); si se necesita interactividad mínima,
    extraer un client component hijo como hace `Schedule`/`ScheduleClient`.
  - Verificar con evento inactivo que no queda NINGÚN nodo en el DOM (inspeccionar HTML).

- **Verificación:** `pnpm build`; revisión visual con `pnpm dev` en ambos estados (con y sin evento activo).

## TASK-TEST-01 — Tests unitarios

- **Archivos:** `src/lib/events/__tests__/capacity.test.ts` (crear),
  `src/actions/__tests__/admin-events.test.ts` (crear),
  `src/actions/__tests__/event-purchase.test.ts` (crear)
- **Contexto:** seguir el setup de `src/actions/__tests__/enrollment.test.ts` y
  `src/lib/guest/__tests__/capacity.test.ts` (mocks de db).
- **Instrucción — casos mínimos:**
  1. `getEventClassAvailable`: confirmed + guests restan; pending NO resta.
  2. `computeEventPrice`: con descuento / sin suscripción / descuento > price → 0.
  3. Purchase: rechaza sin `acceptedNoRefund`; rechaza doble compra (23505); rechaza clase llena;
     rechaza clase de otro evento; crea `payment confirmed=false` + registration `pending`.
  4. `confirmEventPaymentAction`: confirma y descuenta cupo; falla con clase llena (rollback).
  5. `cancelSpecialEventAction`: estados correctos + `confirmed` → `refund_pending`.
  6. `createSpecialEventAction`: rechaza si ya hay evento activo.
- **Verificación:** `pnpm vitest run`.

## TASK-VERIFY-01 — Verificación final

- **Archivo:** `package.json` (agregar `"test": "vitest run"` a scripts)
- **Comandos (en orden, todos deben pasar):**
  1. `pnpm lint`
  2. `pnpm build`
  3. `pnpm test`
  4. Checklist manual de regresión:
     - `/client/classes` NO lista clases de evento; landing `Schedule` tampoco.
     - `/admin/classes` no mezcla clases de evento.
     - Un usuario Open Lab no ve toggle de invitados en el flujo de evento.
     - Comprar → cupo NO baja; admin confirma → cupo baja; admin rechaza → usuario puede recomprar.
     - Cancelar evento → email enviado y registrations en `refund_pending`.

---

## Principios Críticos de Prevención de Regresiones

1. **Aislamiento:** las clases de evento solo se excluyen con `isNull(specialEventId)` en 5 queries
   (TASK-ISO-01). El auto-completado y `getNextClass` quedan intactos por diseño.
2. **Invitados Open Lab:** imposible por estructura — el flujo de compra de evento no usa
   `EnrollWithGuestSection` ni `enrollWithGuestAction`. El admin reutiliza `adminAddGuestAction`
   sin cambios.
3. **Cupo:** jamás se descuenta en la compra; solo en `confirmEventPaymentAction` con `FOR UPDATE`
   (mismo patrón anti-overbooking ya probado en `enrollment.ts`).
4. **Compra única:** doble candado — check en aplicación + unique index `(special_event_id, user_id)`;
   el rechazo borra la fila para permitir reintento (consistente con el flujo actual de pagos).

---

## TASK-ADMIN-EVENTS-HISTORY-PAGINATION — Historial de Eventos Especiales (Admin)

**Estado:** ✅ Ejecutado
**Patrón a replicar:** `src/components/admin/ClassManagement.tsx` (chips de filtro + paginación
client-side 10/página + filas expandibles) y `src/components/ui/Pagination.tsx`.
**Decisiones confirmadas:**
- El listado de eventos se unifica en un componente con tabs (Todos/Activos/Completados/Cancelados)
  en `/admin/events`; se elimina `SpecialEventList.tsx`.
- Detalle de asistentes por **expansión inline** (patrón ClassManagement), sin modal/drawer.
- **NO se crea endpoint API**: se sigue el estándar server-component + paginación client-side.
  La capa de datos vive en una query server (`src/lib/queries/events.ts`).

### Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/queries/events.ts` | **Nuevo** — query server `getSpecialEventsHistory()` |
| `src/components/admin/SpecialEventHistory.tsx` | **Nuevo** — client component del historial |
| `src/app/(portal)/admin/events/page.tsx` | Modificar — consumir la query y renderizar el historial |
| `src/components/admin/SpecialEventList.tsx` | Eliminar (reemplazado por el componente unificado) |
| `src/lib/queries/__tests__/events-history.test.ts` | **Nuevo** — tests de orden y métricas |

### Instrucción técnica

**1. `src/lib/queries/events.ts` (nuevo):**
- `getSpecialEventsHistory()`: eventos ordenados por `startDate DESC` con:
  - Por evento: `id, title, startDate, endDate, status, price, classCount`,
    `confirmedCount` (registrations `status='confirmed'`),
    `revenue` = SUM(`amountPaid`) de registrations confirmadas.
  - Por clase del evento: `id, classType, customName, classDate, coachName, capacity` +
    `registrations[]` (`userName, userEmail, createdAt, paymentType, status, amountPaid`) +
    `guests[]` (`guestName, origin, status, registeredByName`).
- Queries Drizzle directas (patrón de `src/lib/queries/coach.ts`), agrupando en memoria con Maps
  como hace `admin/classes/page.tsx`.

**2. `src/components/admin/SpecialEventHistory.tsx` (nuevo, client):**
- Props: `events: SpecialEventHistoryItem[]` (tipado exportado).
- Chips de filtro replicando ClassManagement: `Todos / Activos / Completados / Cancelados`
  con contadores globales; al cambiar filtro, reset a página 1.
- Paginación client-side: `CLIENT_PAGE_SIZE = 10`, slice en memoria,
  `<Pagination currentPage totalPages onChange />`.
- Card por evento: título + `Badge` de estatus, fecha CDMX 12h (`formatFullDateTime`),
  clases asociadas, inscritos confirmados, recaudación (`$X MXN`).
  - Acciones: link "Ver detalle" → `/admin/events/[eventId]` + toggle "Ver asistentes (N)".
  - Expansión inline read-only: desglose por clase (nombre, fecha CDMX 12h, coach, ocupados/total)
    + participantes (nombre, correo, fecha de inscripción, método de pago, monto, badge de estatus)
    + invitados admin indentados con `border-l-2 border-l-primary/40`.
- Read-only: ninguna acción de aprobar/rechazar/cancelar en el historial.

**3. `src/app/(portal)/admin/events/page.tsx` (modificar):**
- Reemplazar el bloque `<SpecialEventList />` por `<SpecialEventHistory events={...} />`
  alimentado por `getSpecialEventsHistory()`. Mantener intactos: alerta de evento activo,
  formulario de creación y `hasActiveEvent`.

**4. `src/lib/queries/__tests__/events-history.test.ts`:**
- Orden `startDate DESC` del listado.
- `revenue` = suma solo de confirmadas (pendientes/reembolsadas excluidas).
- `confirmedCount` correcto por evento.

### Prevención de regresiones
- NO tocar `ClassManagement.tsx`, `Pagination.tsx` ni el detalle `/admin/events/[eventId]`.
- Fechas con `formatFullDateTime` (CDMX 12h A.M./P.M.), sin `getHours()` ni `toLocaleDateString` raw.
- Eventos activos siguen gestionándose desde el detalle existente; el historial es solo lectura.

### Comando de verificación
```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

---

# TASK-DASHBOARD-PENDING-TRANSFER-MODAL — Banner + Modal de Datos Bancarios para Pagos Pendientes por Transferencia

**Estado:** ✅ Ejecutado
**Prioridad:** Alta (UX transaccional — el usuario pierde los datos bancarios tras generar la orden)
**Problema:** al confirmar una compra por transferencia, los datos bancarios solo se muestran inline
en el estado `result` de `SubscriptionCard.tsx` (L95-112) / `SpecialEventPurchase.tsx` (L76-93);
cualquier re-render o navegación los oculta y el usuario no puede consultarlos después.
**Solución:** banner persistente en el Dashboard del cliente mientras exista un pago
`payments.confirmed === false && payments.paymentType === 'transfer'`, con botón
"Ver datos de transferencia" que abre un modal con la cuenta activa del estudio.

## Mapeo de nomenclatura (requerimiento → modelo real)

| Requerimiento | Modelo real (Drizzle) |
|---|---|
| `status === 'pending'` (suscripción) | `payments.confirmed === false` (join `userSubscriptions.paymentId`) |
| `status === 'pending'` (evento) | `specialEventRegistrations.status === 'pending'` + `payments.confirmed === false` |
| `payment_method === 'transfer'` | `payments.paymentType === 'transfer'` |
| Monto (suscripción) | `subscriptions.price` (payments NO tiene columna de monto) |
| Monto (evento) | `specialEventRegistrations.amountPaid` |
| Concepto | `subscriptions.name` / `specialEvents.title` |
| Cuenta activa | `debitCards.findFirst({ where: eq(debitCards.active, true) })` |

## Archivos a Intervenir

| Archivo | Cambio |
|---|---|
| `src/components/client/BankTransferModal.tsx` | **Nuevo** — modal de datos bancarios con copiado al portapapeles |
| `src/components/client/PendingTransferBanner.tsx` | **Nuevo** — banner client component que gestiona el estado del modal |
| `src/lib/queries/pending-transfers.ts` | **Nuevo** — query server que agrupa los pendientes por transferencia del usuario |
| `src/app/(portal)/client/page.tsx` | Modificar — invocar la query y renderizar un banner por cada pendiente |

**NO modificar:** `SubscriptionCard.tsx`, `SpecialEventPurchase.tsx`
(los bloques inline post-compra quedan intactos; fuera de alcance).
**Desviación aprobada durante la ejecución:** se agregó el prop opcional y backward-compatible
`hideCancel?: boolean` a `src/components/ui/Modal.tsx` (default `false`) para que el modal
informativo muestre un único botón "Cerrar". No altera a ninguno de los 15 consumidores existentes.

## TASK-QUERY-PENDING-TRANSFERS

- **Archivo:** `src/lib/queries/pending-transfers.ts` (crear)
- **Contexto:** patrón de queries server directas de `src/lib/queries/coach.ts`; el dashboard
  actual (`client/page.tsx` L39-62) detecta `pending` pero sin tipo/método/monto.
- **Instrucción — `getPendingTransferPayments(userId)`** retorna `PendingTransfer[]`:
  1. **Suscripción:** select `userSubscriptions` join `payments` join `subscriptions`
     donde `userId`, `payments.confirmed = false`, `payments.paymentType = 'transfer'`
     → `{ kind: 'subscription', concept: subscriptions.name, amount: subscriptions.price }`.
  2. **Evento:** select `specialEventRegistrations` join `payments` join `specialEvents`
     donde `userId`, `specialEventRegistrations.status = 'pending'`,
     `payments.confirmed = false`, `payments.paymentType = 'transfer'`
     → `{ kind: 'event', concept: specialEvents.title, amount: amountPaid }`.
  3. Ordenar por `payments.createdAt DESC` (más reciente primero). Pueden coexistir ambos.
- **Tipo exportado:**
  ```ts
  export interface PendingTransfer {
    kind: 'subscription' | 'event';
    concept: string;
    amount: number;
  }
  ```
- **Verificación:** `pnpm exec tsc --noEmit`.

## TASK-UI-BANK-TRANSFER-MODAL

- **Archivo:** `src/components/client/BankTransferModal.tsx` (crear, `'use client'`)
- **Contexto:** reutiliza `Modal` de `@/components/ui/Modal` con `onConfirm={onClose}`,
  `confirmLabel="Cerrar"`; datos bancarios con el mismo layout que el bloque inline de
  `SubscriptionCard.tsx` L96-111 (`bg-surface-container-low border border-outline-variant/40`).
- **Props:** `isOpen`, `onClose`, `concept: string`, `amount: number`,
  `bank: { cardBank: string; cardName: string; cardNumber: string } | null`.
- **Contenido del modal:**
  1. Concepto y **monto exacto** (`$X MXN`) destacados.
  2. Banco, Titular/Beneficiario, Cuenta/CLABE — cada campo copiable con
     `navigator.clipboard.writeText(...)` y feedback visual "Copiado"
     (estado local `copiedField`, reset con `setTimeout` ~2s).
  3. Si `bank === null`: mensaje "No hay datos bancarios configurados. Contacta al administrador."
  4. Instrucción de comprobante: "Envía tu comprobante por mensaje directo a nuestro Instagram"
     con link `<a href="https://www.instagram.com/thelabpilates.hpjn/" target="_blank"
     rel="noopener noreferrer">@thelabpilates.hpjn</a>`.
  5. Recordatorio: tu suscripción/lugar se activará cuando el administrador confirme tu pago.
- **Cero pérdida de estado:** el modal es controlado por el banner padre con `useState`
  booleano; abrir/cerrar no dispara mutations ni `router.refresh()`; los datos llegan
  por props desde el server component (no hay fetch en cliente).

## TASK-UI-PENDING-BANNER

- **Archivo:** `src/components/client/PendingTransferBanner.tsx` (crear, `'use client'`)
- **Props:** `transfers: PendingTransfer[]`, `bank: BankInfo | null`.
- **Render:** un banner por cada item de `transfers` (decisión confirmada: banner individual
  por pendiente, no consolidado):
  - Estilo armónico con el aviso existente (`bg-warm-wood/10 border border-warm-wood/30`,
    patrón de `subscription/page.tsx` L147-153).
  - Mensaje: "Tienes un pago pendiente por transferencia para **{concept}**."
  - Monto visible: "Monto a transferir: **$X MXN**".
  - Botón "Ver datos de transferencia" → abre `BankTransferModal` con ese concepto/monto.
  - El banner persiste mientras la query siga retornando el pendiente
    (desaparece solo cuando el admin confirma o rechaza el pago — server-side).

## TASK-INTEGRATION-DASHBOARD

- **Archivo:** `src/app/(portal)/client/page.tsx` (modificar)
- **Instrucción:**
  1. Importar `getPendingTransferPayments` y `debitCards`; en `ClientDashboardPage`:
     ```ts
     const pendingTransfers = await getPendingTransferPayments(session.sub);
     const activeCard = await db.query.debitCards.findFirst({
       where: eq(debitCards.active, true),
     });
     ```
  2. Renderizar `<PendingTransferBanner transfers={pendingTransfers} bank={...} />`
     inmediatamente después del `<h1>` y **antes** del banner de evento disponible
     (los pendientes tienen prioridad visual sobre promociones).
  3. Envolver en el `try` existente o hacer fail-safe: si la query falla, no romper el dashboard.
- **Nota:** `getSubscriptionState` queda intacto (su `{ type: 'pending' }` convive con el banner;
  no eliminar el Card de "Suscripción pendiente" existente).

## Comando de Verificación

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

### Resultado de la verificación
- `pnpm exec tsc --noEmit` → 0 errores.
- `pnpm exec eslint <archivos tocados>` → 0 errores / 0 warnings.
  (`pnpm lint` global falla por 20 errores **preexistentes** en archivos no tocados:
  `AddGuestButton.tsx`, `ClassCalendar.tsx`, `GuestTooltip.tsx`, `Hero.tsx` y tests.)
- `pnpm test` → **56 archivos / 454 tests pasando** (+3 tests nuevos de la query).
- `pnpm build` → **Compiled successfully** (Next.js 16.3.5, Turbopack).

## Criterio de Aceptación

- [x] Usuario con suscripción pendiente por transferencia ve el banner con concepto y monto.
- [x] Usuario con registro de evento pendiente por transferencia ve su banner correspondiente.
- [x] Usuario con ambos pendientes ve 2 banners independientes.
- [x] Pagos pendientes en efectivo (`paymentType = 'cash'`) NO muestran el banner.
- [x] El modal muestra banco, titular, CLABE/cuenta (copiables con feedback "Copiado"), monto
      exacto, link a Instagram (@thelabpilates.hpjn, `target="_blank" rel="noopener noreferrer"`)
      y recordatorio de activación tras validación del admin.
- [x] El modal puede abrirse/cerrarse repetidamente sin re-renders indeseados ni pérdida de estado.
- [x] Tras la confirmación/rechazo del admin, el banner desaparece (server-side, sin estado local).
- [x] `tsc`, `lint` (archivos tocados), `test` y `build` en verde.

## Archivos Finales

| Archivo | Cambio |
|---|---|
| `src/lib/queries/pending-transfers.ts` | **Nuevo** — `getPendingTransferPayments(userId)` + tipo `PendingTransfer` |
| `src/components/client/BankTransferModal.tsx` | **Nuevo** — modal reutilizable + tipo `BankInfo`, copiado al portapapeles |
| `src/components/client/PendingTransferBanner.tsx` | **Nuevo** — banner por pendiente + control del modal |
| `src/app/(portal)/client/page.tsx` | Modificado — fetch fail-safe de pendientes y cuenta activa + render del banner |
| `src/components/ui/Modal.tsx` | Modificado — prop opcional `hideCancel` (default `false`) |
| `src/lib/queries/__tests__/pending-transfers.test.ts` | **Nuevo** — 3 tests de merge/orden/fallbacks |

---

# TASK-BOOKING-GRACE-ATTENDANCE — Ventana de Gracia, Modal de Reserva y Pase de Lista hasta Fin de Día CDMX

**Estado:** ✅ Ejecutado
**Prioridad:** Alta (regla de negocio transaccional + timezone)
**Alcance:** 3 reglas de negocio en el flujo de reservas y asistencias.
**Sin migraciones:** `classEnrollments.createdAt` y `guestEnrollments.createdAt` ya existen
(`timestamp with time zone`, `defaultNow()`). No tocar el schema.
**Timezone:** `America/Mexico_City` es UTC-6 fijo todo el año (sin DST desde oct-2022).
Todas las fronteras horarias se construyen con offset `-06:00` (mismo criterio que
`parseDateTimeLocalAsMexicoCity` en `src/lib/utils/date.ts`). **Prohibido** usar
`getHours()/setHours()/getDate()` para calcular la ventana.

## Archivos a Modificar / Crear

| Archivo | Cambio |
|---|---|
| `src/lib/utils/date.ts` | Nuevos helpers `GRACE_PERIOD_MINUTES`, `isWithinGracePeriod`, `getMexicoCityDayBounds`, `isAttendanceWindowOpen` |
| `src/actions/enrollment.ts` | Gracia de 10 min en `cancelReservationAction` + re-chequeo en `confirmLateCancellationAction` |
| `src/actions/guest.ts` | Gracia de 10 min en `cancelGuestAction`, `cancelReservationWithGuestAction`, `confirmLateCancelGuestAction`, `confirmLateCancelBothAction` |
| `src/components/client/BookingConfirmationModal.tsx` | **Nuevo** — modal de confirmación con recordatorio de política |
| `src/components/client/EnrollWithGuestSection.tsx` | Intercepta el submit y exige confirmación en el modal |
| `src/components/client/ClassList.tsx` | Pasa `classLabel` y `classDateTime` a `EnrollWithGuestSection` |
| `src/actions/coach.ts` | Ventana de asistencia de día completo CDMX en `updateAttendanceAction` |
| `src/components/coach/AttendanceSheet.tsx` | Prop `attendanceClosed` → toggles/botón deshabilitados + aviso de solo lectura |
| `src/app/(portal)/coach/attendance/[classId]/page.tsx` | Calcula `isFutureClass`/`attendanceClosed` con los bounds CDMX y los pasa |
| `src/app/(portal)/admin/attendance/[classId]/page.tsx` | Idem página de admin |
| `src/lib/utils/__tests__/date-window.test.ts` | **Nuevo** — tests unitarios de los helpers |
| `src/actions/__tests__/grace-period-cancellation.test.ts` | **Nuevo** — gracia titular + invitado |
| `src/actions/__tests__/attendance.test.ts` | Extender con casos de ventana de fin de día CDMX |

---

## TASK-1 — HELPERS DE TIEMPO (`src/lib/utils/date.ts`)

Agregar al final del archivo (mantener el estilo existente: sin dependencias nuevas,
`Intl` con `timeZone: TIMEZONE`):

```ts
/** Tolerancia posreserva para cancelar por error con reembolso íntegro. */
export const GRACE_PERIOD_MINUTES = 10;

/**
 * true si `createdAt` está a 10 minutos o menos de `now` (inclusive).
 * `<= 10` → con gracia. `> 10` → sin gracia.
 */
export function isWithinGracePeriod(
  createdAt: Date | string | null,
  now: Date = new Date()
): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return false;
  const diffMinutes = (now.getTime() - created.getTime()) / (1000 * 60);
  return diffMinutes <= GRACE_PERIOD_MINUTES;
}

/**
 * Fronteras del día calendario en CDMX para un instante dado.
 * start = 00:00:00.000 CDMX, end = 23:59:59.999 CDMX.
 * Mexico City es UTC-6 fijo (sin DST desde oct-2022).
 */
export function getMexicoCityDayBounds(date: Date | string): { start: Date; end: Date } {
  const d = new Date(date);
  if (isNaN(d.getTime())) throw new Error('Fecha inválida');
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d); // "YYYY-MM-DD"
  return {
    start: new Date(`${ymd}T00:00:00.000-06:00`),
    end: new Date(`${ymd}T23:59:59.999-06:00`),
  };
}

/** true si `now` cae dentro del día calendario CDMX de `classDate`. */
export function isAttendanceWindowOpen(
  classDate: Date | string | null,
  now: Date = new Date()
): boolean {
  if (!classDate) return false;
  const d = new Date(classDate);
  if (isNaN(d.getTime())) return false;
  const { start, end } = getMexicoCityDayBounds(d);
  return now >= start && now <= end;
}
```

---

## TASK-2 — BACKEND: GRACIA DE 10 MIN EN CANCELACIONES (`src/actions/enrollment.ts`)

**Archivo:** `src/actions/enrollment.ts`
**Import:** agregar `isWithinGracePeriod` al import existente de `@/lib/utils/date`.

### TASK-2.1 — `cancelReservationAction` (L256-285)

Reemplazar el chequeo de 24 h por `24 h OR gracia`:

```ts
// Check if ≥24h before class OR within the 10-min grace window
const hoursUntilClass =
  (new Date(openClass.classDate).getTime() - Date.now()) / (1000 * 60 * 60);
const withinGrace = isWithinGracePeriod(enrollment.createdAt);

if (hoursUntilClass >= 24 || withinGrace) {
  // Cancelación a tiempo o por error (gracia): delete + refund crédito (atómico)
  try {
    await db.transaction(async (tx) => {
      await tx.delete(classEnrollments).where(eq(classEnrollments.id, enrollmentId));
      if (!isOpenLab) {
        await tx.execute(sql`
          UPDATE user_suscriptions
          SET days_remaining = days_remaining + 1
          WHERE id = ${enrollment.userSubscriptionId}
        `);
      }
    });
  } catch {
    return { success: false, error: 'No se pudo completar la cancelación. Intenta de nuevo.' };
  }

  revalidatePath('/client/reservations');
  revalidatePath('/client');
  revalidatePath('/');
  return {
    success: true,
    message:
      withinGrace && hoursUntilClass < 24
        ? 'Cancelada dentro de los 10 minutos de tolerancia. Tu crédito ha sido restaurado.'
        : 'Reservación cancelada. Tu crédito ha sido restaurado.',
  };
} else {
  // Late cancellation: señal al cliente para confirmar (sin reembolso)
  return { success: false, error: 'LATE_CANCELLATION', field: 'late' };
}
```

> **Nota de orden:** `enrollment.createdAt` se obtiene de la fila ya cargada en L189-194
> (`db.select({ enrollment: classEnrollments, ... })`). No requiere query extra.
> Si `createdAt` es `null` (dato legado), `isWithinGracePeriod` devuelve `false` → se aplica
> la regla estricta de 24 h (fail-safe).

### TASK-2.2 — `confirmLateCancellationAction` (L288-353)

El usuario puede confirmar el modal tardío **dentro** de su ventana de gracia (p. ej. abrió
el modal en el min 9 y confirmó en el min 10). Antes de marcar `late_cancelled`, recalcular:

```ts
const hoursUntilClass =
  (new Date(openClass.classDate).getTime() - Date.now()) / (1000 * 60 * 60);

if (hoursUntilClass >= 24 || isWithinGracePeriod(enrollment.createdAt)) {
  // Ya califica como reembolso → ejecutar la misma rama de reembolso
  const [subRow] = await db
    .select({ guest: subscriptions.guest })
    .from(userSubscriptions)
    .leftJoin(subscriptions, eq(userSubscriptions.subscriptionId, subscriptions.id))
    .where(eq(userSubscriptions.id, enrollment.userSubscriptionId));
  const isOpenLab = subRow?.guest === true;

  try {
    await db.transaction(async (tx) => {
      await tx.delete(classEnrollments).where(eq(classEnrollments.id, enrollmentId));
      if (!isOpenLab) {
        await tx.execute(sql`
          UPDATE user_suscriptions
          SET days_remaining = days_remaining + 1
          WHERE id = ${enrollment.userSubscriptionId}
        `);
      }
    });
  } catch {
    return { success: false, error: 'No se pudo completar la cancelación. Intenta de nuevo.' };
  }

  revalidatePath('/client/reservations');
  revalidatePath('/client');
  revalidatePath('/');
  return { success: true, message: 'Reservación cancelada. Tu crédito ha sido restaurado.' };
}

// ...resto existente: marcar 'late_cancelled' sin reembolso
```

> **Sugerencia de refactor (opcional):** extraer la rama de reembolso a una función privada
> `refundEnrollment(enrollment, isOpenLab)` para no duplicarla en 2.1 y 2.2.

---

## TASK-3 — BACKEND: GRACIA DE 10 MIN EN FLUJOS DE INVITADO (`src/actions/guest.ts`)

Aplicar la **misma** regla `>= 24 h OR gracia` en los 4 puntos de decisión. Importar
`isWithinGracePeriod` desde `@/lib/utils/date`.

| Función | Punto de decisión | Cambio |
|---|---|---|
| `cancelGuestAction` (L610-646) | `if (hoursUntilClass > 24)` | `if (hoursUntilClass > 24 \|\| isWithinGracePeriod(guestEnrollment.createdAt))` |
| `cancelReservationWithGuestAction` (L789-833) | `if (hoursUntilClass > 24)` | `if (hoursUntilClass > 24 \|\| isWithinGracePeriod(enrollment.createdAt))` |
| `confirmLateCancelGuestAction` (L658-708) | hoy solo cancela sin reembolsar | Si `isWithinGracePeriod(guestEnrollment.createdAt)` → cancelar invitado **y** `restoreGuestCredit(session.sub, userSub.id)` (misma lógica que la rama a tiempo de `cancelGuestAction`) |
| `confirmLateCancelBothAction` (L847+) | hoy solo cancela ambos sin reembolsar | Si `isWithinGracePeriod(enrollment.createdAt)` → cancelar titular + invitado y `restoreGuestCredit(...)` |

Snippet de referencia (rama a tiempo, `cancelGuestAction`):

```ts
const hoursUntilClass =
  (new Date(openClass.classDate).getTime() - Date.now()) / (1000 * 60 * 60);
const withinGrace = isWithinGracePeriod(guestEnrollment.createdAt);

if (hoursUntilClass > 24 || withinGrace) {
  // ... lógica existente de cancelar + restoreGuestCredit(...)
  return {
    success: true,
    message: withinGrace && hoursUntilClass <= 24
      ? 'Invitado cancelado dentro de la tolerancia. Tu crédito de invitado ha sido restaurado.'
      : 'Invitado cancelado. Tu crédito de invitado ha sido restaurado.',
  };
} else {
  return { success: false, error: 'LATE_CANCELLATION' };
}
```

> **Nota:** `cancelReservationAction` retorna `HAS_GUEST` (L233-240) **antes** del chequeo de
> fechas, así que la gracia de una reserva con invitado se evalúa en `guest.ts` (diálogo de
> cancelación de invitado), no en `enrollment.ts`. No cambiar ese orden.

---

## TASK-4 — FRONTEND: MODAL DE CONFIRMACIÓN DE RESERVA

### TASK-4.1 — Nuevo `src/components/client/BookingConfirmationModal.tsx`

```tsx
'use client';

import { Modal } from '@/components/ui/Modal';
import { formatTimeWithMeridiem } from '@/lib/utils/date';

export interface BookingConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Nombre visible de la clase (p. ej. "Mat Pilates"). */
  classLabel: string;
  /** Fecha/hora de inicio de la clase. */
  classDateTime: Date | string;
  /** Deshabilita "Confirmar Reserva" mientras corre la mutación. */
  isLoading?: boolean;
}

export function BookingConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  classLabel,
  classDateTime,
  isLoading = false,
}: BookingConfirmationModalProps) {
  const time = formatTimeWithMeridiem(classDateTime);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Confirmar reserva"
      confirmLabel={isLoading ? 'Reservando...' : 'Confirmar Reserva'}
      cancelLabel="Cancelar / Volver"
    >
      <div className="space-y-3">
        <p>
          ¿Confirmar tu reserva para <span className="font-semibold">{classLabel}</span> a las{' '}
          <span className="font-semibold">{time}</span>?
        </p>

        <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 space-y-1">
          <p className="font-body text-sm font-semibold text-on-surface">
            Política de cancelación
          </p>
          <p className="font-body text-xs text-on-surface-variant">
            Recuerda que tienes hasta 24 horas antes de la clase para cancelar y recuperar tu
            crédito. Cuentas con 10 minutos de tolerancia tras reservar por si cometiste un error.
          </p>
        </div>
      </div>
    </Modal>
  );
}
```

### TASK-4.2 — `EnrollWithGuestSection.tsx` (interceptar submit)

1. Agregar props `classLabel: string` y `classDateTime: Date | string` a
   `EnrollWithGuestSectionProps`.
2. Nuevo estado `const [showConfirm, setShowConfirm] = useState(false);`.
3. Renombrar el `handleEnroll` actual a `performEnroll` (sin cambios internos: valida/ejecuta
   y llama a `enrollWithGuestAction` o `enrollInClassAction`).
4. Nuevo `handleRequestEnroll()`: valida el nombre del invitado y, si todo está correcto,
   **solo** abre el modal (`setShowConfirm(true)`). No ejecuta la mutación.
5. El `<button>` de reserva usa `onClick={handleRequestEnroll}`.
6. Al final del JSX:

```tsx
<BookingConfirmationModal
  isOpen={showConfirm}
  onClose={() => setShowConfirm(false)}
  onConfirm={() => {
    setShowConfirm(false);
    void performEnroll();
  }}
  classLabel={classLabel}
  classDateTime={classDateTime}
  isLoading={loading}
/>
```

> La mutación se dispara **únicamente** desde el botón "Confirmar Reserva" del modal.

### TASK-4.3 — `ClassList.tsx` (pasar contexto)

```tsx
<EnrollWithGuestSection
  classId={classItem.id}
  classLabel={getClassDisplayName(classItem.classType, classItem.customName)}
  classDateTime={classItem.classDate}
/>
```

> `EnrollButton.tsx` es legacy y **no se usa** (solo lo referencia un comentario en
> `EnrollWithGuestSection.tsx`). No modificarlo.

---

## TASK-5 — BACKEND: ASISTENCIA HABILITADA TODO EL DÍA CDMX (`src/actions/coach.ts`)

**Función:** `updateAttendanceAction` (L18-74). Reemplazar el guard de L52-55
(`if (!openClass.classDate || new Date(openClass.classDate) > new Date())`) por:

```ts
import { getMexicoCityDayBounds } from '@/lib/utils/date';

if (!openClass.classDate) {
  return { success: false, error: 'Clase no encontrada.' };
}

const { start, end } = getMexicoCityDayBounds(openClass.classDate);
const now = new Date();

if (now < start) {
  // Antes del día de la clase (día calendario CDMX): aún no se pasa lista
  return { success: false, error: 'No puedes registrar asistencia antes del día de la clase.' };
}

if (now > end) {
  // Pasada la medianoche CDMX (12:00 AM del día siguiente) → bloqueo estricto
  return {
    success: false,
    error: 'El periodo para registrar asistencia de esta clase ha finalizado.',
  };
}

// ...resto existente: actualizar classEnrollments y guestEnrollments
```

**Comportamiento resultante:**
- Clase programada el día $D$ → asistencia habilitada desde `00:00:00.000` hasta
  `23:59:59.999` de $D$ en `America/Mexico_City` (incluye la hora previa a la clase).
- Al día siguiente → **rechazado** con `El periodo para registrar asistencia de esta clase ha finalizado.`
- `completeClassAction` **queda intacto** (fuera de alcance por decisión explícita).
- El frontend ya no debe usar `new Date(classDate) > new Date()` como único gate
  (una clase de hoy a las 20:00 con `now` 10:00 aparecía como "futura"); ver TASK-6.

---

## TASK-6 — FRONTEND: ASISTENCIA SOLO LECTURA TRAS EL CORTE

### TASK-6.1 — `AttendanceSheet.tsx`

1. Agregar prop opcional `attendanceClosed?: boolean` (default `false`).
2. `const readonly = classCompleted || attendanceClosed;`
3. En **todos** los botones "Asistió"/"Ausente" (titulares y invitados) cambiar
   `disabled={classCompleted || isPending}` → `disabled={readonly || isPending}`.
4. El botón "Guardar asistencia" se renderiza solo si `!classCompleted && !attendanceClosed`.
5. Al final agregar aviso:

```tsx
{attendanceClosed && !classCompleted && (
  <p className="font-body text-sm text-on-surface-variant text-center">
    El periodo para registrar asistencia de esta clase ha finalizado (23:59 hora de Ciudad de
    México). La lista es de solo lectura.
  </p>
)}
```

### TASK-6.2 — Páginas `coach/attendance/[classId]/page.tsx` y `admin/attendance/[classId]/page.tsx`

Reemplazar el cálculo `isFutureClass` (coach L44-46; admin equivalente) por:

```ts
import { getMexicoCityDayBounds } from '@/lib/utils/date';

const { start, end } = openClass.classDate
  ? getMexicoCityDayBounds(openClass.classDate)
  : { start: new Date(), end: new Date() };
const now = new Date();
const isFutureClass = openClass.classDate ? now < start : false; // día calendario futuro
const attendanceClosed = openClass.classDate ? now > end : false; // pasada la medianoche CDMX
```

1. Mantener la rama `isFutureClass` existente (aviso "Esta clase aún no ocurre…" + lista de
   solo lectura).
2. Pasar la nueva prop: `<AttendanceSheet ... attendanceClosed={attendanceClosed} />`.
3. Si `attendanceClosed` y `!isFutureClass`, se debe renderizar `AttendanceSheet` (no la rama
   de futuro) para que el coach vea los estados finales en solo lectura con el aviso.

---

## TASK-7 — TESTS AUTOMATIZADOS

Runner: **vitest** (`pnpm test`). Seguir los patrones de mocks existentes:
`src/actions/__tests__/cancellation.test.ts` (mock de `@/db`, `@/lib/auth/session`,
`next/headers`, `next/cache`, `drizzle-orm`) y `src/actions/__tests__/attendance.test.ts`
(`// @vitest-environment node`).

### TASK-7.1 — `src/lib/utils/__tests__/date-window.test.ts` (nuevo)

1. `isWithinGracePeriod`: min 8 → `true`; min 10 exactos → `true`; min 10 + 1 ms → `false`;
   `createdAt=null` → `false`.
2. `getMexicoCityDayBounds('2026-09-15T20:00:00-06:00')` → `start` =
   `2026-09-15T06:00:00.000Z`, `end` = `2026-09-16T05:59:59.999Z`.
3. `isAttendanceWindowOpen`: instante `23:30` CDMX del día de clase → `true`;
   `00:01` CDMX del día siguiente → `false`; `23:00` CDMX del día previo → `false`.

### TASK-7.2 — `src/actions/__tests__/grace-period-cancellation.test.ts` (nuevo)

Usar `vi.useFakeTimers()` + `vi.setSystemTime(...)` con horas CDMX explícitas
(`-06:00`) y el mock de fila con `createdAt` controlado.

| # | Escenario | Esperado |
|---|---|---|
| 1 | `cancelReservationAction`, reserva creada hace **8 min**, clase en **2 h** | `success: true`, se ejecuta `db.transaction` (delete + `days_remaining + 1`), mensaje de tolerancia |
| 2 | `cancelReservationAction`, reserva creada hace **12 min**, clase en **2 h** | `success: false`, `error: 'LATE_CANCELLATION'`, **sin** refund |
| 3 | `cancelReservationAction`, reserva creada hace 1 h, clase en **30 h** | `success: true`, refund (regla estándar ≥24 h) |
| 4 | `confirmLateCancellationAction` confirmado dentro de la gracia (8 min) | `success: true`, refund (no marca `late_cancelled`) |
| 5 | `cancelGuestAction`, invitado registrado hace **8 min**, clase en **2 h** | `success: true`, `restoreGuestCredit` invocado |
| 6 | `cancelReservationWithGuestAction`, creada hace **8 min**, clase en **2 h** | `success: true`, cancela titular+invitado y restaura crédito de invitado |
| 7 | `cancelGuestAction`, creado hace 12 min, clase en **2 h** | `success: false`, `'LATE_CANCELLATION'`, sin refund |

### TASK-7.3 — Extender `src/actions/__tests__/attendance.test.ts`

| # | Escenario (`vi.setSystemTime`) | Esperado |
|---|---|---|
| 8 | Clase hoy a las 20:00 CDMX, `now` = **23:30** CDMX del mismo día | `updateAttendanceAction` → `success: true` |
| 9 | Clase ayer a las 20:00 CDMX, `now` = **00:01** CDMX del día siguiente | `success: false`, error `'El periodo para registrar asistencia de esta clase ha finalizado.'` |
| 10 | Clase mañana, `now` = hoy 10:00 CDMX | `success: false` (antes del día de la clase) |

> Conservar los tests existentes (Property 23 "Attendance Date Guard"). El test de
> "clase futura" debe seguir pasando: una clase de un día calendario futuro sigue rechazada.

---

## Comando de Verificación

```bash
pnpm exec tsc --noEmit
pnpm exec eslint src/lib/utils/date.ts src/actions/enrollment.ts src/actions/guest.ts \
  src/actions/coach.ts src/components/client/BookingConfirmationModal.tsx \
  src/components/client/EnrollWithGuestSection.tsx src/components/client/ClassList.tsx \
  src/components/coach/AttendanceSheet.tsx \
  "src/app/(portal)/coach/attendance/[classId]/page.tsx" \
  "src/app/(portal)/admin/attendance/[classId]/page.tsx"
pnpm test
```

> **Nota:** `pnpm lint` global tiene errores preexistentes en archivos no tocados
> (`AddGuestButton.tsx`, `ClassCalendar.tsx`, `GuestTooltip.tsx`, `Hero.tsx` y tests).
> Validar al menos con eslint sobre los archivos tocados; reportar `tsc` y `pnpm test` completos.

### Resultado de la verificación
- `pnpm exec tsc --noEmit` → 0 errores.
- `pnpm exec eslint <archivos tocados>` → 0 errores / 1 warning preexistente
  (`consumeGuestCredit` sin usar en `src/actions/guest.ts`, ya presente antes del cambio).
- `pnpm test` → **58 archivos / 476 tests pasando** (sin fallos). Incluye:
  - `src/lib/utils/__tests__/date-window.test.ts` (12 tests)
  - `src/actions/__tests__/grace-period-cancellation.test.ts` (7 tests)
  - `src/actions/__tests__/attendance.test.ts` (4 tests, ventana fin de día CDMX)
- Tests existentes ajustados a la nueva semántica (enrollment creado fuera de la ventana de
  10 min para los casos de late-cancel; clase del mismo día para asistencia):
  `src/actions/__tests__/cancellation.test.ts`, `src/__tests__/late-cancellation-bug-condition.test.ts`,
  `src/__tests__/bug-condition-exploration.test.ts`.

## Criterio de Aceptación

- [x] Cancelar dentro de los 10 min posteriores a reservar reembolsa el crédito **aunque la
      clase sea en menos de 24 h** (titular y flujos de invitado).
- [x] Cancelar después del min 10 con clase en menos de 24 h → `late_cancelled`, **sin**
      reembolso, con mensaje de cancelación fuera de tiempo.
- [x] Cancelar con ≥24 h de anticipación reembolsa el crédito (regla existente intacta).
- [x] Al reservar aparece un modal obligatorio con nombre de clase, hora y recordatorio de la
      política de 24 h + tolerancia 10 min; la mutación ocurre **solo** al pulsar
      "Confirmar Reserva".
- [x] El pase de lista está habilitado todo el día calendario CDMX de la clase (00:00:00 a
      23:59:59.999).
- [x] Pasada la medianoche CDMX del día siguiente, el backend rechaza la asistencia con
      `El periodo para registrar asistencia de esta clase ha finalizado.` y el frontend
      muestra los toggles en solo lectura con dicho aviso.
- [x] Sin migraciones; `createdAt` reutilizado. Sin cambios en `completeClassAction` ni en
      `EnrollButton.tsx`.
- [x] `tsc`, tests nuevos + existentes en verde.

## Riesgos / Notas de Implementación

- **CDMX = UTC-6 fijo**: construir fronteras con offset `-06:00` (consistente con
  `parseDateTimeLocalAsMexicoCity`). No usar métodos locales de `Date`.
- **`en-CA` + `Intl`** es el patrón ya usado en `date.ts` para obtener `YYYY-MM-DD`; usarlo
  en `getMexicoCityDayBounds` en vez de `toISOString()` (evita corrimiento por UTC).
- **`isWithinGracePeriod` inclusivo**: `<= 10` min. La regla de 24 h usa `>= 24` (titular) y
  `> 24` (invitado) tal como está hoy; no cambiar esa semántica.
- **Origen de `createdAt`**: usar la fila del enrollment/invitado ya cargada; no agregar
  queries extra. `null` → sin gracia (fail-safe hacia la regla estricta).
- **`HAS_GUEST`** se evalúa antes del chequeo de fechas en `cancelReservationAction`; la
  gracia de reservas con invitado vive en `guest.ts`. No reordenar.
- **`confirmLate*`**: re-chequear la gracia evita el caso de "abrí el modal a los 9 min y
  confirmé a los 10:30".

## Follow-up — Clase finalizada editable hasta fin de día

**Estado:** ✅ Ejecutado
**Problema:** una clase finalizada mostraba *"Esta clase ya fue finalizada. La asistencia no
puede modificarse."* y bloqueaba los toggles/guardado, aunque aún estuviera dentro del día
calendario CDMX.
**Solución (solo frontend, `src/components/coach/AttendanceSheet.tsx`):**
- `readonly = attendanceClosed` (se quitó `classCompleted`).
- Botón "Guardar asistencia" visible mientras `!attendanceClosed` (aplica también a clases
  finalizadas dentro del mismo día).
- Se eliminó el mensaje bloqueante; ahora `classCompleted && !attendanceClosed` muestra
  *"Clase finalizada. Puedes modificar la asistencia y guardarla hasta las 23:59 (hora de
  Ciudad de México)."*, y `attendanceClosed` mantiene el aviso de solo lectura.
- Texto del diálogo "Finalizar clase" actualizado (ya no dice que no se podrá modificar).

**Backend:** sin cambios. `updateAttendanceAction` no valida el `status` de la clase, así que
re-guardar una clase finalizada ya funcionaba. `checkAndExpireSubscriptions` no depende de
`attended`/`absent` (solo de `openClasses.status === 'completed'` y de que existan
enrollments no cancelados), por lo que editar asistencia post-finalización no altera la
expiración de suscripciones.

**Test:** `src/components/coach/__tests__/AttendanceSheet.test.tsx` (3 tests) — completada y
ventana abierta → editable y guardable; completada y ventana cerrada → solo lectura; no
completada y ventana abierta → guardar + finalizar.

**Verificación:** `tsc --noEmit` 0 errores; eslint 0 errores; `pnpm test` **59 archivos /
479 tests pasando**.

## Follow-up — Confirmación al cancelar el cupo de una clase

**Estado:** ✅ Ejecutado
**Requerimiento:** al pulsar "Cancelar" en una reservación, mostrar un modal que pregunte si el
usuario está segur@ de cancelar su lugar y que muestre los datos de la clase (nombre, fecha/hora
y coach) antes de ejecutar la cancelación.
**Solución:**
- Nuevo `src/components/client/CancelClassConfirmationModal.tsx` (reutiliza `ui/Modal`,
  `variant="danger"`): pregunta *"¿Estás segur@ de cancelar tu lugar en la clase?"* + tarjeta con
  nombre (`getClassDisplayName`), fecha/hora (`formatFriendlyDate`) y coach.
- `src/components/client/ReservationCard.tsx`: nuevo estado `showCancelConfirm`; el botón
  "Cancelar" ahora abre el modal (`setShowCancelConfirm(true)`) y `handleCancel` (que ejecuta
  `cancelReservationAction`) solo se dispara desde "Sí, cancelar mi lugar".
- Los flujos posteriores existentes se conservan: `HAS_GUEST` → `CancelGuestDialog`;
  `LATE_CANCELLATION` → `CancellationModal` (aviso de cancelación tardía sin reembolso).

**Test:** `src/components/client/__tests__/ReservationCard.test.tsx` (3 tests) — el modal aparece
con los datos de la clase y **no** se llama la acción; solo se cancela al confirmar; "Volver" no
cancela.

**Verificación:** `tsc --noEmit` 0 errores; eslint 0 errores; `pnpm test` **60 archivos /
482 tests pasando**.
