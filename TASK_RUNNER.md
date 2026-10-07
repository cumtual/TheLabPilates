# TASK-SP — Paquetes especiales y catálogo de suscripciones

**Estado:** ✅ Ejecutado (2026-10-07). Suite 951/951 (128 archivos, +188 tests), `tsc` limpio, `next build` compila (el prerender de `/` espera los scripts SQL), lint 60 problemas (base: 61, ninguno nuevo). **Pendiente (usuario):** TASK-SP-DB-04, revisión legal y E2E manual de TASK-SP-VERIFY-01. Ajustes al diseño: SPEC §13.
**Especificación:** `SPEC-SPECIAL-PACKAGES.md` v2 (decisiones D1–D7 en §0.1 y S1–S3 en §0.2, todas confirmadas).
**Rama:** `feat/special-packages`, desde `feat/sculpt-class` (commit `24d937e`).
**Runner:** Vitest. `pnpm test <ruta>` equivale a `vitest run <ruta>`.
**Ciclo por tarea:** 🔴 escribir los tests y verlos fallar por la razón correcta → 🟢 el código mínimo para que pasen → 🔵 refactor con la suite en verde. Una tarea no empieza hasta que la anterior está en verde. Mismas reglas que la sección TASK-QR (abajo).
**Restricción de BD:** ninguna tarea ejecuta comandos contra la BD. `TASK-SP-DB-04` la ejecuta el usuario.
**Tiempo de los tests:** `vi.useFakeTimers()` y `vi.setSystemTime(new Date('2026-10-07T10:00:00.000-06:00'))` en todo test que dependa de la hora.

## Matriz de trazabilidad

| Requisito | Tareas | Tests |
|---|---|---|
| Validación de disciplina | DOM-02, BE-02 | `rules.test.ts`, `enrollment-special-package.test.ts` |
| Franja horaria CDMX (D1) | DOM-01, DOM-02, BE-02 | `date-minutes-of-day.test.ts`, `rules.test.ts` |
| «1 de [Mat \| Barre]» excluyente | DOM-02, BE-02 | `rules.test.ts`, `enrollment-special-package.test.ts` (traza Reset Pass) |
| Bloqueo de clase duplicada en paquete combinado | BE-02 | `enrollment-special-package.test.ts` |
| Concurrencia y atomicidad | BE-01, BE-02, BE-03 | `credits.test.ts`, `enrollment-special-package.test.ts` |
| Expiración dinámica (D3) | BE-05 | `confirm-payment-validity.test.ts` |
| Una sola suscripción activa (D2, S3) | BE-05, CLI-02 | `confirm-payment-validity.test.ts`, `ActiveSubscriptionWarning.test.tsx` |
| Copia al comprar (D4) | BE-04, BE-09 | `purchase-snapshot.test.ts`, `admin-packages.test.ts` |
| Ajuste manual por grupo (D5) | BE-06, ADM-05 | `admin-credit-adjust.test.ts` |
| Pases de invitado (D6) | BE-07 | `guest-allowance.test.ts`, `guest-special-package.test.ts` |
| Catálogo en BD y compatibilidad (D7) | DB-02, LND-01, LND-02 | `catalog-compat-backfill.test.ts`, `PackageCard.test.tsx`, `Pricing.test.tsx` |
| Descripción < 50 y máximo 4 beneficios | DOM-03, DB-01, ADM-03 | `package-schema.test.ts`, `special-packages-migration.test.ts`, `PackageForm.test.tsx` |
| Un solo escritor de créditos (INV-3) | BE-08 | `credit-writers.test.ts` |

---

## Fase 0 · Preparación

### TASK-SP-SETUP-01 · Zod como dependencia directa
- **Archivos:** `package.json`, `pnpm-lock.yaml`
- **Descripción:** `pnpm add zod@4.4.3`. Es la versión que ya está en el lockfile como dependencia indirecta, así que no descarga nada nuevo.
- **Test 🔴:** `src/__tests__/dependencies.test.ts` verifica que `package.json` declare `zod` en `dependencies` y que `import { z } from 'zod'` resuelva a la versión 4.
- **Verificar:** `pnpm test src/__tests__/dependencies.test.ts`

---

## Fase 1 · Base de datos y migración segura

### TASK-SP-DB-01 · DDL aditivo
- **Archivos:** `sql/manual/2026-10-07_001_special_packages.sql`, `src/db/__tests__/special-packages-migration.test.ts`
- **Descripción:** el script de SPEC §3.1, tal cual.
- **Tests 🔴** (ignorando las líneas de comentario):
  1. Cada columna nueva usa `ADD COLUMN IF NOT EXISTS`; cada tabla `CREATE TABLE IF NOT EXISTS`; cada índice `CREATE INDEX IF NOT EXISTS`.
  2. Cada `ADD CONSTRAINT` está dentro de un `IF NOT EXISTS (SELECT 1 FROM pg_constraint …)`.
  3. Hay `BEGIN;`, `SET LOCAL lock_timeout` y `COMMIT;`.
  4. No contiene `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `INSERT`, `ALTER TYPE`, `RENAME` ni `SET NOT NULL`.
  5. Contiene `cardinality(features) <= 4`, `short_description varchar(49)` y `kind <> 'special' OR guest IS NOT TRUE`.
  6. Toda columna nueva de `user_suscriptions` y `class_enrolleds` es `NULL` y sin `DEFAULT`.
- **Verificar:** `pnpm test src/db/__tests__/special-packages-migration.test.ts`

### TASK-SP-DB-02 · Script de compatibilidad y carga del catálogo (D7)
- **Archivos:** `sql/manual/2026-10-07_002_catalog_compat_backfill.sql`, `src/db/__tests__/catalog-compat-backfill.test.ts`, `src/db/__tests__/fixtures/pricing-legacy.ts` (copia de los datos actuales de `Pricing.tsx`, antes de borrarlos)
- **Descripción:** el script de SPEC §3.3 con sus consultas previas y de verificación comentadas.
- **Tests 🔴:**
  1. Cada `UPDATE` incluye `AND short_description IS NULL`.
  2. El único `INSERT` es el alta de paquetes de la landing (S2) y está protegido con `WHERE NOT EXISTS (… s.name = v.name)`; sus valores (`name`, `sessions`, `guest`, `price`) coinciden con el fixture.
  3. No contiene `DELETE`, `DROP` ni `TRUNCATE`, y ningún `UPDATE` cambia `sessions`, `guest` ni `price`.
  4. Ninguna sentencia toca `user_suscriptions` ni `class_enrolleds`: los snapshots en `NULL` son lo que mantiene el comportamiento actual.
  5. Los textos de cada paquete coinciden con el fixture (`tagline` → `short_description`, `features`, `premium` → `is_featured`).
  6. Cada descripción tiene ≤ 49 caracteres, cada arreglo ≤ 4 elementos y cada beneficio ≤ 24, validado con `packageInputSchema` de DOM-03.
- **Verificar:** `pnpm test src/db/__tests__/catalog-compat-backfill.test.ts`

### TASK-SP-DB-03 · Esquema Drizzle
- **Archivos:** `src/db/schema.ts`, `src/db/relations.ts`, `src/db/__tests__/schema-special-packages.test.ts`
- **Descripción:** espejo exacto de SPEC §3.2.
- **Tests 🔴:**
  1. `getTableColumns(subscriptions)` tiene las 10 columnas nuevas con su nombre SQL, `notNull` y default.
  2. `subscriptionRules.allowedClassTypes` y `userSubscriptionBalances.allowedClassTypes` son arreglos del enum `class_type`.
  3. `priceSnapshot`, `validityDaysSnapshot`, `guestCreditsSnapshot` y `classEnrollments.balanceId` son nullable y sin default.
  4. Las columnas del esquema coinciden con las del script 001: se extraen los nombres del SQL y se comparan.
- **Verificar:** `pnpm test src/db/__tests__/schema-special-packages.test.ts && npx tsc --noEmit`

### TASK-SP-DB-04 · Ejecución en producción (USUARIO)
1. Consultas de solo lectura de SPEC §3.3: nombres y precios del catálogo, y usuarios con más de una suscripción activa.
2. Script 001, después 002 y después su verificación. Los dos se pueden repetir sin efecto.
3. Deploy, solo después de lo anterior (SPEC §3.4).

---

## Fase 2 · Backend y lógica de negocio

### TASK-SP-DOM-01 · Hora del día en CDMX
- **Archivos:** `src/lib/utils/date.ts` (`getMexicoCityMinutesOfDay`), `src/lib/utils/__tests__/date-minutes-of-day.test.ts`
- **Tests 🔴:**
  1. `2026-10-07T13:00:00Z` → 420 (07:00 CDMX).
  2. `2026-10-07T17:00:00Z` → 660 (11:00).
  3. `2026-10-08T05:59:00Z` → 1439 (23:59 del día 7 en CDMX).
  4. No depende de la zona del servidor: el resultado es el mismo con `process.env.TZ` igual a `UTC` y a `Asia/Tokyo`.
- **Verificar:** `pnpm test src/lib/utils/__tests__/date-minutes-of-day.test.ts`

### TASK-SP-DOM-02 · Reglas puras de disciplina y franja
- **Archivos:** `src/lib/subscription/rules.ts`, `src/lib/subscription/__tests__/rules.test.ts`
- **Descripción:** las funciones de SPEC §5.2 y `explainRejection` de §5.4.
- **Tests 🔴:**
  1. **Disciplina:** un balance de `[yoga]` no sirve para `barre`; uno de `[mat_pilates, barre]` sirve para las dos.
  2. **Franja (D1):** con 07:00–11:00, las clases de 07:00 y 11:00 entran; las de 06:59 y 11:01 no. Sin franja entra cualquier hora.
  3. **Excluyente:** con A=1×[yoga] y B=1×[mat_pilates, barre], Mat elige B. Con B en 0, Barre y Mat → `null`, y Yoga → A.
  4. **Más restrictivo:** con A=1×[yoga] y C=1×[yoga, barre], Yoga elige A. Entre dos grupos de `[yoga]`, el que tiene franja va primero.
  5. **Propiedad (fast-check):** sobre balances y clases arbitrarios, si `pickBalanceForClass` devuelve un grupo, ese grupo es utilizable; si devuelve `null`, ninguno lo es.
  6. **Propiedad:** el resultado es igual con cualquier permutación de los balances.
  7. `explainRejection` devuelve cada código de §5.4 con su mensaje exacto, y respeta el orden de prioridad (un caso por cada combinación).
  8. `describeBalance`: «1 clase de Yoga», «2 clases de Mat Pilates / Barre», y respeta `label` si existe.
- **Verificar:** `pnpm test src/lib/subscription/__tests__/rules.test.ts`

### TASK-SP-DOM-03 · Esquema Zod del paquete
- **Archivos:** `src/lib/subscription/package-schema.ts`, `src/lib/subscription/__tests__/package-schema.test.ts`
- **Descripción:** el esquema de SPEC §4.1.
- **Tests 🔴** (cada límite con su caso válido y el inválido justo afuera):
  1. Descripción de 49 caracteres → válida; de 50 → error «La descripción debe tener menos de 50 caracteres.»; vacía o solo espacios → error.
  2. 4 beneficios → válido; 5 → «Máximo 4 beneficios.»; un beneficio de 25 caracteres → error; «Yoga» y «yoga» → «No repitas beneficios.»
  3. Vigencia: 2 semanas → 14 días; 365 días → válida; 53 semanas → error.
  4. `special` sin reglas → error; 7 reglas → error; disciplina repetida → error; disciplina fuera de `CLASS_TYPES` → error.
  5. Franja `11:00–07:00` → error en `rules.0.timeWindow.end`; `7:00` → error de formato.
  6. `guestCredits` 11 → error.
  7. `standard` exige `sessions`; `special` no lo acepta como entrada.
  8. La ruta de cada error se convierte en la clave esperada de `fieldErrors` (helper `toFieldErrors(zodError)`).
- **Verificar:** `pnpm test src/lib/subscription/__tests__/package-schema.test.ts`

### TASK-SP-BE-01 · Módulo de créditos (transaccional)
- **Archivos:** `src/lib/subscription/credits.ts`, `src/lib/subscription/__tests__/credits.test.ts`
- **Descripción:** las funciones de SPEC §5.5. Las consultas se verifican con `new PgDialect().sqlToQuery(...)`.
- **Tests 🔴:**
  1. `consumeClassCredit` en un especial: bloquea `user_suscriptions` con `FOR UPDATE` **antes** de leer los balances (INV-5), y emite los dos UPDATE con las guardas `credits_remaining > 0` y `days_remaining > 0`.
  2. Si cualquiera de los dos UPDATE devuelve 0 filas, lanza `BookingRejection` y no sigue escribiendo.
  3. Open Lab no escribe nada; `standard` solo hace `days_remaining - 1`.
  4. `restoreEnrollmentCredit`: con `balance_id`, `+1` a los dos con la guarda `credits_remaining < credits_total`. Sin `balance_id` en Open Lab, nada (H14). Con la suscripción inactiva, devuelve `'subscription_inactive'` sin escribir (S1).
  5. `snapshotPackage` copia precio, `validity_days ?? 30` y `guest_credits`, e inserta un balance por regla con `credits_remaining = 0`.
  6. `activateBalances` deja `credits_remaining = credits_total`.
  7. `expireOtherActiveSubscriptions` excluye `keepId` y pone en 0 los grupos de las demás.
  8. **Propiedad (fast-check, modelo en memoria):** en cualquier secuencia de consumos y reintegros, `days_remaining === Σ credits_remaining` y ningún saldo baja de 0 ni supera el total (INV-1).
- **Verificar:** `pnpm test src/lib/subscription/__tests__/credits.test.ts`

### TASK-SP-BE-02 · Motor de reserva por disciplina
- **Archivos:** `src/actions/enrollment.ts`, `src/lib/types/actions.ts` (`EnrollmentActionResult`, `BookingRejectionCode`), `src/actions/__tests__/enrollment-special-package.test.ts`; se ajustan los mocks de `enrollment*.test.ts`.
- **Descripción:** el algoritmo de SPEC §5.3.
- **Tests 🔴:**
  1. **Traza del Reset Pass:** los 6 pasos de la tabla de SPEC §5.3, con su `code`, su mensaje y el `balance_id` guardado.
  2. **Disciplina:** una clase de Sculpt con un paquete sin Sculpt → `CLASS_TYPE_NOT_INCLUDED` y ningún INSERT.
  3. **Franja:** Yoga a las 11:00 con franja 07:00–11:00 → reservada; a las 11:01 → `OUTSIDE_TIME_WINDOW`.
  4. **Clase duplicada en paquete combinado:** con el grupo B de 2 créditos, reservar la **misma** clase de Mat dos veces → la segunda da `ALREADY_ENROLLED` y el saldo de B baja una sola vez.
  5. **Concurrencia:** se simula que, bajo el bloqueo, la relectura de los balances devuelve B en 0 (otra pestaña ganó la carrera) → rollback con `GROUP_EXHAUSTED`, sin INSERT y sin decrementos.
  6. **Atomicidad:** si el UPDATE de `days_remaining` devuelve 0 filas → rollback, sin INSERT de la reserva.
  7. Reactivar una fila cancelada también guarda `balance_id`.
  8. **Regresión:** los tests actuales de `enrollment*.test.ts` para `standard` y Open Lab pasan sin cambiar sus expectativas.
- **Verificar:** `pnpm test src/actions/__tests__/enrollment*.test.ts`

### TASK-SP-BE-03 · Reembolsos automáticos por grupo
- **Archivos:** `src/actions/enrollment.ts` (`refundEnrollment`), `src/actions/admin.ts` (`cancelClassAction`, `suspendSubscriptionAction`), `src/actions/__tests__/special-package-refunds.test.ts`
- **Tests 🔴:**
  1. Una cancelación a tiempo (más de 24 h, o dentro de los 10 min de gracia) devuelve el crédito al grupo de `balance_id`.
  2. Una cancelación tardía no devuelve nada (`late_cancelled`).
  3. Dos cancelaciones concurrentes de la misma reserva reintegran una sola vez (la guarda `status='pending'` ya existe).
  4. Cancelar la clase devuelve a cada alumno su grupo; en Open Lab no toca `days_remaining` (H14).
  5. **S1:** si la suscripción fue reemplazada, la cancelación del cliente (a tiempo o tardía) se hace sin reintegro y con el mensaje acordado.
  6. **S1, excepción:** si el Estudio cancela la clase, esas reservas se cancelan sin reintegro automático y `data.manualRestore` lista a esos alumnos; las de suscripciones vigentes se reintegran normal.
  7. **Regresión:** `enrollment-cancellation.test.ts`, `grace-period-cancellation.test.ts` y `admin-class.test.ts` siguen en verde.
- **Verificar:** `pnpm test src/actions/__tests__/special-package-refunds.test.ts src/actions/__tests__/enrollment-cancellation.test.ts src/actions/__tests__/admin-class.test.ts`

### TASK-SP-BE-04 · Compra con copia (D4)
- **Archivos:** `src/actions/subscription.ts`, `src/actions/__tests__/purchase-snapshot.test.ts`
- **Tests 🔴:**
  1. Un paquete inexistente, inactivo o borrado → «Este paquete ya no está disponible.» y nada insertado (H9).
  2. La compra guarda `price_snapshot`, `validity_days_snapshot` (30 si es `NULL`) y `guest_credits_snapshot` en la misma transacción que el pago.
  3. Un especial inserta un balance por regla con `credits_remaining = 0`.
  4. La suscripción activa del usuario no cambia (S3).
  5. **Regresión:** se mantienen el bloqueo por pago pendiente y la expiración de suspendidas.
- **Verificar:** `pnpm test src/actions/__tests__/purchase-snapshot.test.ts src/actions/__tests__/subscription*.test.ts`

### TASK-SP-BE-05 · Expiración dinámica y suscripción única (D2, D3)
- **Archivos:** `src/actions/admin.ts` (`confirmPaymentAction`, `reactivateSubscriptionAction`), `src/actions/__tests__/confirm-payment-validity.test.ts`
- **Tests 🔴:**
  1. Con `validity_days_snapshot = 14` aprobado el 2026-10-07 a las 10:00 CDMX, `expiration_date` = `NOW() + make_interval(days => 14)`, verificado en el SQL con `sqlToQuery`.
  2. Con el snapshot `NULL` (suscripción anterior), el SQL usa `COALESCE(…, 30)`.
  3. Un especial activa sus balances en la misma transacción.
  4. Otra suscripción activa del mismo usuario queda `expired`, con `active=false` y `days_remaining=0`; la nueva queda activa (D2, S3).
  5. Si la transacción falla, la suscripción anterior sigue activa.
  6. La reactivación usa la vigencia copiada.
- **Verificar:** `pnpm test src/actions/__tests__/confirm-payment-validity.test.ts src/actions/__tests__/admin*.test.ts`

### TASK-SP-BE-06 · Ajustes manuales por grupo (D5)
- **Archivos:** `src/actions/admin.ts` (`refundSessionCreditAction`, `decrementSubscriptionCreditAction`), `src/actions/__tests__/admin-credit-adjust.test.ts`
- **Tests 🔴:**
  1. En un especial sin `balanceId` → «Selecciona el grupo de créditos.» con `field: 'balanceId'`.
  2. Un `balanceId` de otra suscripción → error y nada escrito.
  3. +1 y −1 ajustan el grupo y Σ juntos; −1 hasta llegar a 0 en total expira la suscripción.
  4. +1 sobre un grupo lleno → error «Ese grupo ya tiene todos sus créditos.»
  5. **Regresión:** en `standard` el comportamiento no cambia.
- **Verificar:** `pnpm test src/actions/__tests__/admin-credit-adjust.test.ts`

### TASK-SP-BE-07 · Pases de invitado (D6)
- **Archivos:** `src/lib/guest/eligibility.ts`, `src/lib/guest/credits.ts`, `src/actions/guest.ts`, `src/lib/guest/__tests__/guest-allowance.test.ts`, `src/actions/__tests__/guest-special-package.test.ts`
- **Tests 🔴:**
  1. Especial con N=2: dos invitados → OK; el tercero se rechaza.
  2. Cancelar un invitado a tiempo restaura exactamente 1 y borra solo la fila con su `guest_enrollment_id` (H10).
  3. El titular consume su crédito de grupo (con las reglas de BE-02) y el invitado uno de invitado.
  4. Especial con N=0 y `standard` → `getGuestAllowance` devuelve `null`.
  5. **Regresión:** los tests actuales de `guest*.test.ts` y `admin-guest.test.ts` (Open Lab) pasan sin cambiar sus expectativas.
- **Verificar:** `pnpm test src/lib/guest src/actions/__tests__/guest*.test.ts src/actions/__tests__/admin-guest.test.ts`

### TASK-SP-BE-08 · Guarda estructural INV-3
- **Archivos:** `src/__tests__/credit-writers.test.ts`
- **Test 🔴:** recorre `src/actions` y `src/lib` (sin `__tests__`) y falla si algún archivo distinto de `lib/subscription/credits.ts` escribe `days_remaining`, `daysRemaining`, `credits_remaining`, `creditsRemaining` o `balanceId` dentro de `set(`, `SET ` o `values(`.
- **Verificar:** `pnpm test src/__tests__/credit-writers.test.ts`

### TASK-SP-BE-09 · Server Actions del catálogo
- **Archivos:** `src/actions/admin-packages.ts`, `src/lib/types/actions.ts` (`FormActionResult`), `src/actions/__tests__/admin-packages.test.ts`
- **Descripción:** las cuatro acciones de SPEC §4.3.
- **Tests 🔴:**
  1. Coach y client reciben «No tienes permisos para esta acción.» sin que se llame a la BD.
  2. Una entrada inválida devuelve `fieldErrors` con las claves de Zod y no escribe nada.
  3. Crear un especial inserta el catálogo con `guest=false` y `sessions=Σ`, más sus reglas, en una transacción.
  4. Editar con un `kind` distinto → error en `kind`.
  5. Editar reemplaza solo las reglas de **ese** paquete y no escribe en `user_subscription_balances` ni en `user_suscriptions` (D4).
  6. Marcar `isFeatured` desmarca a los demás en la misma transacción.
  7. Eliminar hace `deleted_at=now()` e `is_active=false`. Un test estático confirma que **ningún** archivo de `src/` llama `db.delete(subscriptions)`.
  8. Todas las acciones exitosas llaman `revalidatePath('/')`, `('/client/subscription')` y `('/admin/packages')`.
- **Verificar:** `pnpm test src/actions/__tests__/admin-packages.test.ts`

### TASK-SP-Q-01 · Modelos de lectura
- **Archivos:** `src/lib/queries/packages.ts`, `src/lib/queries/__tests__/packages.test.ts`
- **Descripción:** las funciones y tipos de SPEC §4.4.
- **Tests 🔴:**
  1. `getPublicPackages` filtra `is_active AND deleted_at IS NULL` y ordena por `display_order, price` (verificado con `sqlToQuery`).
  2. `toPackageCardView`: «∞ Open Lab» y «ACCESO ILIMITADO» para `guest`; «UNA SESIÓN»; «8 SESIONES»; «1 YOGA · 1 MAT PILATES / BARRE»; precio `1,850`; «Vigencia: 2 semanas» para 14 días; `ctaLabel` «RESERVAR TODO» solo si es ilimitado y destacado.
  3. `getAdminPackages` lanza un error si quien consulta no es admin, antes de tocar la BD.
  4. `getClientSubscriptionView` arma el estado `special` con `summary`, `timeWindow` («07:00–11:00»), `exhausted` y `guestCredits`; para `standard` y Open Lab devuelve lo mismo que hoy.
- **Verificar:** `pnpm test src/lib/queries/__tests__/packages.test.ts`

---

## Fase 3 · UI Admin

### TASK-SP-ADM-01 · Entrada «Paquetes» en el menú
- **Archivos:** `src/components/layout/PortalNav.tsx`, `src/components/layout/__tests__/PortalNav.test.tsx`
- **Tests 🔴:** con rol admin aparece «Paquetes» con `href="/admin/packages"` entre «Pagos» y «Clases»; con coach y client no aparece.
- **Verificar:** `pnpm test src/components/layout/__tests__/PortalNav.test.tsx`

### TASK-SP-ADM-02 · Listado de paquetes
- **Archivos:** `src/app/(portal)/admin/packages/page.tsx`, `src/components/admin/packages/PackageList.tsx` y sus tests
- **Tests 🔴:**
  1. La página redirige a quien no es admin.
  2. Se muestran orden, nombre, badge «Especial» o «Estándar», precio, vigencia, ventas y estado.
  3. Activar/Desactivar llama a `setPackageActiveAction` y muestra el mensaje.
  4. Eliminar abre la confirmación con el texto de SPEC §7.2 y solo llama a `softDeletePackageAction` al confirmar.
  5. Sin paquetes aparece «Aún no hay paquetes.»
- **Verificar:** `pnpm test src/components/admin/packages/__tests__/PackageList.test.tsx "src/app/(portal)/admin/packages"`

### TASK-SP-ADM-03 · Formulario con límites (50 caracteres y 4 beneficios)
- **Archivos:** `src/app/(portal)/admin/packages/new/page.tsx`, `src/app/(portal)/admin/packages/[id]/edit/page.tsx`, `src/components/admin/packages/PackageForm.tsx`, `src/components/admin/packages/__tests__/PackageForm.test.tsx`
- **Tests 🔴:**
  1. El campo de descripción tiene `maxLength=49`; el contador muestra «49/49» al llegar al límite.
  2. Al pegar 50 caracteres o más, el valor se recorta a 49 y aparece el mensaje de Zod.
  3. Con 4 beneficios, «Agregar beneficio» queda deshabilitado y aparece «Máximo 4 beneficios»; al quitar uno se vuelve a habilitar.
  4. Vigencia de 2 semanas muestra «= 14 días».
  5. El tipo solo se elige al crear; al editar se muestra como texto.
  6. Los `fieldErrors` del servidor aparecen bajo su campo.
  7. Con `salesCount > 0` aparece el aviso «Los cambios aplican solo a compras nuevas.»
  8. Envía un objeto `PackageInput` a la acción correcta (crear o editar).
- **Verificar:** `pnpm test src/components/admin/packages/__tests__/PackageForm.test.tsx`

### TASK-SP-ADM-04 · Constructor de reglas y vista previa
- **Archivos:** `src/components/admin/packages/PackageRulesBuilder.tsx`, `src/components/sections/PackageCard.tsx` (de LND-01), tests
- **Tests 🔴:**
  1. Solo aparece en paquetes especiales.
  2. Las casillas de disciplinas vienen de `CLASS_TYPES` (incluye Sculpt).
  3. El interruptor «Limitar horario» muestra y oculta los dos campos de hora.
  4. Agregar y quitar grupos, entre 1 y 6.
  5. «Sesiones del paquete» muestra Σ de créditos.
  6. La vista previa `PackageCard` cambia con cada edición.
- **Verificar:** `pnpm test src/components/admin/packages/__tests__/PackageRulesBuilder.test.tsx`

### TASK-SP-ADM-05 · Desglose y selector de grupo en suscripciones de clientes (D5)
- **Archivos:** `src/components/admin/SubscriptionManagement.tsx`, `src/app/(portal)/admin/subscriptions/page.tsx`, tests
- **Tests 🔴:** una suscripción especial muestra sus grupos con saldo/total; +1 y −1 abren el selector y envían `balanceId`; las suscripciones `standard` no cambian.
- **Verificar:** `pnpm test src/components/admin/__tests__/SubscriptionManagement*.test.tsx`

---

## Fase 4 · UI Cliente

### TASK-SP-CLI-01 · Desglose de créditos en el dashboard
- **Archivos:** `src/app/(portal)/client/page.tsx`, `src/components/client/CreditBalances.tsx`, `src/components/client/__tests__/CreditBalances.test.tsx`
- **Tests 🔴:**
  1. Con el Reset Pass sin usar se muestran «1 clase de Yoga» y «1 clase de Mat Pilates / Barre».
  2. Después de usar Mat, el grupo B aparece atenuado con «0 de 1 · Mat Pilates / Barre» y la etiqueta «Usada».
  3. Un grupo con franja muestra «Solo de 07:00 a 11:00».
  4. El encabezado muestra el paquete, «Vence DD/MM/YYYY» y «Te quedan N clases».
  5. Aparece la fila de pases de invitado si aplica.
  6. **Regresión:** `standard` y Open Lab renderizan igual que hoy (tests actuales del dashboard en verde).
- **Verificar:** `pnpm test src/components/client/__tests__/CreditBalances.test.tsx "src/app/(portal)/client/__tests__"`

### TASK-SP-CLI-02 · Tienda y aviso de cambio de paquete
- **Archivos:** `src/app/(portal)/client/subscription/page.tsx`, `src/components/client/SubscriptionCard.tsx`, `src/components/client/ActiveSubscriptionWarning.tsx` y sus tests
- **Tests 🔴:**
  1. Solo se listan los paquetes de `getPublicPackages()`.
  2. La tarjeta de un especial muestra el desglose y la vigencia.
  3. El aviso **no** contiene «se acumularán» y sí el texto de SPEC §6.2 con nombre, créditos y fecha.
- **Verificar:** `pnpm test src/components/client/__tests__/SubscriptionCard.test.tsx src/components/client/__tests__/ActiveSubscriptionWarning.test.tsx`

### TASK-SP-CLI-03 · Indicador de crédito en la lista de clases
- **Archivos:** `src/components/client/ClassList.tsx`, `src/app/(portal)/client/classes/page.tsx`, tests
- **Tests 🔴:** una clase reservable muestra «Usa: 1 clase de Yoga»; una no reservable tiene el botón deshabilitado y el mensaje de `explainRejection`; con `standard` y Open Lab no cambia nada.
- **Verificar:** `pnpm test src/components/client/__tests__/ClassList*.test.tsx`

---

## Fase 5 · Landing

### TASK-SP-LND-01 · `PackageCard` idéntica a la tarjeta actual
- **Archivos:** `src/components/sections/PackageCard.tsx`, `src/components/sections/pricing-grid.ts` (`getPricingGridClass`), `src/components/sections/__tests__/PackageCard.test.tsx`, `src/components/sections/__tests__/pricing-grid.test.ts`
- **Paso previo:** **antes** de tocar `Pricing.tsx`, se guarda su HTML actual como fixture (`__tests__/fixtures/pricing-legacy.html`).
- **Tests 🔴:**
  1. **Equivalencia:** con los 5 paquetes del fixture convertidos a `PackageCardView`, el HTML de las 5 `PackageCard` es idéntico al de las tarjetas del fixture, salvo las clases de protección (`line-clamp-2`, `truncate`) y el atributo `title`.
  2. La variante destacada usa `bg-warm-wood`, `scale-105`, el badge «PREMIUM» y el ícono `all_inclusive`; la normal usa `check`.
  3. Una descripción de 49 caracteres tiene `line-clamp-2`; cada beneficio tiene `truncate` y `title`.
  4. Nunca se renderizan más de 4 beneficios.
  5. `getPricingGridClass`: una prueba por fila de la tabla de SPEC §9. Con 5 devuelve exactamente `grid-cols-1 md:grid-cols-3 lg:grid-cols-5` (igual que hoy).
- **Verificar:** `pnpm test src/components/sections/__tests__/PackageCard.test.tsx src/components/sections/__tests__/pricing-grid.test.ts`

### TASK-SP-LND-02 · `Pricing` lee la BD
- **Archivos:** `src/components/sections/Pricing.tsx`, `src/components/sections/__tests__/Pricing.test.tsx`
- **Tests 🔴** (con `getPublicPackages` simulado):
  1. Renderiza los paquetes en el orden recibido.
  2. Un paquete inactivo no aparece: se verifica que el filtro esté en la consulta (Q-01) y que el componente no haga otra consulta.
  3. Sin paquetes, se conservan el encabezado y el ancla `#paquetes`, y aparece «Pronto anunciaremos nuestros paquetes.»
  4. Con un especial aparecen su desglose y «+N Invitados».
  5. El contenedor usa `getPricingGridClass(n)`.
- **Manual:** en el navegador integrado, revisar 375, 768 y 1280 px con 1, 5 y 8 paquetes.
- **Verificar:** `pnpm test src/components/sections/__tests__/Pricing.test.tsx`

---

## Fase 6 · Cierre

### TASK-SP-LEGAL-01 · Términos y Condiciones — ✅ Ejecutada (2026-10-07)
- **Archivos:** `src/app/terminos-y-condiciones/page.tsx`, `src/app/terminos-y-condiciones/__tests__/page.test.tsx`
- **Tests (🔴 6 fallando → 🟢 11/11):**
  1. §3: vigencia de «treinta (30) días naturales contados a partir de la confirmación del pago» y vencimiento cuando «concluyan las clases ya reservadas».
  2. §3: «Paquetes especiales» con vigencia propia, «Mat Pilates o Barre», «hora de inicio de la clase», créditos «no son intercambiables entre grupos» y «pases de invitado».
  3. §3: «Cambio de paquete» con «una sola suscripción vigente», «al confirmarse el pago», «no son reembolsables ni transferibles», reservas que «se conservan» y crédito que «no se reintegra».
  4. §3: «condiciones publicadas al momento de la compra». §4: «precio vigente al momento de registrar la compra».
  5. §5: «mismo grupo de disciplinas» y «ya no está vigente, el Estudio repondrá la sesión».
  6. `lastUpdated` = «7 de octubre de 2026».
- **Pendiente (usuario):** revisión legal de la cláusula de cambio de paquete.
- **Verificar:** `pnpm test src/app/terminos-y-condiciones/__tests__/page.test.tsx`

### TASK-SP-DOC-01 · Documentación
- ✅ `CLAUDE.md` (2026-10-07): tablas nuevas, `class_type` con `sculpt`, ciclo de vida corregido (créditos agotados, una sola suscripción activa, precios y condiciones fijados al comprar), catálogo de paquetes, reglas de paquetes especiales (INV-1, INV-3, INV-5) y permisos de tipos de clase por rol.
- Pendiente al cerrar: marcar `SPEC-SPECIAL-PACKAGES.md` y esta sección como ejecutadas, con resultados.

### TASK-SP-VERIFY-01 · Verificación final
- **Comandos:** `pnpm test`, `npx tsc --noEmit`, `pnpm build` y `pnpm lint` (sin problemas nuevos respecto a la base: hoy hay 61, con 20 errores y 41 advertencias).
- **E2E manual (usuario, en una BD que no sea de producción):**
  1. Crear «Reset Pass» ($179, 2 semanas, A = 1×Yoga, B = 1×Mat/Barre) y verlo en la landing.
  2. Comprarlo como cliente, confirmar el pago y comprobar que vence en 14 días.
  3. Reservar Mat; intentar Barre (rechazo con mensaje); reservar Yoga.
  4. Cancelar Mat a tiempo y ver que el crédito vuelve al grupo B en el dashboard.
  5. Comprar otro paquete y confirmarlo: el anterior queda vencido.
  6. Editar el precio del Reset Pass: el pago anterior conserva su monto.
  7. Desactivar el paquete: desaparece de la landing y de la tienda.

---

# TASK-CA — Auditoría de cancelaciones + Términos (regla de 10 min)

**Estado:** ✅ Ejecutado (2026-09-24). Suite: 732/732 tests (94 archivos), `tsc` limpio, `pnpm build` OK y `pnpm lint` sin problemas nuevos (los 7 que aparecen en `admin-guest.test.ts` y `guest.ts` ya existían en `HEAD`). **Pendiente (usuario):** TASK-CA-DB-02 y el E2E manual de TASK-CA-VERIFY-01.
**Decisiones confirmadas:**
- **D1-A:** reactivar la fila cancelada.
- **D2:** también se audita `guest_enrollments`.
- **D3:** se usa la página existente `/terminos-y-condiciones`.
- **D4:** «Reservó» en inscritos activos.
- **D5:** las fechas también se muestran en `/admin/users/[userId]`.
**Especificación:** `SPEC-CANCELLATION-AUDIT-AND-TERMS.md`
**Runner:** Vitest. `pnpm test <ruta>` equivale a `vitest run <ruta>`. Se aplican las mismas reglas Red→Green→Refactor de la sección TASK-QR (abajo).
**Restricción de BD:** ninguna tarea ejecuta comandos contra la BD. `TASK-CA-DB-02` la ejecuta el usuario.

## Matriz de trazabilidad (casos obligatorios)

| Caso obligatorio | Tareas | Archivos de test |
|---|---|---|
| Al cancelar se guarda `cancelled_at = now()` | BE-01, BE-02, BE-04, BE-05 | `lib/enrollment/__tests__/cancellation.test.ts`, `enrollment-cancellation.test.ts`, `src/__tests__/cancellation-audit-writers.test.ts` (guarda estructural sobre `guest.ts`, `admin.ts` y `admin-guest.ts`) |
| Un no-admin no recibe `cancelled_at` ni accede al reporte | SEC-01, FE-02 | `admin-enrollment-audit.test.ts`, `coach-queries-shape.test.ts`, `audit-import-boundary.test.ts`, `admin/attendance/[classId]/__tests__/page.test.tsx` |
| Ventana de gracia (≤10 min reembolsa; >10 min y <24 h retiene) | BE-02, BE-03 | `enrollment-cancellation.test.ts` (límite exacto de 10:00.000 / 10:00.001 y propiedad fast-check), `grace-period-cancellation.test.ts`, `enrollment-reactivation.test.ts` |

## Tareas

### TASK-CA-DB-01 · DB · Script aditivo y columna en Drizzle
- **Archivos:** `sql/manual/2026-09-24_001_enrollment_cancelled_at.sql`, `src/db/schema.ts`, `src/db/__tests__/cancelled-at-migration.test.ts`, `src/db/__tests__/schema-cancelled-at.test.ts`
- **Descripción:** script de SPEC §2.1 y `cancelledAt` (nullable, sin default) en `classEnrollments` y, con D2, también en `guestEnrollments`.
- **Tests 🔴:**
  - El SQL contiene `ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE`, `BEGIN`/`COMMIT` y `lock_timeout`.
  - El SQL **no** contiene `DROP`, `TRUNCATE`, `DELETE`, `UPDATE` ni `DEFAULT`, sin distinguir mayúsculas.
  - `getTableColumns(classEnrollments).cancelledAt` existe: nombre `cancelled_at`, `notNull=false`, `hasDefault=false`, `withTimezone=true`.
- **Verificar:** `pnpm test src/db/__tests__/cancelled-at-migration.test.ts src/db/__tests__/schema-cancelled-at.test.ts`

### TASK-CA-DB-02 · DB · Ejecución en producción (USUARIO)
- Correr el script en el SQL editor de Supabase **antes** del deploy y después la query de verificación de SPEC §2.1. Correrlo dos veces es seguro porque es idempotente.

### TASK-CA-BE-01 · Backend · Helper `buildCancellationPatch`
- **Archivos:** `src/lib/enrollment/cancellation.ts`, `src/lib/enrollment/__tests__/cancellation.test.ts`
- **Tests 🔴:**
  - `buildCancellationPatch('cancelled')` y `('late_cancelled')` devuelven el `status` correcto.
  - `cancelledAt` se serializa como `now()`. Se verifica con `new PgDialect().sqlToQuery(...)`, el mismo patrón que en QR.
  - Solo acepta los estados cancelados; se verifica en tipos con `// @ts-expect-error` sobre `'attended'`.
- **Verificar:** `pnpm test src/lib/enrollment/__tests__/cancellation.test.ts`

### TASK-CA-BE-02 · Backend · Cancelación del cliente: DELETE → UPDATE, `cancelled_at` y anti doble reembolso
- **Archivos:** `src/actions/enrollment.ts` (`refundEnrollment`, `confirmLateCancellationAction`), `src/actions/__tests__/enrollment-cancellation.test.ts` (nuevo), `grace-period-cancellation.test.ts`, `cancellation.test.ts`, `late-cancellation-*.test.ts` y `enrollment-openlab.test.ts` (sus mocks pasan de `delete` a `update().set().where().returning()`).
- **Tests 🔴:**
  1. **cancelled_at:** una cancelación a tiempo (clase en 48 h) llama `update(classEnrollments).set(...)` con `status:'cancelled'` y `cancelledAt` = SQL `now()`, y **nunca** llama `delete`.
  2. **cancelled_at, caso tardío:** `confirmLateCancellationAction` (clase en 2 h, reserva de hace 30 min) hace `set` con `status:'late_cancelled'` y `cancelledAt` = `now()`.
  3. **Guardia:** el WHERE del UPDATE incluye `status = 'pending'` (verificado con `sqlToQuery`).
  4. **Doble reembolso:** si `returning()` devuelve `[]` (otro request ya canceló), **no** se ejecuta `days_remaining + 1` y se responde con error controlado.
  5. **Gracia, límite inclusivo:** reserva de hace exactamente 10:00.000 min y clase en 2 h → reembolso y `cancelled`.
  6. **Gracia, fuera de ventana:** reserva de hace 10:00.001 min y clase en 2 h → `LATE_CANCELLATION` sin reembolso. Al confirmar queda `late_cancelled` sin `days_remaining + 1`.
  7. **Regla de 24 h:** reserva de hace 3 días y clase en 24 h exactas → reembolso.
  8. **Re-evaluación:** se abre el diálogo dentro de la gracia y se confirma después. Si al confirmar sigue dentro de la gracia, se reembolsa.
  9. **Open Lab:** se cancela con `cancelled_at` pero sin tocar `days_remaining`.
  10. **Propiedad:** en `enrollment-cancellation.test.ts`, con fast-check sobre Δ ∈ [0, 20 min] y la clase a 5 h: se reembolsa ⇔ Δ ≤ 10 min.
- Todos usan `vi.useFakeTimers()` y `vi.setSystemTime(new Date('2026-09-24T10:00:00.000-06:00'))`.
- **Verificar:** `pnpm test src/actions/__tests__/enrollment-cancellation.test.ts src/actions/__tests__/grace-period-cancellation.test.ts src/actions/__tests__/cancellation.test.ts src/__tests__/late-cancellation-bug-condition.test.ts src/__tests__/late-cancellation-preservation.test.ts src/actions/__tests__/enrollment-openlab.test.ts`

### TASK-CA-BE-03 · Backend · Re-reserva tras cancelar (D1-A)
- **Archivos:** `src/actions/enrollment.ts` (`enrollInClassAction`), `src/actions/__tests__/enrollment-reactivation.test.ts` (nuevo, con drizzle real), y los mocks de `enrollment.test.ts` y `enrollment-openlab.test.ts`
- **Tests 🔴:**
  - Si existe una fila `cancelled`/`late_cancelled` para `(clase, suscripción)`, se hace **UPDATE** a `pending` con `created_at = now()`, `cancelled_at = null` y un `checkin_token` nuevo. No hay INSERT y se descuenta 1 crédito.
  - Sin fila previa, se mantiene el INSERT actual.
  - Una fila previa `pending`/`attended` sigue respondiendo «Ya estás inscrito» (sin cambios).
  - Tras reactivar, la gracia corre desde el nuevo `created_at`: cancelar 5 min después reembolsa.
- **Verificar:** `pnpm test src/actions/__tests__/enrollment-reactivation.test.ts src/actions/__tests__/enrollment.test.ts`

### TASK-CA-BE-04 · Backend · Flujos con invitado
- **Archivos:** `src/actions/guest.ts` (3 escrituras del titular; con D2 también las de `guest_enrollments`), `src/actions/admin-guest.ts` (D2), `src/actions/__tests__/guest.test.ts`, `admin-guest.test.ts`
- **Tests 🔴:** guarda estructural `src/__tests__/cancellation-audit-writers.test.ts`. Encontró 14 escrituras literales en `guest.ts`, `admin.ts` y `admin-guest.ts`, y ahora exige los helpers. Los tests existentes de guest y admin-guest siguen en verde.
- **Verificar:** `pnpm test src/__tests__/cancellation-audit-writers.test.ts src/actions/__tests__/guest.test.ts src/actions/__tests__/admin-guest.test.ts`

### TASK-CA-BE-05 · Backend · Cancelaciones del estudio
- **Archivos:** `src/actions/admin.ts` (`cancelClassAction`, `suspendSubscriptionAction`), `src/actions/__tests__/admin-class.test.ts`, `admin-subscription.test.ts`
- **Tests 🔴:** cubiertos por la guarda estructural de BE-04 y los tests unitarios del helper. El reembolso existente no cambia.
- **Verificar:** `pnpm test src/__tests__/cancellation-audit-writers.test.ts src/actions/__tests__/admin-class.test.ts src/actions/__tests__/admin-subscription.test.ts`

### TASK-CA-BE-06 · Backend · Regresión por filas `cancelled` que antes se borraban
- **Archivos:** lectores de `class_enrolleds`: `src/app/(portal)/client/{classes,reservations}/page.tsx`, `src/components/sections/Schedule.tsx`, `src/lib/guest/capacity.ts`, `src/lib/queries/{check-subscription-expiration,next-class,coach}.ts`, `src/app/(portal)/admin/{classes,users/[userId]}/page.tsx`, `src/app/(portal)/coach/classes/page.tsx`
- **Descripción:** auditar con `rg` que cada lectura que cuente cupo, muestre «inscrito» o calcule estadísticas excluya `CANCELLED_ENROLLMENT_STATUSES`. Una cancelación a tiempo ahora deja fila, cuando antes desaparecía.
- **Resultado:** todos los lectores ya excluyen los estados cancelados. `client/reservations` los muestra a propósito en su filtro «Canceladas» y el historial admin los cuenta a propósito. **No hubo cambios en producción.**
- **Test:** `src/lib/guest/__tests__/capacity-cancelled-rows.test.ts` verifica, con SQL real, que el cupo excluye `cancelled`/`late_cancelled` (tanto titulares como invitados).
- **Verificar:** `pnpm test src/lib/guest src/lib/queries`

### TASK-CA-SEC-01 · Seguridad · Query admin-only y frontera de datos
- **Archivos:** `src/lib/queries/admin-enrollment-audit.ts`, `src/lib/queries/__tests__/admin-enrollment-audit.test.ts`, `src/lib/queries/__tests__/coach-queries-shape.test.ts`, `src/__tests__/audit-import-boundary.test.ts`
- **Tests 🔴:**
  1. `getClassEnrollmentAudit(id, { role:'coach' })`, con `{ role:'client' }` y con `null`, lanza `ForbiddenError` **sin tocar `db`** (`db.select` no se llama).
  2. Con `{ role:'admin' }`, devuelve `bookedAt` y `cancelledAt` en ISO.
  3. El serializador pone `cancelledAt = null` si el estado es `pending`/`attended`/`absent`, aunque la BD traiga un valor.
  4. `getClassEnrollments` y `getCancelledEnrollments` (coach) proyectan **exactamente** `['enrollmentId','status','studentName','studentEmail']`. Se captura el objeto pasado a `db.select`, se comparan sus llaves y se verifica que no aparezcan `createdAt` ni `cancelledAt`.
  5. Frontera estática: ningún archivo en `src/app/(portal)/{coach,client}/**` ni en `src/components/{coach,client}/**` importa `admin-enrollment-audit`.
- **Verificar:** `pnpm test src/lib/queries/__tests__/admin-enrollment-audit.test.ts src/lib/queries/__tests__/coach-queries-shape.test.ts src/__tests__/audit-import-boundary.test.ts`

### TASK-CA-FE-01 · Frontend · `formatAuditDateTime`
- **Archivos:** `src/lib/utils/date.ts`, `src/lib/utils/__tests__/date-audit-format.test.ts`
- **Tests 🔴:**
  - `2026-09-25T01:05:00Z` → `24/09/2026, 07:05 PM`, porque en CDMX sigue siendo el día anterior.
  - `2026-09-24T06:00:00Z` → `24/09/2026, 12:00 AM`.
  - Mediodía → `12:00 PM`.
  - La salida siempre cumple `/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2} (AM|PM)$/` (fast-check sobre fechas 2020–2035).
  - `null` o una fecha inválida → `'Sin registro'`.
- **Verificar:** `pnpm test src/lib/utils/__tests__/date-audit-format.test.ts`

### TASK-CA-FE-02 · Frontend · Panel admin de asistencia
- **Archivos:** `src/app/(portal)/admin/attendance/[classId]/page.tsx`, `src/components/admin/CancellationAuditList.tsx` (nuevo), `src/components/admin/AdminGuestSection.tsx` y `src/components/coach/AttendanceSheet.tsx` (prop opcional `bookedAtLabel`), `src/app/(portal)/admin/users/[userId]/page.tsx` y `src/components/admin/ClientHistory.tsx` (D5). Tests: `admin/attendance/[classId]/__tests__/page.test.tsx`, `CancellationAuditList.test.tsx`, `ClientHistory.audit.test.tsx`, `AttendanceSheet.test.tsx`.
- **Tests 🔴:**
  - En la página admin, una fila `late_cancelled` muestra «Reservó: 24/09/2026, 09:00 AM», «Canceló: 24/09/2026, 10:15 AM» y el badge «Cancelación tardía».
  - Una fila activa muestra «Reservó: …» y **no** «Canceló».
  - Una fila cancelada con `cancelledAt=null` muestra «Canceló: Sin registro».
  - `AttendanceSheet` sin `bookedAtLabel`, que es como lo usa el coach, no muestra «Reservó».
  - La página del coach (test existente o nuevo) no muestra «Reservó» ni «Canceló».
  - Si el rol no es admin, hay `redirect('/login')` (ya existe; se agrega el test).
- **Verificar:** `pnpm test "src/app/(portal)/admin/attendance" src/components/admin src/components/coach/__tests__/AttendanceSheet.test.tsx`

### TASK-CA-LEGAL-01 · Términos y Condiciones
- **Archivos:** `src/app/terminos-y-condiciones/page.tsx` (página existente; se reescribe su §5), `src/app/terminos-y-condiciones/__tests__/page.test.tsx`
- **Descripción:** publicar la cláusula de SPEC §5.2 adaptada a los numerales 5.1–5.9. La cifra de minutos se interpola desde `GRACE_PERIOD_MINUTES`. La fecha pasa a «24 de septiembre de 2026».
- **Tests 🔴:**
  - Contiene «veinticuatro (24) horas de anticipación» con reintegro.
  - Contiene «diez (10) minutos» contados desde la «Hora de la Reserva», «aun cuando falten menos de veinticuatro (24) horas».
  - Define la cancelación tardía «no da derecho a la reposición del Crédito».
  - Menciona invitados, la cancelación por el Estudio, la hora de la Ciudad de México y PROFECO.
  - Muestra la fecha de actualización y conserva `metadata.title`.
- **Verificar:** `pnpm test src/app/terminos-y-condiciones`

### TASK-CA-FE-03 · Frontend · Enlace a la política en los avisos de cancelación tardía
- **Archivos:** `src/components/client/CancellationPolicyLink.tsx` (nuevo), `CancellationModal.tsx` (el copy ahora menciona que ya pasaron los 10 min), `CancelGuestDialog.tsx`, `src/components/client/__tests__/CancellationPolicyLink.test.tsx`
- **Tests 🔴:** hay un link «Ver política de cancelación» → `/terminos-y-condiciones` (`target=_blank`, `rel=noopener`) y el aviso menciona los 10 minutos.
- **Verificar:** `pnpm test src/components/client src/components/__tests__/CancelGuestDialog.test.tsx`

### TASK-CA-VERIFY-01 · Verificación final
- `pnpm test` → suite completa en verde.
- `pnpm exec tsc --noEmit` → limpio.
- `pnpm lint` → sin errores nuevos en los archivos del feature.
- `pnpm build` → OK.
- **E2E manual contra una BD no productiva:**
  1. Reservar y cancelar en menos de 10 min con la clase en menos de 24 h: el crédito vuelve.
  2. Reservar, esperar más de 10 min y cancelar: queda como tardía.
  3. Volver a reservar la misma clase.
  4. Revisar las fechas en `/admin/attendance/[id]` y comprobar que no aparecen en `/coach/attendance/[id]`.

---

# TASK-QR-CHECKIN — Asistencia a Clases mediante Código QR

**Estado:** ✅ Ejecutado (2026-09-23). Suite: 653/653 tests, `tsc` limpio, `pnpm build` OK y `pnpm lint` sin errores en los archivos de este feature. **Pendiente (usuario):** TASK-QR-DB-03 y el E2E manual de TASK-QR-VERIFY-01.
**Decisiones confirmadas:**
- **D1:** `authInterrupts` es experimental en Next 16, así que **no** se activó; el rol `client` ve una vista 403 inline.
- **D2:** el coach solo registra asistencia de sus propias clases; el admin, de cualquiera.
- **D3:** la clase se muestra hasta que termina.
- **D4:** el cierre automático aplica solo desde el go-live.
- **D5:** se usa `qrcode`.
- **D6 y D7:** se implementaron con la recomendación.
**Especificación:** `SPEC-QR-CHECKIN.md`
**Runner:** Vitest. `pnpm test <ruta>` equivale a `vitest run <ruta>`. Los mocks de `@/db` y `@/lib/auth/session` siguen el patrón de `src/actions/__tests__/*`.
**Restricción de BD:** ninguna tarea ejecuta comandos contra la BD. Los scripts SQL los ejecuta el usuario (`TASK-QR-DB-03`).

## Reglas de ejecución

1. 🔴 **RED:** escribir los tests y correr el comando de verificación. **Deben fallar** por la razón esperada, no por errores de sintaxis o de import.
2. 🟢 **GREEN:** implementación mínima hasta que el comando pase.
3. 🔵 **REFACTOR:** limpiar con los tests en verde y volver a correr el comando.
4. Una tarea está terminada cuando su comando pasa y `pnpm exec tsc --noEmit` no reporta errores nuevos.
5. Los tests de Route Handlers y de archivos SQL usan `// @vitest-environment node`, porque el default del proyecto es `jsdom`.
6. El tiempo se controla con `vi.useFakeTimers()` y `vi.setSystemTime()`, usando fechas con offset `-06:00`.

## Matriz de trazabilidad (casos obligatorios)

| Caso obligatorio | Tareas | Archivos de test |
|---|---|---|
| Generación de token | DB-01, BE-01, BE-02, BE-03 | `qr-checkin-migration.test.ts`, `token.test.ts`, `ensure-token.test.ts`, `enrollment*.test.ts`, `guest.test.ts` |
| Validación coach/admin | BE-04, BE-05, FE-01 | `process-checkin.test.ts`, `api/check-in/__tests__/route.test.ts`, `check-in/__tests__/page.test.tsx` |
| Bloqueo 403 a clientes | BE-04, BE-05, FE-01 | Los mismos de la fila anterior |
| Reuso de token | BE-04, BE-05, FE-01 | `process-checkin.test.ts`, `route.test.ts`, `CheckInProcessor.test.tsx` |
| Expiración a `absent` | BE-07 | `attendance-auto-close.test.ts`, `cron/complete-classes/__tests__/route.test.ts` |

## Orden y dependencias

`DOC-01 → DEP-01 → DB-01 → DB-02 → BE-01 → BE-02 → BE-03 → BE-04 → BE-05 → BE-06 → BE-07 → BE-08 → BE-09 → FE-01 → FE-02 → FE-03 → VERIFY-01 → DB-03 (🔒 usuario, antes del deploy)`

---

## TASK-QR-DOC-01 — Corregir las reglas de BD en `CLAUDE.md`

- **Tipo:** Docs (sin tests)
- **Archivos:** `CLAUDE.md`
- **Descripción:**
  - Reemplazar "Schema changes: edit `schema.ts` → `pnpm db:generate` → commit SQL" por la regla real: la BD viva **no** usa Drizzle Migrations. Los cambios se hacen con SQL manual, aditivo e idempotente en `sql/manual/`, y los ejecuta el usuario.
  - Declarar prohibidos `db:push`, `db:migrate`, `drizzle-kit push --force`, `DROP`, `TRUNCATE` y cualquier alteración destructiva.
  - Marcar `db:push` y `db:migrate` en el cheatsheet con "⛔ no usar contra la BD viva".
- **Verificación:** las menciones a `db:push` y `db:migrate` solo deben aparecer junto a la advertencia.
  ```bash
  rg -n "sql/manual|db:push|db:migrate" CLAUDE.md
  ```

## TASK-QR-DEP-01 — Dependencia para generar el QR (D5)

- **Tipo:** Dependencias
- **Archivos:** `package.json`, `pnpm-lock.yaml`
- **Descripción:** `pnpm add qrcode` y `pnpm add -D @types/qrcode`. La librería no tiene scripts de instalación.
- **Verificación:**
  ```bash
  pnpm ls qrcode @types/qrcode
  ```

## TASK-QR-DB-01 — Scripts SQL manuales y test de seguridad de la migración

- **Tipo:** Base de datos (test-first)
- **Archivos:** `sql/manual/2026-09-22_001_qr_checkin_columns.sql` (nuevo), `sql/manual/2026-09-22_002_qr_checkin_backfill.sql` (nuevo), `src/db/__tests__/qr-checkin-migration.test.ts` (nuevo)
- **Descripción:** copiar los scripts de SPEC §3.2 y §8.2. El test lee los archivos con `fs`, quita los comentarios `--` y normaliza espacios y mayúsculas antes de verificar.
- **🔴 Tests:**
  - [x] `001` contiene `ADD COLUMN IF NOT EXISTS checkin_token varchar(64)` y `ADD COLUMN IF NOT EXISTS checked_in_at timestamptz`.
  - [x] `001` crea `class_enrolleds_checkin_token_unique` dentro de un guard `IF NOT EXISTS (SELECT 1 FROM pg_constraint …)`.
  - [x] Ambos scripts van dentro de `BEGIN; … COMMIT;` y fijan `SET LOCAL lock_timeout`.
  - [x] Ningún script contiene, fuera de comentarios, `DROP`, `TRUNCATE`, `DELETE`, `ALTER TYPE`, `RENAME`, `SET NOT NULL`, `ALTER COLUMN` ni `CASCADE`.
  - [x] `002` es un único `UPDATE` que solo asigna `checkin_token`. Su `WHERE` incluye `checkin_token IS NULL`, `status = 'pending'`, `oc.status = 'scheduled'` y `class_date > now()`.
  - [x] `002` genera los tokens con `gen_random_uuid()`, sin depender de `pgcrypto`.
- **🟢 GREEN:** crear los dos archivos SQL.
- **Verificación:**
  ```bash
  pnpm test src/db/__tests__/qr-checkin-migration.test.ts
  ```

## TASK-QR-DB-02 — Schema de Drizzle: `checkinToken` y `checkedInAt`

- **Tipo:** Base de datos (schema)
- **Archivos:** `src/db/schema.ts`, `src/db/__tests__/schema-checkin.test.ts` (nuevo)
- **Descripción:** agregar las dos columnas según SPEC §3.4. **No correr `pnpm db:generate`.**
- **🔴 Tests** (con `getTableConfig(classEnrollments)` de `drizzle-orm/pg-core`):
  - [x] `checkin_token`: `PgVarchar`, `length` 64, nullable, `isUnique` y `uniqueName === 'class_enrolleds_checkin_token_unique'`.
  - [x] `checked_in_at`: `PgTimestamp` con `withTimezone: true`, nullable y sin default.
  - [x] Las columnas existentes siguen intactas: `id`, `open_class_id`, `user_suscription_id`, `status` con default `'pending'` y `created_at`. El índice `uk_class_user_enrollment` sigue presente.
  - [x] `enrollmentStatusEnum.enumValues` es exactamente `['pending','attended','absent','late_cancelled','cancelled']`.
- **Verificación:**
  ```bash
  pnpm test src/db/__tests__/schema-checkin.test.ts && pnpm exec tsc --noEmit
  ```

## TASK-QR-BE-01 — Utilidades de token, URL y QR

- **Tipo:** Backend (dominio puro)
- **Archivos:** `src/lib/checkin/token.ts`, `src/lib/checkin/qr.ts`, `src/lib/checkin/constants.ts` (todos nuevos); tests en `src/lib/checkin/__tests__/token.test.ts` y `qr.test.ts`
- **Descripción:**
  - `generateCheckinToken()` usa `randomBytes(32).toString('hex')`.
  - `isValidCheckinToken(value: unknown)` valida el formato.
  - `buildCheckinUrl(token, baseUrl = process.env.NEXT_PUBLIC_APP_URL)` arma la URL del QR.
  - `buildCheckinQrDataUrl(url)` usa `qrcode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })` y lo convierte en data URL.
  - `constants.ts` define `CHECKIN_TOKEN_REGEX`, `CHECKIN_STATUS_POLL_MS = 3000`, `CHECKIN_STATUS_POLL_MAX_MS = 900000` y `ATTENDANCE_AUTO_CLOSE_FROM`.
- **🔴 Tests:**
  - [x] `generateCheckinToken()` cumple `^[0-9a-f]{64}$`.
  - [x] 10 000 tokens generados son únicos.
  - [x] `isValidCheckinToken` devuelve `true` para tokens generados y `false` para `''`, `null`, `undefined`, 63 o 65 caracteres, hex en mayúsculas, espacios y caracteres no hex.
  - [x] Propiedad con `fast-check`: todo string que no cumple el regex da `false`.
  - [x] `buildCheckinUrl(t, 'https://app.mx/')` da `https://app.mx/check-in?token=<t>` (sin `//`). Con una base vacía o `undefined` lanza un error.
  - [x] `buildCheckinQrDataUrl(url)` empieza con `data:image/svg+xml` y el SVG decodificado contiene `<svg`.
- **Verificación:**
  ```bash
  pnpm test src/lib/checkin/__tests__/token.test.ts src/lib/checkin/__tests__/qr.test.ts
  ```

## TASK-QR-BE-02 — `ensureCheckinToken` (fallback en runtime)

- **Tipo:** Backend (BD)
- **Archivos:** `src/lib/checkin/ensure-token.ts`, `src/lib/checkin/__tests__/ensure-token.test.ts` (nuevos)
- **Descripción:** un único `UPDATE` condicional (SPEC §4); no necesita transacción explícita.
- **🔴 Tests** (con `@/db` mockeado):
  - [x] Para una reserva `pending` sin token, `update().set()` recibe `{ checkinToken: <64 hex> }` y la función devuelve el token de `returning()`.
  - [x] Si `returning()` viene vacío (otra petición ganó la carrera), relee y devuelve el token existente sin un segundo `update`.
  - [x] Si `returning()` viene vacío y la relectura no encuentra una reserva `pending`, devuelve `null`.
  - [x] Un error `23505` en el primer intento provoca un reintento con otro token. Un segundo `23505` se propaga.
- **Verificación:**
  ```bash
  pnpm test src/lib/checkin/__tests__/ensure-token.test.ts
  ```

## TASK-QR-BE-03 — Generar el token al reservar (D6)

- **Tipo:** Backend (Server Actions)
- **Archivos:** `src/actions/enrollment.ts` (insert en la línea ~147), `src/actions/guest.ts` (insert en la línea ~242), `src/actions/__tests__/enrollment.test.ts`, `src/actions/__tests__/enrollment-openlab.test.ts`, `src/actions/__tests__/guest.test.ts`
- **Descripción:** agregar `checkinToken: generateCheckinToken()` a los dos `tx.insert(classEnrollments).values(...)`, dentro de las transacciones existentes. No se cambia ninguna otra lógica.
- **🔴 Tests:**
  - [x] `values` recibe `expect.objectContaining({ checkinToken: expect.stringMatching(/^[0-9a-f]{64}$/) })` en una reserva normal, una de Open Lab y una con invitado.
  - [x] Dos reservas consecutivas generan tokens distintos.
  - [x] Las aserciones existentes que comparan `values` exacto pasan a `objectContaining`, sin debilitar ninguna otra.
- **Verificación:**
  ```bash
  pnpm test src/actions/__tests__/enrollment.test.ts src/actions/__tests__/enrollment-openlab.test.ts src/actions/__tests__/guest.test.ts
  ```

## TASK-QR-BE-04 — Servicio `processCheckin` (transacción atómica)

- **Tipo:** Backend (servicio de dominio)
- **Archivos:** `src/lib/checkin/process-checkin.ts`, `src/lib/checkin/errors.ts` (sin imports de servidor), `src/lib/checkin/__tests__/process-checkin.test.ts`, `src/lib/checkin/__tests__/fakes.ts` (todos nuevos)
- **Descripción:**
  - Firma: `processCheckin({ token, actor, now? }): Promise<CheckinResult>`, con `actor: { id: string; role: UserRole } | null`.
  - Sigue el flujo de SPEC §7.2.1: `db.transaction`, `select … .for('update', { of: classEnrollments })`, las validaciones en orden y un `update` con guardas y `returning`.
  - `errors.ts` exporta `CheckinErrorCode`, `CHECKIN_HTTP_STATUS` y `CHECKIN_ERROR_MESSAGES`.
  - `fakes.ts` es un repositorio en memoria con estado mutable para `db.transaction`; lo reutilizan BE-05 y el test de reuso.
- **🔴 Tests:**
  - [x] `actor = null` → `UNAUTHENTICATED`, sin tocar la BD.
  - [x] `actor.role = 'client'` → `FORBIDDEN_ROLE`, y `db.transaction` no se llama.
  - [x] Token con formato inválido → `TOKEN_NOT_FOUND`, sin tocar la BD.
  - [x] Token inexistente → `TOKEN_NOT_FOUND`.
  - [x] Coach que no es titular → `NOT_CLASS_COACH`, y `update` no se llama.
  - [x] Coach titular con reserva `pending` de hoy → `ok`. `set` recibe `{ status: 'attended', checkinToken: null, checkedInAt: now() }` y el resultado trae `studentName` y `className`.
  - [x] Admin con la clase de otro coach → `ok`.
  - [x] Estado `attended`, `absent`, `cancelled` o `late_cancelled` → `ENROLLMENT_NOT_PENDING` con `details.status` (usar `fc.constantFrom`).
  - [x] Clase `cancelled` → `CLASS_CANCELLED`.
  - [x] Clase de ayer o de mañana → `OUTSIDE_ATTENDANCE_WINDOW`. En las fronteras: a las 23:59:59.999 CDMX del día de la clase es `ok`; a las 00:00:00.000 del día siguiente es 409.
  - [x] **Reuso:** con el fake en memoria, la primera llamada da `ok` y la segunda, con el mismo token, `TOKEN_NOT_FOUND`. El estado queda `attended` una sola vez.
  - [x] **Carrera:** si `update … returning` devuelve 0 filas → `TOKEN_NOT_FOUND`; nunca se reporta un éxito.
  - [x] Se usa `db.transaction` exactamente una vez por llamada válida.
- **Verificación:**
  ```bash
  pnpm test src/lib/checkin/__tests__/process-checkin.test.ts
  ```

## TASK-QR-BE-05 — Route Handler `POST /api/check-in`

- **Tipo:** Backend (HTTP)
- **Archivos:** `src/app/api/check-in/route.ts`, `src/app/api/check-in/__tests__/route.test.ts` (nuevos)
- **Descripción:** implementa el contrato de SPEC §7.2. Sigue el orden `Origin → sesión → rol → body → processCheckin` y mapea con `CHECKIN_HTTP_STATUS`. Todas las respuestas llevan `Cache-Control: no-store`.
- **🔴 Tests** (con `getSession` mockeado):
  - [x] Sin sesión → 401 `UNAUTHENTICATED`.
  - [x] Sesión `client` → 403 `FORBIDDEN_ROLE`, sin leer el body ni llamar al servicio.
  - [x] Body que no es JSON, sin `token` o con `token` no string → 400 `INVALID_PAYLOAD`.
  - [x] `Origin` con un host distinto al de la petición → 403 `INVALID_ORIGIN`.
  - [x] Cada `code` del servicio se traduce al status HTTP de SPEC §7.2 (`it.each`). `TOKEN_NOT_FOUND` da 404 con el mensaje "Código QR inválido o ya utilizado".
  - [x] **Reuso** (servicio real con `fakes.ts`): dos POST con el mismo token dan 200 y luego 404.
  - [x] Coach titular → 200 con `studentName`. Admin → 200.
  - [x] Si el servicio lanza una excepción → 500 `INTERNAL_ERROR`, sin stack en el body.
  - [x] Todas las respuestas llevan `Cache-Control: no-store`.
  - [x] `CHECKIN_HTTP_STATUS` cubre todos los valores de `CheckinErrorCode` (test de exhaustividad).
- **Verificación:**
  ```bash
  pnpm test src/app/api/check-in/__tests__/route.test.ts
  ```

## TASK-QR-BE-06 — Route Handler `GET /api/check-in/status`

- **Tipo:** Backend (HTTP)
- **Archivos:** `src/app/api/check-in/status/route.ts`, `src/app/api/check-in/status/__tests__/route.test.ts` (nuevos)
- **Descripción:** implementa SPEC §7.3. La consulta filtra por `user_suscriptions.user_id = session.sub`.
- **🔴 Tests:**
  - [x] Sin sesión → 401.
  - [x] `enrollmentId` que no es UUID → 400 `INVALID_PAYLOAD`.
  - [x] Reserva inexistente o de otro usuario → 404 `ENROLLMENT_NOT_FOUND`, con la misma respuesta en ambos casos.
  - [x] Reserva propia → 200 `{ status, checkedInAt }`.
  - [x] La respuesta lleva `Cache-Control: no-store`.
- **Verificación:**
  ```bash
  pnpm test src/app/api/check-in/status/__tests__/route.test.ts
  ```

## TASK-QR-BE-07 — Cierre automático de inasistencias (`pending → absent`)

- **Tipo:** Backend (cron)
- **Archivos:** `src/lib/queries/attendance-auto-close.ts` (nuevo), `src/app/api/cron/complete-classes/route.ts` (modificado), `src/lib/queries/__tests__/attendance-auto-close.test.ts` (nuevo), `src/app/api/cron/complete-classes/__tests__/route.test.ts` (nuevo)
- **Descripción:**
  - Implementa SPEC §9 con funciones puras exportadas: `getAutoCloseCutoff(now)` y `buildAutoCloseWhere(now)`. El SQL se verifica con `new PgDialect().sqlToQuery(...)`.
  - `markUnattendedEnrollmentsAbsent(now)` ejecuta una sola sentencia `update … returning`.
  - El cron la llama después de `autoCompletePassedClasses()`.
- **🔴 Tests:**
  - [x] `getAutoCloseCutoff(2026-09-23T00:30-06:00)` es `2026-09-23T00:00:00.000-06:00`.
  - [x] Propiedad con `fast-check`: para todo `now`, `cutoff ≤ now < cutoff + 24 h` y `cutoff` es 00:00 en CDMX.
  - [x] **Frontera:** una clase de hoy a las 23:10 CDMX queda excluida con `now = 23:59:59.999` CDMX (`class_date ≥ cutoff`) e incluida con `now = 00:00:00.000` del día siguiente.
  - [x] El SQL generado filtra `status = 'pending'`, `status in ('scheduled','completed')` (nunca `cancelled`), `class_date >= ATTENDANCE_AUTO_CLOSE_FROM` y `class_date < cutoff`, con los parámetros correctos.
  - [x] `set` recibe `{ status: 'absent', checkinToken: null }` y la función devuelve el número de filas de `returning()`.
  - [x] Una segunda ejecución sin filas pendientes devuelve `0` (idempotencia).
  - [x] **Cron:** sin `Bearer ${CRON_SECRET}` → 401 y no ejecuta nada. En éxito → `{ success, completed, markedAbsent, timestamp }`. Un error en cualquiera de los pasos → 500.
- **Verificación:**
  ```bash
  pnpm test src/lib/queries/__tests__/attendance-auto-close.test.ts src/app/api/cron/complete-classes/__tests__/route.test.ts
  ```

## TASK-QR-BE-08 — Asistencia manual coherente con el QR, más hardening

- **Tipo:** Backend (Server Action existente)
- **Archivos:** `src/actions/coach.ts` (`updateAttendanceAction`), `src/actions/__tests__/attendance.test.ts`
- **Descripción:**
  - `attended` escribe `{ status, checkedInAt: now(), checkinToken: null }`. `absent` escribe `{ status, checkedInAt: null, checkinToken: null }` (I-2, I-3).
  - Antes de escribir, verifica que cada `enrollmentId` pertenezca a `classId` (en la tabla de titulares o en la de invitados) y que esté en `pending`, `attended` o `absent`. Si alguno no cumple, devuelve error sin escribir nada (SPEC §13.1).
  - Todas las escrituras se hacen dentro de un `db.transaction`.
  - Las validaciones existentes (rol, titularidad, ventana CDMX) y sus mensajes no cambian.
- **🔴 Tests:**
  - [x] `attended` y `absent` producen los payloads de `set` descritos arriba.
  - [x] Un `enrollmentId` de otra clase da `{ success: false }` y `update` no se llama.
  - [x] Una reserva `cancelled` o `late_cancelled` da `{ success: false }` y no se reactiva.
  - [x] Las escrituras ocurren dentro de `db.transaction`.
  - [x] Los tests existentes de `attendance.test.ts` y `coach.test.ts` siguen en verde.
- **Verificación:**
  ```bash
  pnpm test src/actions/__tests__/attendance.test.ts src/actions/__tests__/coach.test.ts
  ```

## TASK-QR-BE-09 — Login con `redirect` seguro

- **Tipo:** Backend y Auth
- **Archivos:** `src/lib/auth/safe-redirect.ts` (nuevo), `src/lib/auth/__tests__/safe-redirect.test.ts` (nuevo), `src/actions/auth.ts` (`loginAction`), `src/app/(auth)/login/page.tsx`, `src/components/auth/LoginForm.tsx`, `src/actions/__tests__/auth-login.test.ts`
- **Descripción:** implementa SPEC §7.5.
  - La página lee `searchParams.redirect` con `await`, porque en Next 16 es una `Promise`.
  - `LoginForm` recibe el valor y lo envía como input oculto `redirect`.
  - `loginAction` redirige a `safeRedirectPath(formData.get('redirect')) ?? dashboard`.
- **🔴 Tests:**
  - [x] Acepta `/check-in?token=<64 hex>` y `/coach`.
  - [x] Rechaza `//evil.com`, `https://evil.com`, `/\evil.com`, `javascript:alert(1)`, cadenas con `\r` o `\n`, `''`, `null` y cadenas de más de 512 caracteres.
  - [x] Propiedad con `fast-check`: para cualquier string, el resultado es `null` o una ruta que empieza con `/` y no con `//` ni con `/\`.
  - [x] Con un `redirect` válido, `loginAction` llama a `redirect('/check-in?token=…')`. Con uno inválido o ausente redirige al dashboard del rol, como hasta ahora.
- **Verificación:**
  ```bash
  pnpm test src/lib/auth/__tests__/safe-redirect.test.ts src/actions/__tests__/auth-login.test.ts
  ```

## TASK-QR-FE-01 — Página `/check-in`, respuesta 403 y `CheckInProcessor`

- **Tipo:** Frontend (Server y Client Components)
- **Archivos:** `src/app/check-in/page.tsx`, `src/components/coach/CheckInProcessor.tsx`, `src/components/coach/CheckInResultCard.tsx`, `src/app/check-in/__tests__/page.test.tsx`, `src/components/coach/__tests__/CheckInProcessor.test.tsx`. Por D1 no se tocó `next.config.ts` ni se creó `forbidden.tsx`.
- **Descripción:** implementa SPEC §7.1 y §10.2. Antes de codificar, leer `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/forbidden.md`.
- **🔴 Tests de la página** (`getSession` mockeado; `redirect` de `next/navigation` como `vi.fn` que lanza):
  - [x] Sin sesión → `redirect('/login?redirect=%2Fcheck-in%3Ftoken%3D<token>')`.
  - [x] Sesión `client` → muestra la vista "403 · Acceso denegado" y no renderiza `CheckInProcessor`.
  - [x] Sesión `coach` o `admin` → renderiza `CheckInProcessor` con el token.
  - [x] Token ausente, mal formado o en arreglo → "Código QR inválido o ya utilizado", sin `CheckInProcessor`.
- **🔴 Tests del processor** (con `fetch` mockeado):
  - [x] Hace un solo `POST /api/check-in` con `{ token }`, incluso dentro de `<StrictMode>`.
  - [x] Respuesta 200 → "¡Asistencia confirmada! Bienvenido(a) Ana".
  - [x] Respuesta 404 (token reusado o inválido) → "Código QR inválido o ya utilizado".
  - [x] Respuestas 403 (`FORBIDDEN_ROLE`, `NOT_CLASS_COACH`) y cada 409 → su mensaje de SPEC §7.2.
  - [x] Respuesta 401 → enlace a `/login?redirect=…`.
  - [x] Error de red → mensaje y botón "Reintentar".
  - [x] El resultado se anuncia en una región `aria-live="polite"`.
- **Verificación:**
  ```bash
  pnpm test src/app/check-in/__tests__/page.test.tsx src/components/coach/__tests__/CheckInProcessor.test.tsx
  ```

## TASK-QR-FE-02 — `CheckinQrButton` y `CheckinQrModal` (cliente)

- **Tipo:** Frontend (Client Components, mobile-first)
- **Archivos:** `src/components/client/CheckinQrButton.tsx`, `src/components/client/CheckinQrModal.tsx`, `src/components/client/__tests__/CheckinQrButton.test.tsx` (nuevos)
- **Descripción:** implementa SPEC §10.1, incluido el polling a `/api/check-in/status`. Sigue el patrón visual de `BankTransferModal.tsx`.
- **🔴 Tests** (`useRouter` y `fetch` mockeados; fake timers):
  - [x] El botón "Ver mi código QR" es visible. Al hacer clic se abre un `dialog` con nombre accesible y una imagen con `alt` descriptivo.
  - [x] `Esc` y "Cerrar" cierran el modal y el foco vuelve al botón.
  - [x] Con el modal abierto consulta `/api/check-in/status?enrollmentId=<id>` cada 3000 ms. Con el modal cerrado no consulta.
  - [x] Una respuesta `attended` muestra "¡Asistencia confirmada!", cierra el modal y llama a `router.refresh()` una sola vez.
  - [x] Una respuesta 404 o 401 detiene el polling.
  - [x] El polling se detiene al desmontar el componente (sin fugas de intervalos) y al cumplirse 15 min.
- **Verificación:**
  ```bash
  pnpm test src/components/client/__tests__/CheckinQrButton.test.tsx
  ```

## TASK-QR-FE-03 — Integración en el dashboard del cliente

- **Tipo:** Full-stack (query y UI)
- **Archivos:** `src/lib/queries/next-class.ts` (nuevo), `src/lib/queries/__tests__/next-class.test.ts` (nuevo), `src/app/(portal)/client/page.tsx` (`getNextClass` y líneas 243-267), `src/app/(portal)/client/__tests__/page.test.tsx`
- **Descripción:** implementa SPEC §10.1. `getNextClass` sale de `page.tsx` y queda como `getNextClassWithCheckin(userId, now)`, que incluye el fallback del token, la generación del QR y el corte de D3. En `page.tsx` la tarjeta solo agrega `<CheckinQrButton />`.
- **🔴 Tests:**
  - [x] `getNextClassCutoff(now)` devuelve `now − 50 min` (D3).
  - [x] Con el token en `NULL` se llama a `ensureCheckinToken(enrollmentId)` y se devuelve el token nuevo junto con `qrDataUrl`.
  - [x] Si hay token, no se llama a `ensureCheckinToken`.
  - [x] Si `ensureCheckinToken` o el QR lanzan un error, el resultado llega sin QR y no se propaga el error.
  - [x] En la página, una próxima clase con token muestra el botón "Ver mi código QR".
  - [x] Sin próxima clase no hay botón.
  - [x] Los tests existentes de `page.test.tsx` siguen en verde.
- **Verificación:**
  ```bash
  pnpm test src/lib/queries/__tests__/next-class.test.ts "src/app/(portal)/client/__tests__/page.test.tsx"
  ```

## TASK-QR-VERIFY-01 — Verificación final

- **Tipo:** QA
- **Comandos:**
  ```bash
  pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build
  ```
- **E2E manual.** ⚠️ Usar una BD que **no** sea de producción. Poner `NEXT_PUBLIC_APP_URL=http://192.168.100.68:3000` para que el QR se pueda escanear en la LAN; esa IP ya está en `allowedDevOrigins`.
  - [ ] El cliente ve "Ver mi código QR" en su próxima clase (probar en 375 px, sin scroll horizontal).
  - [ ] Un coach sin sesión escanea → pasa por el login → vuelve a `/check-in` → ve "¡Asistencia confirmada! Bienvenido(a) …".
  - [ ] El modal del cliente se cierra solo en ≤ 3 s y el botón desaparece.
  - [ ] Escanear de nuevo el mismo QR → "Código QR inválido o ya utilizado".
  - [ ] El cliente escanea su propio QR → recibe 403.
  - [ ] Un coach de otra clase → "Esta reserva es de una clase de otro coach."
  - [ ] Cron local: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/complete-classes` devuelve `markedAbsent` con el valor esperado.

## TASK-QR-DB-03 — 🔒 Ejecución en producción (la hace el usuario)

- **Tipo:** Operación manual. Claude no la ejecuta.
- **Pasos** (SPEC §12), **antes del deploy:**
  - [ ] Fijar `ATTENDANCE_AUTO_CLOSE_FROM` con la fecha real de salida (00:00 CDMX) en el PR.
  - [ ] Correr los pre-checks de SPEC §8.1 y revisar el conteo B (decisión D4).
  - [ ] Ejecutar `sql/manual/2026-09-22_001_qr_checkin_columns.sql` y verificar con SPEC §3.3.
  - [ ] Ejecutar `sql/manual/2026-09-22_002_qr_checkin_backfill.sql` y verificar con SPEC §8.3.
  - [ ] Hacer merge a `production` y el deploy.
  - [ ] Al día siguiente, revisar `markedAbsent` en la respuesta del cron.
- **Verificación:** las consultas de SPEC §3.3 y §8.3 devuelven los resultados esperados.

## Criterios de aceptación globales

- [x] Todos los casos obligatorios de la matriz de trazabilidad están cubiertos y en verde.
- [x] Ningún archivo ejecuta ni documenta `db:push`, `db:migrate` ni `drizzle-kit push` contra la BD viva.
- [x] El enum `enrollment_status` no cambia.
- [x] Rol y titularidad se validan en el backend (página, API y servicio).
- [x] `page.tsx` solo agrega `<CheckinQrButton />` en la tarjeta de la próxima clase.
- [x] La UI es mobile-first y accesible (dialog, foco, `aria-live`, alt).

---

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

---

# TASK_RUNNER — Decremento Admin de Créditos + Duración de Clases a 50 Minutos

**Estado:** ✅ Ejecutado
**Prioridad:** Alta (feature administrativo + fix transversal de negocio)
**Sin migraciones:** `days_remaining`, `active`, `status` ya existen en `user_suscriptions`.
**Decisiones confirmadas por el usuario:**
1. Open Lab (`subscriptions.guest === true`) es ilimitado → excluido del decremento (oculto en UI, rechazado en backend).
2. El buffer de auto-completado de clases también pasa de 60 → 50 min (la clase se marca `completed` 50 min tras su inicio).
3. Al llegar a 0 créditos se setea `active=false`, `status='expired'` y `expirationDate = new Date()` (consistente con `check-subscription-expiration.ts:110`).

**Orden de ejecución estricto:**
`BE-01 → BE-02 → UI-01 → FIX-01 → FIX-02 → TEST-01 → VERIFY-01`

**Mapeo de nomenclatura (requerimiento → modelo real):**

| Requerimiento | Modelo real (Drizzle) |
|---|---|
| `credits` / saldo de créditos | `userSubscriptions.daysRemaining` (`days_remaining`) |
| `is_active` | `userSubscriptions.active` (boolean) |
| `status = 'expired'` | `subscriptionStatusEnum`: `'pending' \| 'active' \| 'suspended' \| 'expired'` |
| Suscripción "Ilimitada" | `subscriptions.guest === true` (Open Lab) — no usa créditos |
| `end_time` | **No existe columna**; la duración se deriva por display/lógica (`+ 60 * 60 * 1000`) |

---

## TASK-ADMIN-DECREMENT-CREDIT-API (BE-01)

- **Archivo:** `src/actions/admin.ts` (agregar función nueva después de `refundSessionCreditAction`, L345-382)
- **Contexto:** replicar guards de `suspendSubscriptionAction` (L269-298): sesión + `role === 'admin'`,
  `findFirst` sobre `userSubscriptions`, y lookup del plan para excluir Open Lab (`plan?.guest === true`).
- **Instrucción — `decrementSubscriptionCreditAction(subscriptionId: string): Promise<ActionResult>`:**
  1. Guard admin (patrón exacto de L272-275): sin sesión o rol distinto → `'No tienes permisos para esta acción.'`.
  2. `subscriptionId` presente; suscripción existe → si no, `'Suscripción no encontrada.'`.
  3. Plan `guest === true` → `{ success: false, error: 'Open Lab es ilimitado; no usa créditos.' }`.
  4. `status === 'expired'` → `{ success: false, error: 'La suscripción ya está vencida.' }` (400-equivalente).
  5. `(daysRemaining ?? 0) <= 0` → `{ success: false, error: 'La suscripción no tiene créditos disponibles.' }` (400-equivalente).
  6. **Transacción** (`db.transaction`, patrón de `suspendSubscriptionAction` L316-339):
     ```ts
     let newCredits: number | undefined;
     await db.transaction(async (tx) => {
       // Decremento atómico con guard (anti race-condition; mismo espíritu que el FOR UPDATE de enrollment.ts)
       const result = await tx.execute(sql`
         UPDATE user_suscriptions
         SET days_remaining = days_remaining - 1
         WHERE id = ${subscriptionId} AND days_remaining > 0
         RETURNING days_remaining
       `);
       newCredits = (result[0] ?? result.rows?.[0])?.days_remaining as number | undefined;
       if (newCredits === undefined) {
         throw new Error('La suscripción no tiene créditos disponibles.'); // rollback
       }
       // Último crédito consumido → expired (NUNCA suspended)
       if (newCredits === 0) {
         await tx
           .update(userSubscriptions)
           .set({ active: false, status: 'expired', expirationDate: new Date() })
           .where(eq(userSubscriptions.id, subscriptionId));
       }
     });
     ```
     La función debe envolver el `db.transaction` en `try/catch` y retornar el error capturado como
     `{ success: false, error }` (patrón de las acciones existentes).
  7. `revalidatePath('/admin/subscriptions')`.
  8. Retornar en éxito:
     ```ts
     return {
       success: true,
       message: newCredits === 0
         ? 'Crédito descontado. La suscripción llegó a 0 créditos y fue marcada como vencida.'
         : `Crédito descontado. Créditos restantes: ${newCredits}.`,
       data: { daysRemaining: newCredits, expired: newCredits === 0 },
     };
     ```
- **Prevención:** NUNCA setear `status: 'suspended'` en este flujo; NO modificar
  `suspendSubscriptionAction`, `reactivateSubscriptionAction` ni `refundSessionCreditAction`;
  NO tocar `check-subscription-expiration.ts`.
- **Verificación:** `pnpm exec tsc --noEmit` + tests de BE-02.

## TASK-ADMIN-DECREMENT-CREDIT-TESTS (BE-02)

- **Archivo:** `src/actions/__tests__/admin-subscription.test.ts` (extender — ya mockea `db`, `getSession`, `revalidatePath`)
- **Contexto:** seguir el estilo de los tests existentes de `suspendSubscriptionAction`/`refundSessionCreditAction`.
  El mock de `tx.execute` debe retornar el nuevo `days_remaining`.
- **Casos mínimos:**
  1. Sin sesión / rol no-admin → rechazado, cero writes.
  2. `daysRemaining = 5` → queda en 4, `active`/`status` intactos, `data.expired === false`.
  3. **`daysRemaining = 1` → queda en 0 Y se ejecuta `set({ active: false, status: 'expired', expirationDate })`** (crítico).
  4. `daysRemaining = 0` → error, cero writes.
  5. `status = 'expired'` → error, cero writes.
  6. Plan Open Lab (`guest: true`) → error, cero writes.
  7. UPDATE con guard retorna vacío (race) → rollback, error, sin update de status.
- **Verificación:** `pnpm vitest run src/actions/__tests__/admin-subscription.test.ts`

## TASK-ADMIN-DECREMENT-CREDIT-UI (UI-01)

- **Archivo:** `src/components/admin/SubscriptionManagement.tsx`
- **Contexto:** botones de acción L380-417 (bloque `effectiveStatus === 'active'`); modales L489-518;
  `localStatusState` L78; `pendingAction` L65; `handleRefundConfirm` L196-214 como patrón.
- **Instrucción:**
  1. Importar `decrementSubscriptionCreditAction` de `@/actions/admin` (junto a las acciones L9-14).
  2. Estado nuevo: `confirmDecrementId` + `confirmDecrementName` (patrón de refund L69-70) y
     `localCreditsState: Record<string, number>` para optimistic UI de créditos.
  3. **Botón "Descontar Crédito"** dentro del bloque `effectiveStatus === 'active'` (junto a
     "Otorgar Crédito"), visible solo si `!sub.isOpenLab`. Estilo sugerido: borde de error
     (`text-error border border-error/30`, patrón del botón Rechazar de `PaymentManagement.tsx` L329).
     `disabled` si `(localCreditsState[id] ?? sub.daysRemaining ?? 0) <= 0` o si el `pendingAction` es el suyo.
  4. **Modal de confirmación** reutilizando `Modal` de `@/components/ui/Modal`, `variant="danger"`:
     título "Descontar crédito", `confirmLabel="Sí, descontar"`, `cancelLabel="Cancelar"`,
     cuerpo: `¿Estás seguro de descontar 1 crédito a este usuario?` + nombre del cliente + nota
     condicional: si el crédito actual es 1 → *"Al llegar a 0 la suscripción se marcará como vencida."*.
  5. Handler `handleDecrementConfirm` (patrón de `handleRefundConfirm` L196-214): en éxito,
     `setLocalCreditsState(prev => ({ ...prev, [id]: result.data.daysRemaining }))`; si
     `result.data.expired` → `setLocalStatusState(prev => ({ ...prev, [id]: 'expired' }))`.
  6. El contador de créditos (L363) debe leer `localCreditsState[sub.subscriptionId] ?? sub.daysRemaining ?? 0`.
- **Prevención:** no mostrar el botón en suscripciones `suspended`/`expired`/`pending`
  (el bloque `active` ya lo garantiza); Open Lab mantiene "Ilimitadas" sin botón.
- **Verificación:** `pnpm exec eslint src/components/admin/SubscriptionManagement.tsx` + `pnpm build`.

## TASK-CLASSES-50-MINUTES-CONSTANT (FIX-01)

- **Archivo:** `src/lib/utils/date.ts` (agregar junto a `GRACE_PERIOD_MINUTES`, L213)
- **Instrucción:**
  ```ts
  /** Duración oficial de TODAS las clases del estudio (minutos). */
  export const CLASS_DURATION_MINUTES = 50;
  export const CLASS_DURATION_MS = CLASS_DURATION_MINUTES * 60 * 1000;
  /** end_time derivado: start + 50 min (no existe columna end_time; la duración es fija). */
  export function getClassEndTime(classStart: Date): Date {
    return new Date(classStart.getTime() + CLASS_DURATION_MS);
  }
  ```
- **Verificación:** `pnpm exec tsc --noEmit`.

## TASK-CLASSES-50-MINUTES-APPLY (FIX-02)

- **Archivos y rangos exactos:**
  1. `src/components/sections/Schedule.tsx:11-15` — `formatClassTimeRange`: reemplazar
     `new Date(classStart.getTime() + 60 * 60 * 1000)` por `getClassEndTime(classStart)`
     (importar de `@/lib/utils/date`).
  2. `src/components/sections/SpecialEvent.tsx:8-11` — mismo reemplazo.
  3. `src/lib/queries/class-auto-completion.ts:18` — `const bufferTime = new Date(Date.now() - CLASS_DURATION_MS);`
     (importar la constante). Actualizar el comentario: la clase se auto-completa 50 min después de su inicio.
- **NO tocar (verificado que no son duración de clase):**
  - `src/actions/auth.ts:156` (expiry de token de reset), `src/lib/auth/rate-limiter.ts:49` (ventana rate-limit),
    `src/actions/admin.ts:430` (vigencia 30 días de suscripción), `src/db/seed.ts:206` (fecha de pago),
    `src/actions/enrollment.ts:292,377` y `src/actions/guest.ts:612,824` (ventana 24h de cancelación — regla distinta).
  - `src/__tests__/preservation-property.test.ts:305` (+60min es garantía de "futuro", no aserción de duración).
  - Formularios `AdminCreateClassForm` / `CreateClassForm` / `AddEventClassForm` / `EditClassModal`:
    no tienen input de duración ni `end_time`; nada que cambiar.
  - `src/db/seed.ts`: las clases solo insertan `classDate` (inicio); sin offset de duración que corregir.
- **Verificación:** `rg -n "60 \* 60 \* 1000" src` solo debe listar `auth.ts` y `rate-limiter.ts` tras el cambio.

## TASK-CLASSES-50-MINUTES-TESTS (TEST-01)

- **Archivos:**
  - `src/components/sections/__tests__/schedule-helpers.test.ts` (extender): aserción de rango
    `"09:30 A.M. - 10:20 A.M."` (50 min exactos, cruce de hora).
  - `src/lib/utils/__tests__/class-duration.test.ts` (crear): `getClassEndTime` → 09:30 → 10:20;
    16:20 → 17:10; y `CLASS_DURATION_MINUTES === 50`.
  - `src/lib/queries/__tests__/class-auto-completion.test.ts` (crear): clase con
    `classDate = now - 49min` → NO se auto-completa; `now - 51min` → SÍ se auto-completa.
- **Verificación:** `pnpm vitest run src/components/sections src/lib/utils src/lib/queries`

## TASK-VERIFY-01 — Verificación final

```bash
pnpm exec tsc --noEmit
pnpm exec eslint src/actions/admin.ts src/components/admin/SubscriptionManagement.tsx \
  src/lib/utils/date.ts src/components/sections/Schedule.tsx \
  src/components/sections/SpecialEvent.tsx src/lib/queries/class-auto-completion.ts
pnpm test
pnpm build
```

### Criterio de Aceptación
- [ ] Admin descuenta 1 crédito con confirmación; con 1 crédito restante la suscripción pasa a
      `status='expired'` + `active=false` + `expirationDate` (NUNCA `suspended`).
- [ ] Botón deshabilitado con 0 créditos / suscripción vencida; backend rechaza con error (400-equivalente).
- [ ] Open Lab no muestra el botón y el backend lo rechaza.
- [ ] Decremento dentro de transacción con guard atómico `days_remaining > 0`.
- [ ] Toda clase renderiza fin = inicio + 50 min (9:30→10:20, 16:20→17:10) en landing y eventos.
- [ ] Auto-completado dispara a los 50 min, no a los 60.
- [x] `tsc`, `eslint` (archivos tocados), `pnpm test` y `pnpm build` en verde.

### Resultado de la verificación
- `pnpm exec tsc --noEmit` → 0 errores.
- `pnpm exec eslint <archivos tocados>` → 0 errores / 0 warnings.
- `pnpm test` → **62 archivos / 498 tests pasando** (+9 tests nuevos: 8 de decremento, 7 nuevos repartidos entre duración y auto-completado; archivo de suscripción pasó de 6 a 14).
- `pnpm build` → **Compiled successfully** (Next.js 16.3.5, Turbopack).

**Nota de implementación:** el decremento usa el query builder de Drizzle
(`tx.update(...).set({ daysRemaining: sql\`days_remaining - 1\` }).where(and(eq(id), gt(daysRemaining, 0))).returning(...)`)
en lugar de SQL crudo con `RETURNING`, por ser idiomático y type-safe; mantiene el guard atómico
anti race-condition y la transacción.
