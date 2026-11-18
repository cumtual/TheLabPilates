# SPEC-GUEST-QR-CHECKIN — Asistencia de invitados mediante código QR

**Estado:** ✅ Aprobado e implementado (2026-11-17). Falta la ejecución en producción (§8, la hace el usuario).
**Zona horaria oficial:** `America/Mexico_City` (UTC-6 fijo).
**Extiende:** [`SPEC-QR-CHECKIN.md`](SPEC-QR-CHECKIN.md) (QR del titular, sin cambios) y [`gestion-invitados.md`](gestion-invitados.md).
**Plan TDD:** [`TASK_RUNNER.md`](TASK_RUNNER.md) → sección `TASK-GQR`.

---

## 1. Objetivo y alcance

Cuando el **admin** agrega a un invitado a una clase, el sistema le genera un QR de un solo uso. El admin lo ve en el detalle de asistencia de la clase cuantas veces quiera mientras el invitado siga `pending`, y puede descargarlo para enviárselo al invitado. El coach titular de la clase o un admin lo escanean con el mismo flujo `/check-in` que ya usan los alumnos, y el invitado pasa a `attended` en una sola transacción.

- **Fuera de alcance:**
  - QR para invitados agregados por un cliente (`origin = 'user'`). Siguen con asistencia manual.
  - Regenerar o revocar un QR.
  - Backfill o generación lazy para invitados que ya existen: solo los invitados nuevos tienen QR.
  - Escáner dentro de la app y polling o realtime en el modal del admin.
- **Compatibilidad:** el flujo del titular (`src/lib/checkin/*`, `class_enrolleds`) **no cambia**. `processCheckin` y su repositorio se quedan igual, y el feature se agrega a su alrededor como un adaptador.
- El enum `enrollment_status` no cambia.

---

## 2. Decisiones

Confirmadas por el usuario el 2026-11-17.

| ID | Tema | Decisión |
|---|---|---|
| D1 | Qué invitados tienen QR | Solo `origin = 'admin'`, y solo el admin lo ve |
| D2 | Ciclo de vida del QR | Se ve **varias veces** mientras el invitado esté `pending`. No se puede regenerar (se mantiene simple) |
| D3 | QR por persona | Cada invitado tiene su propio QR, independiente del QR del titular |
| D4 | Permisos de escaneo | Los mismos que para el titular: el coach titular de la clase o un admin. Un `client` recibe 403 |
| D5 | Cierre automático | El cron diario pasa a `absent` a los invitados (de cualquier origen) que sigan `pending` al terminar el día CDMX de la clase, a partir de `GUEST_ATTENDANCE_AUTO_CLOSE_FROM` (día del deploy) |
| D6 | Auditoría | Nueva columna `guest_enrollments.checked_in_by`: quién registró la asistencia (por QR o manual) |
| D7 | Invitados que ya existen | Sin backfill ni generación lazy. Un invitado sin token no muestra QR |
| D8 | Arquitectura | Módulo nuevo `src/modules/guest-checkin` (domain → application → infrastructure → presentation). `src/lib/checkin` se queda como está y solo gana un adaptador que encadena titular → invitado |
| D9 | URL del QR | La misma que la del titular: `${NEXT_PUBLIC_APP_URL}/check-in?token=<64 hex>`. El coach no tiene que distinguir de quién es el QR |
| D10 | Preselección en `AttendanceSheet` | **No se cambia.** Hoy los `pending` se preseleccionan como `attended` tanto para titulares como para invitados. Cambiarlo solo para invitados rompería la simetría; queda como posible mejora aparte |

---

## 3. Base de datos

### 3.1 DDL — `sql/manual/2026-11-17_001_guest_checkin_columns.sql`

```sql
-- Feature: QR de asistencia para invitados (SPEC-GUEST-QR-CHECKIN §3.1)
-- Aditivo e idempotente. No toca datos existentes.
-- Ejecutar: psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f sql/manual/2026-11-17_001_guest_checkin_columns.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.guest_enrollments ADD COLUMN IF NOT EXISTS checkin_token varchar(64);
ALTER TABLE public.guest_enrollments ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
ALTER TABLE public.guest_enrollments ADD COLUMN IF NOT EXISTS checked_in_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guest_enrollments_checkin_token_unique'
      AND conrelid = 'public.guest_enrollments'::regclass
  ) THEN
    ALTER TABLE public.guest_enrollments
      ADD CONSTRAINT guest_enrollments_checkin_token_unique UNIQUE (checkin_token);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guest_enrollments_checked_in_by_users_id_fk'
      AND conrelid = 'public.guest_enrollments'::regclass
  ) THEN
    ALTER TABLE public.guest_enrollments
      ADD CONSTRAINT guest_enrollments_checked_in_by_users_id_fk
      FOREIGN KEY (checked_in_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

COMMENT ON COLUMN public.guest_enrollments.checkin_token IS
  'Token QR de un solo uso (64 hex). Solo invitados origin=admin. Válido con status = pending; NULL tras attended/absent.';
COMMENT ON COLUMN public.guest_enrollments.checked_in_at IS
  'Momento del check-in (QR o manual) al pasar a attended.';
COMMENT ON COLUMN public.guest_enrollments.checked_in_by IS
  'Usuario (coach/admin) que registró la asistencia.';

COMMIT;
```

- Las tres columnas son nullable y sin default, así que en PG ≥ 11 solo cambian metadatos.
- La FK valida filas que hoy son todas `NULL`, lo que es inmediato. `lock_timeout` aborta si la tabla está ocupada.
- No hay script de backfill (D7).

### 3.2 Verificación post-DDL (solo lectura)

```sql
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'guest_enrollments'
  AND column_name IN ('checkin_token', 'checked_in_at', 'checked_in_by');
-- Esperado: 3 filas, is_nullable = YES

SELECT conname FROM pg_constraint
WHERE conrelid = 'public.guest_enrollments'::regclass
  AND conname IN ('guest_enrollments_checkin_token_unique', 'guest_enrollments_checked_in_by_users_id_fk');
-- Esperado: 2 filas
```

### 3.3 Schema Drizzle — `src/db/schema.ts`

```ts
// guestEnrollments: columnas nuevas (sql/manual/2026-11-17_001_guest_checkin_columns.sql)
checkinToken: varchar('checkin_token', { length: 64 }).unique('guest_enrollments_checkin_token_unique'),
checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
checkedInById: uuid('checked_in_by').references(() => users.id, { onDelete: 'set null' }),
```

Reglas: ver `CLAUDE.md` → "Production DB rules". **Primero el DDL en producción, después el deploy.**

---

## 4. Máquina de estados — `guest_enrollments.status`

| Desde → Hacia | Disparador | Actor | `checkin_token` | `checked_in_at` | `checked_in_by` |
|---|---|---|---|---|---|
| ∅ → `pending` | `adminAddGuestAction` | admin | generado | `NULL` | `NULL` |
| ∅ → `pending` | `enrollWithGuestAction`, `addGuestToReservationAction` | client | `NULL` (D1) | `NULL` | `NULL` |
| `pending` → `attended` | `POST /api/check-in` | coach titular / admin | `NULL` | `now()` | actor |
| `pending` → `attended` | `updateAttendanceAction` | coach titular / admin | `NULL` | `coalesce(actual, now())` | `coalesce(actual, actor)` |
| `pending`/`attended` → `absent` | `updateAttendanceAction` | coach titular / admin | `NULL` | `NULL` | `NULL` |
| `pending` → `absent` | Cron (fin del día CDMX, D5) | sistema | `NULL` | `NULL` | `NULL` |
| `pending` → `cancelled` | Flujos existentes (sin cambios) | client / admin | se conserva, pero es inerte | `NULL` | `NULL` |

### 4.1 Invariantes

- **GI-1** Un token de invitado solo se acepta si el invitado sigue `pending`. Se valida dentro de la transacción, con la fila bloqueada.
- **GI-2** Toda transición a `attended` o `absent` pone `checkin_token = NULL`.
- **GI-3** `checked_in_at` y `checked_in_by` solo tienen valor si `status = 'attended'`.
- **GI-4** Ninguna transición de este feature mueve cupos ni créditos de invitado.
- **GI-5** Solo el coach titular de la clase o un admin pueden pasar a un invitado a `attended`. Se valida en el backend.
- **GI-6** El check-in solo procede durante el día calendario CDMX de la clase.
- **GI-7** Solo un admin puede ver el QR, y solo de un invitado `origin = 'admin'` que siga `pending` y tenga token.

---

## 5. Arquitectura — `src/modules/guest-checkin`

Sigue las reglas del módulo de cafetería, con su propio `module-boundaries.test.ts`: `domain` no importa nada; `application` solo importa `domain`; las páginas, componentes y acciones usan `presentation`.

```
src/modules/guest-checkin/
├── domain/
│   ├── guest-checkin.ts       # GuestCheckinCandidate, evaluateGuestCheckin()
│   ├── guest-qr-policy.ts     # canViewGuestQr()
│   ├── guest-attendance.ts    # guestAttendanceTransition() (intención pura, sin SQL)
│   └── errors.ts              # GuestCheckinErrorCode (subconjunto idéntico de CheckinErrorCode)
├── application/
│   ├── ports/index.ts         # GuestCheckinRepository, GuestCheckinUnitOfWork, AttendanceWindow,
│   │                          # TokenGenerator, CheckinUrlBuilder, QrRenderer, Clock, Actor
│   └── use-cases/
│       ├── check-in-guest.ts       # checkInGuestByToken
│       ├── get-guest-qr.ts         # getGuestCheckinQr
│       └── close-unattended.ts     # closeUnattendedGuests
├── infrastructure/
│   ├── drizzle-guest-checkin-repository.ts
│   ├── drizzle-unit-of-work.ts
│   ├── adapters.ts            # envuelve lib/checkin/{token,qr}.ts y lib/utils/date.ts
│   └── container.ts           # arma las dependencias
└── presentation/
    ├── actions/get-guest-qr.ts     # 'use server': getGuestCheckinQrAction (solo admin)
    ├── checkin.ts                  # processGuestCheckin(token, actor) (solo servidor)
    ├── tokens.ts                   # newGuestCheckinToken()
    ├── attendance.ts               # guestAttendanceSet(status, actorId) para coach.ts
    ├── auto-close.ts               # markUnattendedGuestsAbsent(now)
    └── types.ts
```

### 5.1 Domain

```ts
export interface GuestCheckinCandidate {
  guestEnrollmentId: string;
  status: 'pending' | 'attended' | 'absent' | 'late_cancelled' | 'cancelled' | null;
  guestName: string;
  invitedByName: string | null;
  classDate: Date | null;
  classStatus: 'scheduled' | 'cancelled' | 'completed' | null;
  coachUserId: string | null;
  classType: string | null;
  customName: string | null;
}

/** El mismo orden que processCheckin: autorización antes de revelar estado. */
export function evaluateGuestCheckin(input: {
  candidate: GuestCheckinCandidate;
  actor: { id: string; role: string };
  isWithinAttendanceWindow: boolean;
}): { ok: true } | { ok: false; code: GuestCheckinErrorCode; details?: { status?: string; classDate?: string } };
```

Orden: rol coach que no es titular → `NOT_CLASS_COACH`; `status ≠ pending` → `ENROLLMENT_NOT_PENDING`; clase cancelada → `CLASS_CANCELLED`; fuera del día CDMX → `OUTSIDE_ATTENDANCE_WINDOW`.

La ventana se calcula en `application` con el puerto `AttendanceWindow`, porque el dominio no puede importar `lib/utils/date`.

`canViewGuestQr(actor, guest)` devuelve `true` solo si se cumple GI-7.

### 5.2 Application (casos de uso)

**`checkInGuestByToken({ token, actor }, deps)`**
1. `actor` nulo → `UNAUTHENTICATED`; rol que no es coach ni admin → `FORBIDDEN_ROLE`; token con formato inválido → `TOKEN_NOT_FOUND`.
2. `uow.run(repo => …)`:
   - `repo.findByTokenForUpdate(token)`. Si no hay fila → `TOKEN_NOT_FOUND`.
   - `evaluateGuestCheckin(...)`.
   - `repo.markAttended(id, token, actor.id)`: un `UPDATE` con guardas `status = 'pending' AND checkin_token = $token`. Si actualiza 0 filas → `TOKEN_NOT_FOUND` (otro escaneo ganó).
3. Devuelve `{ guestEnrollmentId, guestName, invitedByName, className, classDate, checkedInAt }`.

**`getGuestCheckinQr({ guestEnrollmentId, actor }, deps)`**
- Lee el invitado (sin bloqueo) y aplica `canViewGuestQr`. Si no cumple → `GUEST_QR_NOT_AVAILABLE`, un solo código para no revelar el motivo.
- Devuelve `{ qrDataUrl, guestName, className, classDate }` con `qrRenderer.render(urlBuilder.build(token))`.
- Se puede ver antes del día de la clase, para que el admin lo envíe con anticipación.

**`closeUnattendedGuests({ now }, deps)`**
- `repo.markUnattendedAbsent({ from: GUEST_ATTENDANCE_AUTO_CLOSE_FROM, cutoff: inicio del día CDMX de now })`.
- Es un único `UPDATE … FROM open_class` con `status IN ('scheduled','completed')` y `class_date >= from AND class_date < cutoff`. Pone `status = 'absent'` y `checkin_token = NULL`. Es idempotente.

### 5.3 Infrastructure

- El repositorio Drizzle hace `SELECT … FROM guest_enrollments JOIN open_class LEFT JOIN users (registered_by) WHERE checkin_token = $1 FOR UPDATE OF guest_enrollments`. Es compatible con PgBouncer porque `prepare: false` ya está configurado.
- `adapters.ts` reutiliza `generateCheckinToken`, `isValidCheckinToken`, `buildCheckinUrl`, `buildCheckinQrDataUrl` e `isAttendanceWindowOpen` **sin modificarlos**.
- `guestAttendanceSet(status, actorId)` traduce `guestAttendanceTransition` a un `set` de Drizzle con `coalesce` (§4).

### 5.4 Integración con el código existente (cambios mínimos)

| Archivo | Cambio |
|---|---|
| `src/lib/checkin/resolve-checkin.ts` (nuevo) | `processAnyCheckin({ token, actor })` primero llama a `processCheckin` (titular, sin cambios). Solo si el resultado es `TOKEN_NOT_FOUND`, llama a `processGuestCheckin`. Normaliza la respuesta (§6) |
| `src/app/api/check-in/route.ts` | Cambia `processCheckin` por `processAnyCheckin`. El orden de validación (Origin → sesión → rol → body) no cambia |
| `src/lib/checkin/errors.ts` | Sin cambios: los códigos del invitado son el mismo conjunto. `GUEST_QR_NOT_AVAILABLE` solo vive en el módulo y en su acción |
| `src/actions/admin-guest.ts` | En el `insert`, agrega `checkinToken: newGuestCheckinToken()`. Nada más |
| `src/actions/coach.ts` | En la rama de invitados de `updateAttendanceAction`, `.set({ status })` pasa a `.set(guestAttendanceSet(record.status, session.sub))`. La rama del titular no se toca |
| `src/app/api/cron/complete-classes/route.ts` | Después de `markUnattendedEnrollmentsAbsent()`, llama a `markUnattendedGuestsAbsent()` y agrega `guestsMarkedAbsent` al JSON (campo nuevo; los existentes no cambian) |
| `src/components/coach/CheckInProcessor.tsx` | Si `data.subject === 'guest'`, agrega la línea "Invitado · agregado por {invitedByName}" |
| `src/components/admin/AdminGuestSection.tsx` | Botón "Ver QR" en invitados `origin = 'admin'` y `status = 'pending'`; abre `GuestQrModal` |
| `src/components/admin/GuestQrButton.tsx` (nuevo) | Botón "Ver QR": llama a la acción y muestra el error genérico si no hay QR |
| `src/components/admin/GuestQrModal.tsx` (nuevo) | Modal basado en `CheckinQrModal`, sin polling. Muestra el QR con su `alt`, un botón "Descargar" (`<a download="qr-invitado-….svg">`) y "Cerrar", que hace `router.refresh()` |

**No se tocan:** `process-checkin.ts`, `checkin-repository.ts`, `ensure-token.ts`, `status.ts`, `/api/check-in/status`, `guest.ts`, `enrollment.ts`, la página `/check-in` ni el dashboard del cliente.

Abrir el QR no necesita `Modal` de confirmación porque es una lectura sin efectos. Agregar o quitar un invitado ya lo usa.

---

## 6. Contratos

### 6.1 `POST /api/check-in` (compatible hacia atrás)

La petición, los códigos y los estados HTTP son los de `SPEC-QR-CHECKIN §7.2`. La respuesta 200 agrega dos campos y conserva todos los anteriores:

```json
{
  "ok": true,
  "data": {
    "subject": "guest",
    "enrollmentId": "<guest_enrollment_id>",
    "studentName": "María López",
    "invitedByName": "Admin Studio",
    "className": "Mat Pilates",
    "classDate": "2026-11-20T15:00:00.000Z",
    "checkedInAt": "2026-11-20T14:57:02.000Z"
  }
}
```

- El titular devuelve `subject: "enrollment"` y no incluye `invitedByName`.
- `studentName` se mantiene con el nombre del invitado para que `CheckInProcessor` siga funcionando sin cambios.
- **Coste:** un token inexistente hace dos búsquedas por índice único. Es despreciable.

### 6.2 `getGuestCheckinQrAction(guestEnrollmentId)` — Server Action

| Resultado | Cuándo |
|---|---|
| `{ success: true, data: { qrDataUrl, guestName, className, classDate } }` | Admin, invitado `origin='admin'`, `pending`, con token |
| `{ success: false, error: 'No tienes permisos para esta acción.' }` | Sin sesión o rol distinto de admin |
| `{ success: false, error: 'Este invitado no tiene un QR disponible.' }` | Cualquier otro caso (`GUEST_QR_NOT_AVAILABLE`): no existe, origen `user`, ya no está `pending` o es anterior a la función (D7) |

### 6.3 Cron `GET /api/cron/complete-classes`

`200` → `{ success, completed, markedAbsent, guestsMarkedAbsent, timestamp }`.

---

## 7. Seguridad

- **Privilegios:** el rol, la titularidad y el estado se validan en el servidor, dentro de la transacción. Un `client` recibe 403 antes de tocar la BD (la ruta no cambia).
- **Reuso:** el token es de un solo uso y se anula en el mismo `UPDATE` que marca la asistencia. Si dos personas escanean a la vez, solo una tiene éxito (`FOR UPDATE` más la guarda `checkin_token = $token`).
- **Que se vea varias veces (D2):** un QR filtrado no le sirve a nadie sin una sesión de coach o admin, y solo el día de la clase. Es el mismo riesgo que ya se aceptó para el titular.
- **Enumeración:** el token tiene 256 bits, el 404 es igual para un token inexistente o usado, y la acción del QR responde con un solo mensaje genérico.
- **Exposición:** el QR solo contiene la URL, sin datos personales. El nombre del invitado aparece solo en la pantalla del coach o admin después de autenticarse.

---

## 8. Despliegue y reversión

1. El PR se aprueba con la suite en verde (`TASK-GQR-VERIFY-01`).
2. Se fija `GUEST_ATTENDANCE_AUTO_CLOSE_FROM` con la fecha real de salida.
3. 🔒 **Usuario:** ejecuta `2026-11-17_001_guest_checkin_columns.sql` y lo verifica con §3.2.
4. Merge a `production` → deploy en Vercel.
5. Al día siguiente se revisa `guestsMarkedAbsent` en el JSON del cron.

**Reversión:** revertir el deploy. El código anterior ignora las columnas nuevas, que son nullable. El DDL no se revierte.
