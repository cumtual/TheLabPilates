-- Feature: paquetes especiales — compatibilidad y carga del catálogo (SPEC-SPECIAL-PACKAGES §3.3)
-- DML idempotente y no destructivo. Requiere haber corrido 2026-10-07_001_special_packages.sql.
-- ANTES (solo lectura): confirmar que los nombres coinciden y revisar precios:
--   SELECT id, name, sessions, guest, price FROM public.suscriptions ORDER BY name;
--   SELECT user_id, count(*) FROM public.user_suscriptions WHERE active GROUP BY user_id HAVING count(*) > 1;
-- Ejecutar: psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f sql/manual/2026-10-07_002_catalog_compat_backfill.sql
--
-- Compatibilidad: no toca user_suscriptions ni class_enrolleds. Sus columnas nuevas quedan
-- en NULL, que es lo que mantiene el comportamiento de siempre (30 días, precio del catálogo,
-- reembolso a days_remaining).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 1) Paquetes de la landing que falten en la BD (S2). Idempotente por nombre.
INSERT INTO public.suscriptions (name, sessions, guest, price)
SELECT v.name, v.sessions, v.guest, v.price
FROM (VALUES
  ('Lab Pass',      1, false,   95),
  ('Lab Entry',     4, false,  360),
  ('Lab Practice',  8, false,  680),
  ('Lab Progress', 12, false,  960),
  ('Open Lab',     30, true,  1850)
) AS v(name, sessions, guest, price)
WHERE NOT EXISTS (SELECT 1 FROM public.suscriptions s WHERE s.name = v.name);

-- 2) Metadatos de la landing (solo si no se han capturado).
UPDATE public.suscriptions SET short_description = 'Todo comienza con un primer paso.',
  features = ARRAY['Mat Pilates','Barre','Yoga'], display_order = 1
  WHERE name = 'Lab Pass' AND short_description IS NULL;
UPDATE public.suscriptions SET short_description = 'Empieza a descubrir de lo que eres capaz.',
  features = ARRAY['Flexibilidad de horario'], display_order = 2
  WHERE name = 'Lab Entry' AND short_description IS NULL;
UPDATE public.suscriptions SET short_description = 'La constancia construye resultados.',
  features = ARRAY['Flexibilidad de horario'], display_order = 3
  WHERE name = 'Lab Practice' AND short_description IS NULL;
UPDATE public.suscriptions SET short_description = 'Cada movimiento te acerca a tu mejor versión.',
  features = ARRAY['-10%OFF Coffee Bar','Flexibilidad de horario'], display_order = 4
  WHERE name = 'Lab Progress' AND short_description IS NULL;
UPDATE public.suscriptions SET short_description = 'Haz del movimiento parte de tu vida.',
  features = ARRAY['-10%OFF Coffee Bar','1 Invitado mensual','1er Kit de regalo'],
  display_order = 5, is_featured = true, guest_credits = 1
  WHERE name = 'Open Lab' AND short_description IS NULL;

COMMIT;

-- Verificación (solo lectura): la primera debe devolver 0 filas y la segunda, los 5 paquetes.
-- SELECT id, name FROM public.suscriptions WHERE is_active AND deleted_at IS NULL AND short_description IS NULL;
-- SELECT name, sessions, guest, price, short_description, features, display_order, is_featured
--   FROM public.suscriptions ORDER BY display_order;
