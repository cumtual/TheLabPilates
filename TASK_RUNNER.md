# TASK_RUNNER.md — Caché de la landing (Opción B: ISR + revalidación on-demand)

## Diagnóstico
La landing `/` no usa APIs dinámicas y `Schedule.tsx` consulta DB con el driver `postgres`
(no `fetch`), por lo que Next la prerenderiza estática: las consultas corrían solo en build y
quedaban cacheadas sin expiración, congelando la ventana rolling y el filtro de clases pasadas.
No existía `revalidate`, `dynamic` ni revalidación de `/` en ninguna acción.

## Solución
- ISR con respaldo de 5 min en la página.
- Revalidación on-demand de `/` en las mutaciones que afectan horarios o cupos.

---

### TASK-CACHE-01 · ISR con respaldo de 5 min
- **Archivo:** `src/app/page.tsx`
- **Instrucción:** `export const revalidate = 300;` a nivel de módulo.
- **Verificación:** `pnpm exec tsc --noEmit`

### TASK-CACHE-02 · Revalidación on-demand del ciclo de vida de clases
- **Archivos:**
  - `src/actions/admin.ts` — `cancelClassAction` y `adminCreateClassAction`: `revalidatePath('/')`.
  - `src/actions/coach.ts` — `createClassAction`: `revalidatePath('/coach/classes')` + `revalidatePath('/')`;
    `completeClassAction`: `revalidatePath('/coach/classes')` + `revalidatePath('/')`.
- **Verificación:** `pnpm exec tsc --noEmit`

### TASK-CACHE-03 · Revalidación on-demand por disponibilidad
- **Archivos:** `src/actions/enrollment.ts`, `src/actions/guest.ts`, `src/actions/admin-guest.ts`
- **Instrucción:** `revalidatePath('/')` junto a cada bloque de revalidación de inscripción,
  reserva con invitado y cancelación.
- **Verificación:** `pnpm exec tsc --noEmit`

### TASK-CACHE-04 · Tests + gate
- `coach.test.ts` no mockeaba `next/cache`; se añadió `vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))`.
- **Gate:**
  ```bash
  pnpm exec tsc --noEmit
  pnpm exec eslint src/app/page.tsx src/actions/admin.ts src/actions/coach.ts src/actions/enrollment.ts src/actions/guest.ts src/actions/admin-guest.ts
  pnpm exec vitest run
  ```
- **Aceptación opcional (producción):** `pnpm build` y confirmar que `/` figura como ISR.

## Resultado
- `tsc` exit 0 · `eslint` 0 errores · `vitest` 50 files / 411 tests verdes.
