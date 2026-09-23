-- Feature: Asistencia por QR (SPEC-QR-CHECKIN §8.2)
-- Idempotente: solo llena checkin_token donde es NULL. No modifica ninguna otra columna.
-- Requiere haber aplicado 2026-09-22_001_qr_checkin_columns.sql
-- Ejecutar: psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f sql/manual/2026-09-22_002_qr_checkin_backfill.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

UPDATE public.class_enrolleds AS ce
SET checkin_token = replace(gen_random_uuid()::text, '-', '')
                 || replace(gen_random_uuid()::text, '-', '')
FROM public.open_class AS oc
WHERE oc.id = ce.open_class_id
  AND ce.status = 'pending'
  AND ce.checkin_token IS NULL        -- idempotencia: nunca sobrescribe un token
  AND oc.status = 'scheduled'
  AND oc.class_date > now();

COMMIT;
