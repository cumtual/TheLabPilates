# TASK_RUNNER.md — Páginas legales (México): Aviso de Privacidad y Términos

## Contexto
La landing compone páginas públicas con `<Navbar/> + <main> + <Footer/> + <div className="grain"/>`.
No hay LandingLayout. Navbar fijo (`fixed top-0 z-50`) → el contenido requiere `pt-32`.
Tokens: `font-headline` (Playfair), `font-body` (Inter), `text-soft-charcoal`,
`text-on-surface-variant`, `text-primary`, `bg-surface-container-low`, `border-outline-variant`,
`py-section-gap`. Rutas nuevas, públicas (no están en el matcher del middleware).

Responsable confirmado: **The Lab Pilates Studio** · Matamoros & Calle Prolongación de Micaela
Galindo, Centro, 69000 Heroica Cdad. de Huajuapan de León, Oax. · contacto@thelabpilatesstudio.com.mx.

---

### TASK-LEGAL-SHELL · `src/components/legal/LegalShell.tsx`
- Wrapper (server component) con `Navbar`, `main` (`pt-32 pb-section-gap px-4 sm:px-6 lg:px-8`),
  `article` (`max-w-3xl mx-auto`), link "Volver al inicio", título, fecha, `children`, `Footer`, `grain`.
- Exporta también `LegalSection` (h2 + cuerpo con `leading-relaxed`).
- **Verificación:** `pnpm exec tsc --noEmit`

### TASK-PAGE-PRIVACY · `src/app/aviso-de-privacidad/page.tsx`
- Metadata + `LegalShell`. Secciones: Responsable, datos recabados, finalidades primarias y
  secundarias, derechos ARCO (20 días hábiles), cookies/JWT, cambios al aviso.
- **Verificación:** `pnpm exec eslint "src/app/aviso-de-privacidad/page.tsx"`

### TASK-PAGE-TERMS · `src/app/terminos-y-condiciones/page.tsx`
- Metadata + `LegalShell`. Cláusulas: aceptación, membresías (Open Lab / créditos / suspendidas),
  reservas y cancelación 24 h, uso responsable, aptitud física/deslinde, jurisdicción y PROFECO.
- **Verificación:** `pnpm exec eslint "src/app/terminos-y-condiciones/page.tsx"`

### TASK-FOOTER-LINKS · `src/components/layout/Footer.tsx`
- `"Privacy" href="#"` → `"Privacidad" href="/aviso-de-privacidad"`.
- `"Terms" href="#"` → `"Términos" href="/terminos-y-condiciones"`.
- (Opcional) mismos enlaces en `src/app/soon/page.tsx`.
- **Verificación:** `pnpm exec tsc --noEmit`

## Gate final
```bash
pnpm exec tsc --noEmit
pnpm exec eslint src/components/legal src/app/aviso-de-privacidad src/app/terminos-y-condiciones src/components/layout/Footer.tsx
pnpm exec vitest run
```
