-- =============================================================================
-- Auditoría de cancelaciones (SPEC-CANCELLATION-AUDIT-AND-TERMS §2.1)
-- ADITIVO e IDEMPOTENTE. Seguro sobre datos reales en producción.
--
-- Columna nullable sin valor por defecto: solo cambia metadatos (no reescribe la
-- tabla) y el lock dura milisegundos. Sin backfill: las cancelaciones previas
-- quedan en NULL ("Sin registro"), porque no existe un timestamp confiable.
--
-- Ejecutar ANTES del deploy. Puede ejecutarse más de una vez sin efectos.
-- =============================================================================
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.class_enrolleds
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE NULL;

ALTER TABLE public.guest_enrollments
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE NULL;

COMMENT ON COLUMN public.class_enrolleds.cancelled_at IS
  'Momento (UTC) en que la inscripción pasó a cancelled/late_cancelled. NULL = no cancelada o cancelada antes de 2026-09-24 (sin registro). Uso exclusivo de admin.';

COMMENT ON COLUMN public.guest_enrollments.cancelled_at IS
  'Momento (UTC) en que la inscripción del invitado pasó a cancelled/late_cancelled. NULL = no cancelada o sin registro. Uso exclusivo de admin.';

COMMIT;

-- Verificación (solo lectura):
-- SELECT table_name, column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name IN ('class_enrolleds', 'guest_enrollments')
--    AND column_name = 'cancelled_at';
