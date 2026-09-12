# TASK_RUNNER.md — Actualizar Perfil / Cuenta (admin, coach, cliente)

## Contexto
- Hash: `bcryptjs` vía `hashPassword`/`verifyPassword` (`src/lib/auth/password.ts`). Reglas de
  contraseña existentes: 8–72 caracteres, errores con `field` (`src/actions/auth.ts`).
- Sin Zod: validación manual + `ActionResult.field` (`src/lib/types/actions.ts`).
- Mailer: Resend vía `sendEmail({to,subject,html})` (`src/lib/email/service.ts`), plantillas HTML inline.
- El "nombre" es `users.username` (schema.ts). El JWT no guarda username → cambiar nombre no re-emite token.
- Nav compartida: `src/components/layout/PortalNav.tsx` (`menuItems` por rol).

---

### TASK-BACKEND-PROFILE-ACTIONS · `src/actions/profile.ts` (nuevo)
- `updateNameAction(name)`: sesión → trim 2–100 → `db.update(users).set({ username }).where(id=sub)`
  → `revalidatePath`. Errores con `field:'name'`.
- `changePasswordAction({currentPassword,newPassword,confirmPassword})`: sesión → cargar user →
  `verifyPassword` (fallo → `field:'currentPassword'`, sin update) → longitud 8–72
  (`field:'newPassword'`) → match (`field:'confirmPassword'`) → `hashPassword` + update →
  `sendPasswordChangedEmail(...).catch(()=>{})` fire-and-forget.
- **Verificación:** `pnpm exec tsc --noEmit`

### TASK-MAILER-PASSWORD-CHANGED · `src/lib/email/service.ts`
- Añadir `sendPasswordChangedEmail(email, name)` con fecha vía `formatFullDateTime(new Date())`.
- **Verificación:** `pnpm exec eslint src/lib/email/service.ts`

### TASK-UI-PROFILE-FORM · `src/components/profile/ProfileSettingsForm.tsx` (nuevo, 'use client')
- Dos secciones independientes: "Información Personal" (input precargado con `initialName` + Guardar)
  y "Seguridad" (3 passwords + Actualizar). Errores por campo con `result.field`; limpieza de los 3
  inputs + mensaje de éxito al cambiar contraseña. Mobile-first (`min-h-11`, `Card`, `Input`).
- **Verificación:** `pnpm exec eslint src/components/profile/ProfileSettingsForm.tsx`

### TASK-UI-PROFILE-PAGES · 3 rutas
- `src/app/(portal)/client/profile/page.tsx`, `coach/profile/page.tsx`, `admin/profile/page.tsx`:
  `getSession` → `db.query.users.findFirst` → `<ProfileSettingsForm initialName={user.username} />`.
- **Verificación:** `pnpm exec tsc --noEmit`

### TASK-UI-NAV-LINKS · `src/components/layout/PortalNav.tsx`
- Añadir `{ label: 'Mi Perfil', href: '/<rol>/profile', icon: 'account_circle' }` a los 3 `menuItems`.
- **Verificación:** `pnpm exec eslint src/components/layout/PortalNav.tsx`

### TASK-TEST-PROFILE · `src/actions/__tests__/profile.test.ts` (nuevo)
- Casos: name válido/ inválido; password éxito (hash+update+email); current incorrecta;
  mismatch; longitud inválida (en los 3, cero updates).
- **Verificación:** `pnpm exec vitest run src/actions/__tests__/profile.test.ts`

## Gate final
```bash
pnpm exec tsc --noEmit
pnpm exec eslint src/actions/profile.ts src/lib/email/service.ts src/components/profile src/components/layout/PortalNav.tsx
pnpm exec vitest run
```
