-- Feature: paquetes especiales (SPEC-SPECIAL-PACKAGES §3.1)
-- Aditivo e idempotente. No modifica filas existentes: los defaults reproducen el comportamiento actual.
-- Ejecutar: psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f sql/manual/2026-10-07_001_special_packages.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Catálogo
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'standard';
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS validity_days integer NULL;          -- NULL = 30
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS guest_credits integer NOT NULL DEFAULT 0;
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS short_description varchar(49) NULL;
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS features text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE public.suscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscriptions_kind_chk') THEN
    ALTER TABLE public.suscriptions ADD CONSTRAINT suscriptions_kind_chk
      CHECK (kind IN ('standard', 'special'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscriptions_validity_chk') THEN
    ALTER TABLE public.suscriptions ADD CONSTRAINT suscriptions_validity_chk
      CHECK (validity_days IS NULL OR validity_days BETWEEN 1 AND 365);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscriptions_guest_credits_chk') THEN
    ALTER TABLE public.suscriptions ADD CONSTRAINT suscriptions_guest_credits_chk
      CHECK (guest_credits BETWEEN 0 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscriptions_features_max4_chk') THEN
    ALTER TABLE public.suscriptions ADD CONSTRAINT suscriptions_features_max4_chk
      CHECK (cardinality(features) <= 4);
  END IF;
  -- H5: guest=true significa Open Lab (ilimitado). Un especial nunca lo es.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscriptions_special_not_open_lab_chk') THEN
    ALTER TABLE public.suscriptions ADD CONSTRAINT suscriptions_special_not_open_lab_chk
      CHECK (kind <> 'special' OR guest IS NOT TRUE);
  END IF;
END $$;

-- Reglas del catálogo
CREATE TABLE IF NOT EXISTS public.subscription_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suscription_id      uuid NOT NULL REFERENCES public.suscriptions(id) ON DELETE RESTRICT,
  label               varchar(60) NULL,                 -- NULL => se deriva de los tipos
  credits             integer NOT NULL CHECK (credits BETWEEN 1 AND 100),
  allowed_class_types public.class_type[] NOT NULL CHECK (cardinality(allowed_class_types) >= 1),
  window_start        time NULL,                        -- hora local America/Mexico_City
  window_end          time NULL,
  sort_order          smallint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_rules_window_pair_chk  CHECK ((window_start IS NULL) = (window_end IS NULL)),
  CONSTRAINT subscription_rules_window_order_chk CHECK (window_start IS NULL OR window_start < window_end)
);
CREATE INDEX IF NOT EXISTS subscription_rules_suscription_idx ON public.subscription_rules (suscription_id);

-- Saldo por grupo del alumno (copia de la regla al comprar, D4)
CREATE TABLE IF NOT EXISTS public.user_subscription_balances (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_suscription_id uuid NOT NULL REFERENCES public.user_suscriptions(id) ON DELETE CASCADE,
  rule_id             uuid NULL REFERENCES public.subscription_rules(id) ON DELETE SET NULL,
  label               varchar(60) NOT NULL,
  allowed_class_types public.class_type[] NOT NULL,
  window_start        time NULL,
  window_end          time NULL,
  credits_total       integer NOT NULL CHECK (credits_total > 0),
  credits_remaining   integer NOT NULL,
  sort_order          smallint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usb_remaining_range_chk CHECK (credits_remaining BETWEEN 0 AND credits_total),
  CONSTRAINT usb_unique_rule UNIQUE (user_suscription_id, rule_id)
);
CREATE INDEX IF NOT EXISTS usb_user_suscription_idx ON public.user_subscription_balances (user_suscription_id);

-- Copia al comprar (D4). NULL = suscripción anterior a este cambio => comportamiento actual.
ALTER TABLE public.user_suscriptions ADD COLUMN IF NOT EXISTS price_snapshot integer NULL;
ALTER TABLE public.user_suscriptions ADD COLUMN IF NOT EXISTS validity_days_snapshot integer NULL;
ALTER TABLE public.user_suscriptions ADD COLUMN IF NOT EXISTS guest_credits_snapshot integer NULL;

-- Qué grupo consumió cada reserva. NULL = reserva anterior => reembolso a days_remaining como hoy.
ALTER TABLE public.class_enrolleds ADD COLUMN IF NOT EXISTS balance_id uuid NULL
  REFERENCES public.user_subscription_balances(id) ON DELETE SET NULL;

COMMIT;
