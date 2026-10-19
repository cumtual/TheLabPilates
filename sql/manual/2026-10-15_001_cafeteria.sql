-- Módulo de Barra / Cafetería — tablas (SPEC-CAFETERIA §3.1)
-- Aditivo e idempotente: re-ejecutarlo no cambia nada. Solo crea tablas nuevas y agrega
-- una columna con default a debit_cards; no modifica filas existentes.
-- Ejecutar: psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f sql/manual/2026-10-15_001_cafeteria.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.cafeteria_categories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id         uuid NULL REFERENCES public.cafeteria_categories(id) ON DELETE RESTRICT,  -- NULL = categoría padre (D10)
  name              varchar(60) NOT NULL,
  uses_temperature  boolean NOT NULL DEFAULT false,   -- solo se define en el padre; las subcategorías lo heredan (A1)
  sort_order        integer NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  courtesy_eligible boolean NULL,                     -- NULL = hereda del padre (el padre sin valor = no); true/false = fuerza (D3)
  deleted_at        timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cafeteria_categories_parent_chk CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT cafeteria_categories_temp_chk   CHECK (parent_id IS NULL OR NOT uses_temperature)  -- el interruptor vive solo en el padre
);
-- Nombre único entre hermanas (mismo padre); las raíces comparten el «padre» nulo
CREATE UNIQUE INDEX IF NOT EXISTS cafeteria_categories_name_uk
  ON public.cafeteria_categories (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cafeteria_categories_parent_idx ON public.cafeteria_categories (parent_id);

CREATE TABLE IF NOT EXISTS public.cafeteria_products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       uuid NOT NULL REFERENCES public.cafeteria_categories(id) ON DELETE RESTRICT,
  name              varchar(80) NOT NULL,
  price_cents       integer NOT NULL CHECK (price_cents BETWEEN 1 AND 1000000),
  temperature       varchar(4) NULL CHECK (temperature IN ('cold', 'hot')),   -- obligatoria solo si la categoría usa temperatura (regla de la app, §4.5)
  courtesy_override boolean NULL,                     -- NULL = hereda de la categoría; true/false = fuerza
  is_available      boolean NOT NULL DEFAULT true,    -- «agotado»: se ve en el menú pero no se vende
  is_active         boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  deleted_at        timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cafeteria_products_name_uk
  ON public.cafeteria_products (category_id, lower(name), COALESCE(temperature, '')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cafeteria_products_category_idx ON public.cafeteria_products (category_id);

-- Una sola fila (id = 1)
CREATE TABLE IF NOT EXISTS public.cafeteria_settings (
  id                     smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  coach_monthly_courtesy integer NOT NULL DEFAULT 4 CHECK (coach_monthly_courtesy BETWEEN 0 AND 31),
  closing_notify_emails  text[] NOT NULL DEFAULT ARRAY['thelabpilates77@gmail.com'],
  updated_by             uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cafeteria_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bar_cash_closings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by               uuid NOT NULL REFERENCES public.users(id),
  period_start             timestamptz NOT NULL,
  period_end               timestamptz NOT NULL,
  status                   varchar(24) NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'approved_with_shortfall')),
  orders_count             integer NOT NULL CHECK (orders_count > 0),
  cash_orders_count        integer NOT NULL,
  transfer_orders_count    integer NOT NULL,
  courtesy_items_count     integer NOT NULL DEFAULT 0,
  courtesy_value_cents     integer NOT NULL DEFAULT 0,
  cash_total_cents         integer NOT NULL CHECK (cash_total_cents >= 0),       -- cobrado en efectivo
  transfer_total_cents     integer NOT NULL CHECK (transfer_total_cents >= 0),
  cash_delivered_cents     integer NOT NULL,                                      -- lo que la barra entrega
  delivery_note            text NULL,
  resolved_by              uuid NULL REFERENCES public.users(id),
  resolved_at              timestamptz NULL,
  cash_received_cents      integer NULL,                                          -- lo que el admin recibió
  shortfall_cents          integer NULL,
  resolution_note          text NULL,
  created_email_status     varchar(8) NOT NULL DEFAULT 'pending' CHECK (created_email_status IN ('pending', 'sent', 'failed')),
  created_email_sent_at    timestamptz NULL,
  resolved_email_status    varchar(8) NULL CHECK (resolved_email_status IN ('pending', 'sent', 'failed')),
  resolved_email_sent_at   timestamptz NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bar_closing_delivered_range_chk CHECK (cash_delivered_cents BETWEEN 0 AND cash_total_cents),
  CONSTRAINT bar_closing_delivery_note_chk   CHECK (cash_delivered_cents = cash_total_cents OR delivery_note IS NOT NULL),
  CONSTRAINT bar_closing_resolution_chk CHECK (
    (status = 'pending' AND resolved_by IS NULL AND resolved_at IS NULL
       AND cash_received_cents IS NULL AND shortfall_cents IS NULL)
    OR (status = 'approved' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL
       AND cash_received_cents = cash_delivered_cents AND shortfall_cents = 0)
    OR (status = 'approved_with_shortfall' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL
       AND cash_received_cents >= 0 AND cash_received_cents < cash_delivered_cents
       AND shortfall_cents = cash_delivered_cents - cash_received_cents AND resolution_note IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS bar_closings_status_idx ON public.bar_cash_closings (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bar_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio            bigint GENERATED ALWAYS AS IDENTITY,
  request_id       uuid NOT NULL UNIQUE,            -- evita doble cobro por doble clic o reintento
  status           varchar(8) NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'voided')),
  customer_name    varchar(100) NULL,
  customer_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  payment_method   varchar(10) NULL CHECK (payment_method IN ('cash', 'transfer')),
  bank_account_id  uuid NULL REFERENCES public.debit_cards(id) ON DELETE SET NULL,
  total_cents      integer NOT NULL CHECK (total_cents >= 0),
  created_by       uuid NOT NULL REFERENCES public.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  closing_id       uuid NULL REFERENCES public.bar_cash_closings(id),
  voided_at        timestamptz NULL,
  voided_by        uuid NULL REFERENCES public.users(id),
  void_reason      text NULL,
  CONSTRAINT bar_orders_payment_chk  CHECK ((total_cents = 0) = (payment_method IS NULL)),
  CONSTRAINT bar_orders_transfer_chk CHECK (payment_method IS DISTINCT FROM 'transfer' OR bank_account_id IS NOT NULL),
  CONSTRAINT bar_orders_void_chk     CHECK ((status = 'voided') = (voided_at IS NOT NULL)
                                          AND (status <> 'voided' OR (void_reason IS NOT NULL AND voided_by IS NOT NULL AND closing_id IS NULL)))
);
CREATE INDEX IF NOT EXISTS bar_orders_created_idx  ON public.bar_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS bar_orders_open_idx     ON public.bar_orders (created_at) WHERE closing_id IS NULL AND status = 'paid';
CREATE INDEX IF NOT EXISTS bar_orders_customer_idx ON public.bar_orders (customer_user_id);

-- Cortesías regaladas por el admin (D11, A12, A13)
CREATE TABLE IF NOT EXISTS public.cafeteria_courtesy_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id),            -- usuarios con borrado lógico: no se pierde el historial
  granted_by    uuid NOT NULL REFERENCES public.users(id),
  quantity      smallint NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  scope         varchar(8) NOT NULL CHECK (scope IN ('any', 'category', 'product')),
  category_id   uuid NULL REFERENCES public.cafeteria_categories(id) ON DELETE RESTRICT,   -- padre o subcategoría
  product_id    uuid NULL REFERENCES public.cafeteria_products(id) ON DELETE RESTRICT,
  scope_label   varchar(140) NOT NULL,        -- copia legible al regalar: «Cualquier artículo», «Comida › Postres», «Latte (caliente)»
  note          text NULL,
  expires_at    timestamptz NULL,             -- fin del día elegido en CDMX; NULL = sin vencimiento
  revoked_at    timestamptz NULL,
  revoked_by    uuid NULL REFERENCES public.users(id),
  revoke_reason text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grants_scope_chk CHECK (
    (scope = 'any'      AND category_id IS NULL     AND product_id IS NULL)
    OR (scope = 'category' AND category_id IS NOT NULL AND product_id IS NULL)
    OR (scope = 'product'  AND product_id IS NOT NULL  AND category_id IS NULL)),
  CONSTRAINT grants_revoke_chk CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS grants_user_idx ON public.cafeteria_courtesy_grants (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bar_order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES public.bar_orders(id) ON DELETE CASCADE,
  product_id        uuid NULL REFERENCES public.cafeteria_products(id) ON DELETE SET NULL,
  product_name      varchar(80) NOT NULL,          -- copia al vender: editar el menú no cambia ventas pasadas
  category_name     varchar(60) NOT NULL,          -- subcategoría (o la categoría donde está el producto)
  parent_category_name varchar(60) NULL,           -- categoría padre, para reportes (Bebidas / Comida)
  temperature       varchar(4) NULL CHECK (temperature IN ('cold', 'hot')),
  unit_price_cents  integer NOT NULL CHECK (unit_price_cents > 0),
  quantity          smallint NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  is_courtesy       boolean NOT NULL DEFAULT false,
  courtesy_user_id  uuid NULL REFERENCES public.users(id),
  courtesy_source   varchar(7) NULL CHECK (courtesy_source IN ('monthly', 'grant')),   -- cupo mensual de coach / regalo del admin
  courtesy_period   char(7) NULL,                  -- 'YYYY-MM' en CDMX (solo cupo mensual)
  courtesy_grant_id uuid NULL REFERENCES public.cafeteria_courtesy_grants(id),         -- solo regalos
  line_total_cents  integer NOT NULL CHECK (line_total_cents >= 0),
  CONSTRAINT bar_items_courtesy_chk CHECK (
    (is_courtesy AND quantity = 1 AND line_total_cents = 0 AND courtesy_user_id IS NOT NULL AND (
        (courtesy_source = 'monthly' AND courtesy_period IS NOT NULL AND courtesy_grant_id IS NULL)
        OR (courtesy_source = 'grant' AND courtesy_grant_id IS NOT NULL AND courtesy_period IS NULL)))
    OR (NOT is_courtesy AND courtesy_user_id IS NULL AND courtesy_source IS NULL
        AND courtesy_period IS NULL AND courtesy_grant_id IS NULL
        AND line_total_cents = unit_price_cents * quantity)
  )
);
CREATE INDEX IF NOT EXISTS bar_items_order_idx ON public.bar_order_items (order_id);
CREATE INDEX IF NOT EXISTS bar_items_courtesy_idx ON public.bar_order_items (courtesy_user_id, courtesy_period) WHERE courtesy_source = 'monthly';
CREATE INDEX IF NOT EXISTS bar_items_grant_idx ON public.bar_order_items (courtesy_grant_id) WHERE courtesy_grant_id IS NOT NULL;

-- Cuenta bancaria de la barra (A6): independiente de `active` (suscripciones)
ALTER TABLE public.debit_cards ADD COLUMN IF NOT EXISTS bar_active boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS debit_cards_bar_active_uk ON public.debit_cards (bar_active) WHERE bar_active AND deleted_at IS NULL;

COMMIT;

-- Verificación (solo lectura): debe listar las 7 tablas y la columna bar_active.
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
--   AND table_name IN ('cafeteria_categories','cafeteria_products','cafeteria_settings',
--     'cafeteria_courtesy_grants','bar_cash_closings','bar_orders','bar_order_items') ORDER BY 1;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'debit_cards' AND column_name = 'bar_active';
-- SELECT * FROM public.cafeteria_settings;
