# TASK_RUNNER.md — Landing: listado dinámico de clases (rolling week)

## Diagnóstico

`src/components/sections/ScheduleClient.tsx:9` tiene `const COMING_SOON = true`, que fuerza el
branch "Próximamente" (L36–47). Debajo ya existe todo el diseño (picker, tarjetas, empty states).
El servidor `src/components/sections/Schedule.tsx` consulta `open_classes` con semana ISO
(Lunes→Domingo), sin filtrar clases pasadas ni cupos.

Brechas: (1) rolling D0–D6 desde hoy; (2) excluir clases ya iniciadas/pasadas y canceladas;
(3) cupos → "N lugares" / badge SOLD OUT; (4) empty state sin layout shift; (5) targets táctiles
44px. CTA "Reservar" → `/login`.

---

### TASK-LANDING-SCHEDULE-01 · Helpers puros de rolling week
- **Archivo (nuevo):** `src/components/sections/schedule-utils.ts`
- **Contenido:** `getRollingWeekRange(now)` (hoy 00:00 → +6d 23:59:59), `getRollingDayIndex(classDate, start)` (0..6),
  `getRollingDays(start)` (7 labels `{label, sub}` con `Intl.DateTimeFormat('es-MX')`).
- **Verificación:** `pnpm exec tsc --noEmit`

### TASK-LANDING-SCHEDULE-02 · Query rolling + futuro + cupos
- **Archivo:** `src/components/sections/Schedule.tsx`
- **Cambios:** usar `getRollingWeekRange(now)`; `where` += `gte(openClasses.classDate, now)`;
  select += `capacity`; conteo de ocupación por `openClassId` (class + guest enrollments activos,
  excluyendo cancelled/late_cancelled, con `inArray` + 2 `groupBy` + `Map`); `WeekClass` += `spotsLeft`;
  `dayIndex = getRollingDayIndex(...)`; pasar `days={getRollingDays(start)}` al cliente.
- **Verificación:** `pnpm exec tsc --noEmit`

### TASK-LANDING-SCHEDULE-03 · Picker rolling + cupos + CTA `/login`
- **Archivo:** `src/components/sections/ScheduleClient.tsx`
- **Cambios:** eliminar `COMING_SOON` y su branch; renderizar tabs desde `days` (con `snap-x`,
  `min-h-11`); tarjetas con "N lugar(es) disponible(s)" o badge SOLD OUT; CTA `href="/login"`
  deshabilitado visualmente si SOLD OUT; empty state por día con `min-h-[280px]` (anti layout-shift).
- **Verificación:** `pnpm exec eslint src/components/sections/ScheduleClient.tsx`

### TASK-LANDING-SCHEDULE-04 · Test de helpers
- **Archivo (nuevo):** `src/components/sections/__tests__/schedule-helpers.test.ts`
- **Casos:** rango D0→D6, cruce de mes/año, índices hoy=0/mañana=1/+6=6, 7 labels.
- **Verificación:** `pnpm exec vitest run "src/components/sections/__tests__/schedule-helpers.test.ts"`

## Gate final
```bash
pnpm exec tsc --noEmit
pnpm exec eslint src/components/sections/Schedule.tsx src/components/sections/ScheduleClient.tsx src/components/sections/schedule-utils.ts
pnpm exec vitest run
```
