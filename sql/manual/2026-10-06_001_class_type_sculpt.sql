-- Feature: nuevo tipo de clase «Sculpt» (open_class.class_type)
-- Aditivo e idempotente: re-ejecutarlo no cambia nada. No toca filas existentes.
-- Ejecutar: psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f sql/manual/2026-10-06_001_class_type_sculpt.sql
--
-- Excepción explícita a la regla «sin ALTER TYPE» de CLAUDE.md: ADD VALUE IF NOT EXISTS
-- solo agrega una etiqueta al enum; no renombra, no elimina ni reescribe la tabla.
-- Requiere PostgreSQL 12+ para ir dentro de BEGIN/COMMIT (Supabase cumple).
-- El valor nuevo no puede usarse dentro de esta misma transacción; por eso no hay INSERT aquí.
--
-- Permisos por rol: NO hay RLS. La app usa un único usuario de BD con JWT propio,
-- así que la regla admin/coach se aplica en las server actions
-- (src/lib/utils/class-type.ts → canRoleCreateClassType).
BEGIN;
SET LOCAL lock_timeout = '5s';        -- si el catálogo está ocupado, aborta en vez de encolar tráfico real
SET LOCAL statement_timeout = '60s';

ALTER TYPE public.class_type ADD VALUE IF NOT EXISTS 'sculpt' AFTER 'personalizada';

COMMIT;

-- Verificación (solo lectura). Debe listar: yoga, mat_pilates, barre, personalizada, sculpt
-- SELECT e.enumlabel
-- FROM pg_enum e
-- JOIN pg_type t ON t.oid = e.enumtypid
-- WHERE t.typname = 'class_type'
-- ORDER BY e.enumsortorder;
