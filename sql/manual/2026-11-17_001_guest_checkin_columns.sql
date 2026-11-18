-- Feature: QR de asistencia para invitados (SPEC-GUEST-QR-CHECKIN §3.1)
-- Aditivo e idempotente: re-ejecutarlo no cambia nada. No toca datos existentes.
-- Ejecutar: psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f sql/manual/2026-11-17_001_guest_checkin_columns.sql
BEGIN;
SET LOCAL lock_timeout = '5s';        -- si la tabla está ocupada, aborta en vez de encolar tráfico real
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.guest_enrollments
  ADD COLUMN IF NOT EXISTS checkin_token varchar(64);

ALTER TABLE public.guest_enrollments
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

ALTER TABLE public.guest_enrollments
  ADD COLUMN IF NOT EXISTS checked_in_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guest_enrollments_checkin_token_unique'
      AND conrelid = 'public.guest_enrollments'::regclass
  ) THEN
    ALTER TABLE public.guest_enrollments
      ADD CONSTRAINT guest_enrollments_checkin_token_unique UNIQUE (checkin_token);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guest_enrollments_checked_in_by_users_id_fk'
      AND conrelid = 'public.guest_enrollments'::regclass
  ) THEN
    ALTER TABLE public.guest_enrollments
      ADD CONSTRAINT guest_enrollments_checked_in_by_users_id_fk
      FOREIGN KEY (checked_in_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

COMMENT ON COLUMN public.guest_enrollments.checkin_token IS
  'Token QR de un solo uso (64 hex). Solo invitados origin=admin. Válido con status = pending; NULL tras attended/absent.';
COMMENT ON COLUMN public.guest_enrollments.checked_in_at IS
  'Momento del check-in (QR o manual) al pasar a attended.';
COMMENT ON COLUMN public.guest_enrollments.checked_in_by IS
  'Usuario (coach/admin) que registró la asistencia.';

COMMIT;
