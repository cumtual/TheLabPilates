# SPEC — Auditoría temporal de reservas y cancelaciones + Términos (regla de 10 min)

**Estado:** Aprobado e implementado (2026-09-24). Decisiones: D1-A, D2 sí, D3 `/terminos-y-condiciones` (ya existía), D4 sí, D5 sí. **Pendiente (usuario):** ejecutar el SQL de §2.1 en producción antes del deploy.
**Rama:** `feat/cancellation-audit`, creada desde `feat/qr-code`.
**Plan TDD:** `TASK_RUNNER.md`, sección `TASK-CA`.
**Zona horaria:** `America/Mexico_City` (`TIMEZONE` en `src/lib/utils/date.ts`).
**Restricción de BD:** solo SQL manual, aditivo e idempotente, ejecutado por el usuario. Ninguna tarea corre comandos contra la BD.

---

## 1. Hallazgos del código actual (condicionan el diseño)

| # | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| H1 | Una cancelación a tiempo (≥24 h) o dentro de la gracia **borra** la fila (`tx.delete(classEnrollments)`). | `src/actions/enrollment.ts`, `refundEnrollment()` | Hoy no hay nada que auditar en el caso más común. La cancelación debe pasar a ser *soft*: `status='cancelled'` + `cancelled_at`. |
| H2 | El índice único `uk_class_user_enrollment (open_class_id, user_suscription_id)` **no excluye** las filas canceladas. | `src/db/schema.ts` | Al conservar la fila cancelada, la misma suscripción ya no puede volver a reservar esa clase: el INSERT falla con `23505`. **Este bug ya existe hoy** con las filas `late_cancelled` y con el flujo titular+invitado, que ya hace UPDATE. Ver D1. |
| H3 | `refundEnrollment` reembolsa sin guardia de estado. | Mismo archivo | Con dos clics simultáneos, el DELETE borra 0 filas pero el `days_remaining + 1` se ejecuta dos veces (**doble reembolso**). Se corrige con `UPDATE … WHERE status='pending' RETURNING id`. |
| H4 | La ventana de gracia de 10 min **ya está implementada** en backend (`isWithinGracePeriod`, `GRACE_PERIOD_MINUTES = 10`, inclusiva) y cubierta por `grace-period-cancellation.test.ts`. | `src/lib/utils/date.ts`, `enrollment.ts`, `guest.ts` | No se reimplementa. Solo se re-verifica tras el cambio de DELETE a UPDATE, y los Términos se redactan para coincidir **exactamente** con esa lógica. |
| H5 | El admin reutiliza `getCancelledEnrollments()`, que es la misma función de la vista del coach. | `src/lib/queries/coach.ts` y las dos páginas `attendance/[classId]` | Agregar `cancelledAt` ahí lo filtraría al coach. Se crea una query **exclusiva de admin**. |
| H6 | La página `/terminos-y-condiciones` ya existe en esta base (§5 «Reservas y política de cancelación (24 horas)») y ya está enlazada desde el Footer y `/soon`. | `src/app/terminos-y-condiciones/page.tsx` | Se reescribe su §5 con la cláusula de §5.2. (En `feat/implementacion-invitado` aún no existía.) |
| H7 | Estos puntos escriben `status` cancelado en `class_enrolleds`: `enrollment.ts` (`refundEnrollment`, `confirmLateCancellationAction`), `guest.ts` (3 escrituras del titular), `admin.ts` (`cancelClassAction` y `suspendSubscriptionAction`). | `rg "status: '(cancelled\|late_cancelled)'"` | **Todos** deben fijar `cancelled_at`. Se centraliza en un helper. |

---

## 2. Base de datos

### 2.1 Script manual — `sql/manual/2026-09-24_001_enrollment_cancelled_at.sql`

```sql
-- Auditoría de cancelaciones. ADITIVO e IDEMPOTENTE. Seguro con datos reales.
-- ADD COLUMN nullable y sin DEFAULT: solo cambia metadatos (no reescribe la tabla) y el lock dura milisegundos.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.class_enrolleds
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE NULL;

COMMENT ON COLUMN public.class_enrolleds.cancelled_at IS
  'Momento (UTC) en que la inscripción pasó a cancelled/late_cancelled. NULL = no cancelada o cancelada antes de 2026-09-24 (sin registro). Uso exclusivo de admin.';

ALTER TABLE public.guest_enrollments
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE NULL;

COMMIT;
```

**Sin backfill.** Las cancelaciones históricas no tienen timestamp confiable, e inventarlo sería registrar un dato falso. Esas filas quedan en `NULL` y la UI muestra «Sin registro».

**Verificación posterior (solo lectura):**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('class_enrolleds', 'guest_enrollments')
  AND column_name = 'cancelled_at';
```

**Rollback:** no se requiere. La columna es inerte para el código anterior. Un `DROP COLUMN` queda prohibido por la política del proyecto.

### 2.2 Drizzle — `src/db/schema.ts`

```ts
// classEnrollments y guestEnrollments (D2)
cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
```
Nullable y sin `.defaultNow()`: el valor lo fija **solo** el flujo de cancelación. `drizzle-kit push`/`migrate` siguen prohibidos. El schema solo describe lo que el script ya creó.

---

## 3. Backend

### 3.1 Helper único de cancelación — `src/lib/enrollment/cancellation.ts`

```ts
export const CANCELLED_ENROLLMENT_STATUSES = ['cancelled', 'late_cancelled'] as const;

/** class_enrolleds: el timestamp lo pone la BD (now()) y el QR queda invalidado. */
export function buildEnrollmentCancellationPatch(status: CancelledEnrollmentStatus) {
  return { status, cancelledAt: sql`now()`, checkinToken: null };
}

/** guest_enrollments */
export function buildGuestCancellationPatch(status: CancelledEnrollmentStatus) {
  return { status, cancelledAt: sql`now()` };
}
```
- Toda escritura de H7 usa estos helpers. `src/__tests__/cancellation-audit-writers.test.ts` falla si reaparece un `.update(classEnrollments|guestEnrollments).set({ status: 'cancelled' … })` literal.
- Guardia de idempotencia: `WHERE id = $1 AND status = 'pending'`. Un reintento no sobreescribe `cancelled_at` ni vuelve a reembolsar.

### 3.2 Cancelación del cliente (`src/actions/enrollment.ts`)

| Caso (hora del servidor, en UTC; la regla no depende de la zona) | Acción | `status` | `cancelled_at` | Crédito |
|---|---|---|---|---|
| `now - created_at ≤ 10 min` y la clase no ha iniciado | `refundEnrollment` | `cancelled` | `now()` | +1 (excepto Open Lab) |
| faltan ≥ 24 h para la clase | `refundEnrollment` | `cancelled` | `now()` | +1 (excepto Open Lab) |
| `> 10 min` y faltan < 24 h | `LATE_CANCELLATION` → `confirmLateCancellationAction` | `late_cancelled` | `now()` | sin reembolso |
| la clase ya inició | se rechaza | — | — | — |

`refundEnrollment` pasa de DELETE a:
```ts
const [row] = await tx.update(classEnrollments)
  .set(buildEnrollmentCancellationPatch('cancelled'))
  .where(and(eq(classEnrollments.id, id), eq(classEnrollments.status, 'pending')))
  .returning({ id: classEnrollments.id });
if (!row) return false;           // otro request ya canceló: no se reembolsa (corrige H3)
// … days_remaining + 1 (si no es Open Lab)
```

### 3.3 Re-reserva tras cancelar (consecuencia de H1 + H2, D1)
Opción A, **sin DDL**, aprobada. En `enrollInClassAction`, si existe una fila `(open_class_id, user_suscription_id)` en estado cancelado, se **reactiva** en lugar de insertar:
`status='pending', created_at=now(), cancelled_at=NULL, checked_in_at=NULL, checkin_token=<nuevo>`, dentro de la misma transacción (y bajo el mismo `FOR UPDATE`) que el descuento de crédito.
- `created_at=now()` es obligatorio: la gracia de 10 min corre desde la **nueva** reserva.
- Costo: se pierde el par `created_at`/`cancelled_at` del ciclo anterior. La auditoría refleja el ciclo más reciente.

### 3.4 Otras escrituras (H7)
- `guest.ts`, titular: `cancelled` y `late_cancelled` usan el helper.
- `admin.ts`, `cancelClassAction` y `suspendSubscriptionAction`: usan `buildEnrollmentCancellationPatch('cancelled')` (y `buildGuestCancellationPatch` para sus invitados). En la auditoría se muestra como cancelación hecha por el estudio.
- D2: `guest_enrollments` usa `buildGuestCancellationPatch` en `guest.ts`, `admin.ts` y `admin-guest.ts`.

### 3.5 Consultas y contrato de datos

No hay endpoint REST para inscritos. Los datos fluyen por Server Components y Server Actions. El «contrato de API» es el tipo que devuelve cada query y los props serializados a componentes cliente.

**Query de coach (sin cambios de forma).** `getClassEnrollments` y `getCancelledEnrollments` en `src/lib/queries/coach.ts` siguen proyectando **solo** `enrollmentId, status, studentName, studentEmail`. Un test fija esas llaves exactas: agregar `createdAt` o `cancelledAt` rompe el test.

**Query de admin (nueva).** Vive en `src/lib/queries/admin-enrollment-audit.ts`:
```ts
export type AuditLabels = {
  bookedAt: string;             // created_at → 'DD/MM/YYYY, hh:mm A' CDMX ('Sin registro' si falta)
  cancelledAt: string | null;   // SOLO si status ∈ {cancelled, late_cancelled}; en otro caso null
};
export type AdminEnrollmentAuditRow = AuditLabels & {
  kind: 'titular' | 'guest';
  enrollmentId: string;
  name: string;
  detail: string;               // email del titular o «Invitado de {nombre}»
  status: EnrollmentStatus;
};

export function assertAdminViewer(viewer): asserts viewer is { role: 'admin' }; // lanza AdminAuditForbiddenError
export function toAuditLabels(status, createdAt, cancelledAt): AuditLabels;      // serializador único
export async function getClassEnrollmentAudit(classId, viewer): Promise<AdminEnrollmentAuditRow[]>;
```
- El contrato entrega **etiquetas ya formateadas en el servidor** (no ISO). Así no hay desajuste de zona horaria al hidratar y ningún componente cliente vuelve a formatear.
- **Defensa en profundidad:**
  1. La página admin redirige a quien no es admin.
  2. `getClassEnrollmentAudit` y `getClientData` (en `/admin/users/[userId]`) llaman `assertAdminViewer` **antes** de tocar la BD.
  3. `toAuditLabels` fuerza `cancelledAt = null` si el estado no es cancelado.
- `audit-import-boundary.test.ts` verifica que ningún archivo de `coach`, `client` ni `api` importe el módulo.
- `coach-queries-shape.test.ts` fija las llaves de las consultas de coach.
- **D5:** `/admin/users/[userId]` agrega `bookedAt`/`cancelledAt` a cada registro del historial usando `toAuditLabels`.

---

## 4. Frontend (panel admin)

### 4.1 Formato — `formatAuditDateTime(value)` en `src/lib/utils/date.ts`
- Salida exacta `DD/MM/YYYY, hh:mm A` en `America/Mexico_City`, por ejemplo `24/09/2026, 07:05 PM`.
- Se construye con `Intl.DateTimeFormat(..., { timeZone: TIMEZONE, hour12: true })` y `formatToParts`, normalizando el periodo a `AM`/`PM`. `es-MX` devuelve «p.m.», que no cumple el formato pedido.
- `null`, `undefined` o una fecha inválida devuelven `'Sin registro'`.
- El formateo ocurre **en el servidor**, dentro de `toAuditLabels`. Al cliente solo llega el string ya formateado.

### 4.2 Pantallas admin
- **`/admin/attendance/[classId]`:**
  - La página usa `getClassEnrollmentAudit(classId, session)` y deja de llamar `getCancelledEnrollments`.
  - **Inscritos activos:** «Reservó: …» bajo el nombre, tanto en la lista de clase futura como en `AttendanceSheet` (vía el prop opcional `bookedAtLabel`, que la página del coach no pasa).
  - **Invitados activos:** «Reservó: …» en `AdminGuestSection` (vía `bookedAtLabel`).
  - **Cancelaciones:** `CancellationAuditList` muestra titulares e invitados con «Reservó», «Canceló» (o «Sin registro») y el badge («Cancelación tardía» / «Canceló» / «Invitado»).
- **`/admin/users/[userId]` (D5):** cada registro del historial muestra «Reservó» y, solo si está cancelado, «Canceló».
- La página del coach **no cambia**.

---

## 5. Términos y Condiciones

### 5.1 Ruta (D3)
`/terminos-y-condiciones` (`src/app/terminos-y-condiciones/page.tsx`), que ya existía. Se reemplaza su §5 por la cláusula de abajo, adaptada al formato de la página (numerales 5.1–5.9). Se conserva lo que la versión anterior ya decía sobre *no-show* y control de cupos, y la fecha pasa a «Última actualización: 24 de septiembre de 2026». Los diálogos de cancelación tardía enlazan a esta página (art. 76 BIS).

### 5.2 Redacción de la cláusula (texto exacto a publicar)

> ⚠️ Esta redacción está alineada con la Ley Federal de Protección al Consumidor (LFPC): información veraz y clara (arts. 7 y 32), información previa en medios electrónicos (art. 76 BIS) y no inclusión de cláusulas abusivas (art. 90). **Debe revisarla un abogado antes de publicarse.** También hay que confirmar si el contrato de adhesión requiere registro ante PROFECO. No constituye asesoría legal.

**CLÁUSULA — POLÍTICA DE CANCELACIONES Y REEMBOLSO DE CRÉDITOS**

**1. Definiciones.** Para efectos de esta cláusula:
a) **«Reserva»** es el lugar que el Usuario aparta en una clase a través de la plataforma de The Lab Pilates Studio.
b) **«Crédito»** es cada sesión incluida en el paquete o membresía contratada por el Usuario, que se descuenta al realizar una Reserva.
c) **«Hora de la Reserva»** es la fecha y hora en que la plataforma registra la Reserva.
d) **«Hora de Inicio»** es la fecha y hora programada para el comienzo de la clase.
Todos los horarios se rigen por la hora oficial de la Ciudad de México (zona horaria America/Mexico_City), conforme al registro electrónico de la plataforma.

**2. Cancelación con anticipación.** El Usuario puede cancelar su Reserva desde la plataforma. Si la cancelación se realiza con al menos **veinticuatro (24) horas de anticipación** a la Hora de Inicio, el Crédito se reintegra en su totalidad a la suscripción con la que se hizo la Reserva, sin cargo ni penalización alguna.

**3. Periodo de tolerancia por error (10 minutos).** Con independencia de la anticipación con que se cancele, si el Usuario cancela su Reserva dentro de los **diez (10) minutos** naturales siguientes a la Hora de la Reserva, minuto diez incluido, el Crédito se reintegra **en su totalidad**, aun cuando falten menos de veinticuatro (24) horas para la Hora de Inicio. Este periodo sirve para corregir reservas hechas por error y aplica siempre que la clase no haya iniciado.

**4. Cancelación tardía.** Transcurrido el periodo de tolerancia de la sección 3, la cancelación que se realice con menos de veinticuatro (24) horas de anticipación a la Hora de Inicio se considera **cancelación tardía** y **no da derecho a la reposición del Crédito**, ya que el lugar permaneció reservado a nombre del Usuario y no pudo ofrecerse a otras personas. Antes de confirmar una cancelación tardía, la plataforma informará al Usuario que el Crédito no será reintegrado y requerirá su confirmación expresa.

**5. Clases iniciadas.** No es posible cancelar una Reserva después de la Hora de Inicio.

**6. Invitados.** Las reglas de las secciones 2 a 5 aplican también a los lugares reservados para invitados y al crédito de invitado correspondiente, contando el periodo de tolerancia a partir de la hora en que se registró al invitado.

**7. Cancelación por parte del Estudio.** Si The Lab Pilates Studio cancela una clase por cualquier causa, los Créditos de todas las Reservas afectadas se reintegran en su totalidad, sin que el Usuario deba solicitarlo.

**8. Registro y aclaraciones.** La plataforma conserva la fecha y hora de cada Reserva y de cada cancelación. Estos registros sirven para aplicar esta política. El Usuario puede solicitar su aclaración a través de los medios de contacto del Estudio.

**9. Derechos del consumidor.** Nada de lo previsto en esta cláusula limita ni restringe los derechos que la Ley Federal de Protección al Consumidor otorga al Usuario. El Usuario puede acudir a la Procuraduría Federal del Consumidor (PROFECO) para cualquier queja o reclamación.

**Correspondencia con el sistema:**
- La sección 3 corresponde a `isWithinGracePeriod`: `≤ 10 min`, inclusivo.
- Las secciones 2 y 4 corresponden a `hoursUntilClass >= 24`.
- La sección 5 corresponde al bloqueo por clase pasada.
- La sección 6 corresponde a los flujos de `guest.ts`.
- La sección 7 corresponde a `cancelClassAction`.

Si cambia una constante, debe cambiar este texto. La página interpola `GRACE_PERIOD_MINUTES` y `terminos-y-condiciones/__tests__/page.test.tsx` fija la redacción, de modo que el test detecta cualquier divergencia.

---

## 6. Criterios de aceptación

1. Toda transición a `cancelled`/`late_cancelled` en `class_enrolleds` deja `cancelled_at` igual al `now()` de la BD. Un reintento no la sobreescribe ni reembolsa dos veces.
2. Tanto la cancelación a tiempo como la de gracia conservan la fila, así que la auditoría existe en todos los casos.
3. Tras cancelar, la misma persona puede volver a reservar la misma clase sin error `23505` (D1).
4. Ventana de gracia: con 10:00 min se reembolsa; con 10:00.001 min y < 24 h es tardía sin reembolso; con ≥ 24 h se reembolsa siempre.
5. Solo `admin` recibe `bookedAt`/`cancelledAt`. Las queries de coach y client no contienen esas llaves, y la query admin lanza error si el rol es `coach` o `client`.
6. El panel admin muestra ambas fechas en el formato `DD/MM/YYYY, hh:mm A` de CDMX. «Canceló» solo aparece en filas canceladas, y las filas históricas sin dato muestran «Sin registro».
7. `/terminos-y-condiciones` muestra la cláusula de §5.2 y los diálogos de cancelación tardía enlazan a ella.

## 7. Fuera de alcance
- Backfill de `cancelled_at` histórico.
- Registro de *quién* canceló (`cancelled_by`). Se puede agregar después como columna aditiva.
- Eventos especiales (`admin-events.ts`): no escriben en `class_enrolleds`.
- El resto del contenido legal de Términos, Aviso de Privacidad y registro ante PROFECO.

## 8. Decisiones (confirmadas 2026-09-24)

| ID | Decisión |
|---|---|
| **D1** | **A:** reactivar la fila cancelada al volver a reservar. No hay DDL sobre el índice. Se acepta perder la auditoría del ciclo anterior. |
| **D2** | **Sí:** `guest_enrollments.cancelled_at`, y el admin ve también las cancelaciones de invitados. |
| **D3** | Ruta existente `/terminos-y-condiciones`. |
| **D4** | **Sí:** «Reservó» en inscritos e invitados activos. |
| **D5** | **Sí:** fechas de reserva y cancelación en `/admin/users/[userId]`. |
