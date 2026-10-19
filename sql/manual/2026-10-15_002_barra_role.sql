-- Módulo de Barra / Cafetería — rol `barra` (SPEC-CAFETERIA §3.2, D1)
-- Excepción aprobada a «sin ALTER TYPE»: ADD VALUE IF NOT EXISTS solo agrega una etiqueta al enum.
-- PostgreSQL 12+ (Supabase cumple). Correrlo aparte del 001.
-- Ejecutar: psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f sql/manual/2026-10-15_002_barra_role.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'barra';
COMMIT;
-- Verificación (solo lectura): SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--   WHERE t.typname = 'user_role' ORDER BY e.enumsortorder;
