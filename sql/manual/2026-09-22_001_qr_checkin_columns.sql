-- Feature: Asistencia por QR (SPEC-QR-CHECKIN §3.2)
-- Aditivo e idempotente: re-ejecutarlo no cambia nada. No toca datos existentes.
-- Ejecutar: psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f sql/manual/2026-09-22_001_qr_checkin_columns.sql
BEGIN;
SET LOCAL lock_timeout = '5s';        -- si la tabla está ocupada, aborta en vez de encolar tráfico real
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.class_enrolleds
  ADD COLUMN IF NOT EXISTS checkin_token varchar(64);

ALTER TABLE public.class_enrolleds
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'class_enrolleds_checkin_token_unique'
      AND conrelid = 'public.class_enrolleds'::regclass
  ) THEN
    ALTER TABLE public.class_enrolleds
      ADD CONSTRAINT class_enrolleds_checkin_token_unique UNIQUE (checkin_token);
  END IF;
END
$$;

COMMENT ON COLUMN public.class_enrolleds.checkin_token IS
  'Token QR de un solo uso (64 hex). Válido solo con status = pending; NULL tras attended/absent.';
COMMENT ON COLUMN public.class_enrolleds.checked_in_at IS
  'Momento del check-in (QR o asistencia manual) cuando status pasa a attended.';

COMMIT;
