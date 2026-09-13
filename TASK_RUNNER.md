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
