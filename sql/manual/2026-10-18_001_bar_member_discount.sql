-- Feature: descuento en la barra por membresía (SPEC-CAFETERIA D13)
-- Aditivo e idempotente: re-ejecutarlo no cambia nada. No modifica filas existentes
-- (los defaults dejan todo en 0 % / sin descuento).
-- Ejecutar: psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f sql/manual/2026-10-18_001_bar_member_discount.sql
--
-- Después de correrlo: en /admin/packages, editar Lab Progress y Open Lab y poner
-- «Descuento en la barra» = 10.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- % de descuento en la barra para quien tenga este paquete activo (0 = sin descuento)
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS bar_discount_percent smallint NOT NULL DEFAULT 0;

-- Pedido: subtotal (suma de líneas), descuento aplicado y de qué membresía salió.
-- subtotal_cents es NULL en pedidos anteriores a este cambio (su total ya es el cobrado).
ALTER TABLE public.bar_orders ADD COLUMN IF NOT EXISTS subtotal_cents integer NULL;
ALTER TABLE public.bar_orders ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.bar_orders ADD COLUMN IF NOT EXISTS discount_percent smallint NOT NULL DEFAULT 0;
ALTER TABLE public.bar_orders ADD COLUMN IF NOT EXISTS discount_label varchar(80) NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscriptions_bar_discount_chk') THEN
    ALTER TABLE public.suscriptions ADD CONSTRAINT suscriptions_bar_discount_chk
      CHECK (bar_discount_percent BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bar_orders_discount_chk') THEN
    ALTER TABLE public.bar_orders ADD CONSTRAINT bar_orders_discount_chk CHECK (
      discount_cents >= 0
      AND discount_percent BETWEEN 0 AND 100
      AND (subtotal_cents IS NULL OR total_cents = subtotal_cents - discount_cents)
      AND (discount_cents = 0 OR (subtotal_cents IS NOT NULL AND discount_label IS NOT NULL))
    );
  END IF;
END $$;

COMMIT;

-- Verificación (solo lectura):
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name IN ('suscriptions', 'bar_orders')
--    AND column_name IN ('bar_discount_percent', 'subtotal_cents', 'discount_cents', 'discount_percent', 'discount_label');
-- SELECT conname FROM pg_constraint WHERE conname IN ('suscriptions_bar_discount_chk', 'bar_orders_discount_chk');
