# SPEC — Módulo de Barra / Cafetería

**Estado:** ✅ Implementado (2026-10-16). Scripts 001 y 002 corridos por el usuario en producción (2026-10-15). Código, tests y build listos en `feat/cafeteria` (sin commit). Pendiente: E2E manual (TASK-CF-VERIFY-01) y revisión legal del aviso de privacidad. Ajustes respecto al diseño: §14.
**Rama:** `feat/cafeteria` (se crea después de commitear `feat/special-packages`, ver §13).
**Task runner:** sección TASK-CF de `TASK_RUNNER.md`.
**Restricción de BD:** datos reales en producción. Solo scripts manuales aditivos e idempotentes en `sql/manual/`, que **ejecuta el usuario**. Nada de `drizzle-kit push`, `DROP`, `TRUNCATE`, `DELETE` de limpieza, `RENAME` ni `SET NOT NULL` sobre columnas existentes. Única excepción, aprobada por el usuario (2026-10-15): `ALTER TYPE … ADD VALUE` para el rol `barra` (D1).
**Zona horaria:** todo corte, filtro, periodo y correo usa `America/Mexico_City` a través de `src/lib/utils/date.ts`.

---

## 0. Decisiones confirmadas (2026-10-15)

| # | Decisión |
|---|---|
| D1 | Rol nuevo **`barra`** (cajero y barista son la misma persona). Se agrega al enum `user_role` con `ALTER TYPE … ADD VALUE` (aprobado). |
| D2 | **Sin cola de pedidos:** quien cobra también prepara. |
| D3 | **Cortesías de coaches configurables por el admin:** puede elegir **categorías padre, subcategorías** y/o **productos sueltos** (incluso excluir uno de una categoría elegida). El límite mensual (4) también es configurable. |
| D4 | **Precios con centavos.** El módulo guarda todo el dinero en **centavos enteros** (`*_cents`). |
| D5 | Una bebida fría y una caliente son **dos productos**, cada uno con su precio. |
| D6 | Corte de caja **opcional: uno al día o varios por turno.** Correo a **thelabpilates77@gmail.com**. El corte separa efectivo y transferencias, desglosa lo cobrado en efectivo y lo que la barra **entrega** al admin, y **no se cierra hasta que el admin apruebe**: confirma que recibió completo o registra cuánto faltó. |
| D7 | **Caché del menú público** que se invalida cuando el admin cambia algo (precio, producto nuevo o eliminado, categoría nueva…). |
| D8 | **Anular ventas:** solo el admin, con motivo, y solo antes del corte. |
| D9 | **Confirmación obligatoria en toda decisión crítica**, con el `Modal` actual (§8.4). |
| D10 | El menú incluye **bebidas y comida**. Las categorías tienen **dos niveles**: categoría padre → subcategoría (p. ej. Bebidas › Café, Bebidas › Frappés; Comida › Postres, Comida › Sandwiches). El admin decide cuáles crea. |
| D11 | **El admin puede regalar cortesías** a cualquier usuario registrado, desde su panel, con el alcance que elija: **cualquier artículo** (bebida o comida), **una categoría o subcategoría** (p. ej. todo «Comida», solo «Postres», todo «Bebidas») o **un producto** concreto. Se canjean en la caja como cualquier cortesía. |
| D13 | **Descuento por membresía (2026-10-18):** cada paquete tiene «Descuento en la barra (%)» (0–100) en `/admin/packages`. Aplica a quien tenga ese paquete **activo** (activo, pago confirmado, sin vencer; incluye «Sin créditos»), sobre **todo lo que se cobra** (bebidas y comida; las cortesías siguen en $0), redondeado al centavo. Se guarda en el pedido (`subtotal_cents`, `discount_cents`, `discount_percent`, `discount_label`). Usa el % vigente del catálogo al cobrar. Script `sql/manual/2026-10-18_001_bar_member_discount.sql`. |
| D12 | Quien recibe una cortesía **la ve en su panel** (cliente o coach): alcance, restantes y vencimiento, más el cupo mensual del coach. Sin correo. |

### 0.1 Supuestos (confirmados 2026-10-15)

| # | Supuesto |
|---|---|
| A1 | La temperatura (fría/caliente) solo aplica a las **bebidas**: la categoría padre tiene un interruptor **«Usa temperatura»** que heredan sus subcategorías. Con el interruptor activo, la temperatura es obligatoria en cada producto; sin él, no se captura (comida). |
| A2 | Se envían **dos correos** a los destinatarios: uno al **crear** el corte («pendiente de aprobación») y otro cuando el admin lo **resuelve** («cerrado»). |
| A3 | El efectivo que la barra declara entregar no puede ser mayor a lo cobrado; si es menor, debe escribir el motivo. El efectivo que el admin registra recibido no puede ser mayor a lo entregado. |
| A4 | Un corte pendiente **no bloquea** nuevas ventas: los pedidos nuevos entran al siguiente corte. No se puede crear un corte sin pedidos pagados pendientes. |
| A5 | Las ventas del admin **se consultan bajo demanda**, sin refresco automático: al abrir la página, al cambiar un filtro o al pulsar «Actualizar». Muestran la hora de la última consulta. |
| A6 | Una **sola cuenta bancaria** puede estar marcada para la barra a la vez. Sin cuenta marcada, la transferencia queda deshabilitada con aviso. |
| A7 | La cortesía solo aplica a usuarios con rol `coach` seleccionados como usuario registrado. Un pedido 100 % cortesía no lleva método de pago. |
| A8 | `barra` ve solo el turno abierto (pedidos sin corte), no el historial. |
| A9 | La cortesía puede marcarse en cualquier nivel (producto → subcategoría → categoría padre); el admin decide si incluye comida. Cada cortesía, sea bebida o comida, descuenta del mismo límite mensual. |
| A10 | Máximo **dos niveles** de categorías. Un producto puede colgar de una categoría padre o de una subcategoría. Una categoría inactiva oculta también a sus subcategorías y productos. |
| A11 | Si un cliente tiene varios créditos de cortesía aplicables, se usa primero el que **vence antes** (el cupo mensual de coach vence al fin del mes CDMX; un regalo sin vencimiento, al final), luego el de **alcance más específico** (producto → categoría → cualquiera) y luego el más antiguo. La asignación es **óptima** (cubre el mayor número de artículos posible, §4.6). |
| A12 | Un regalo tiene de 1 a 50 cortesías, **vencimiento opcional** (vale hasta el fin de ese día en CDMX) y nota opcional. No se renueva. El admin puede **revocar** lo que no se haya usado (lo ya canjeado no se toca). |
| A13 | Se puede regalar a cualquier usuario registrado y no eliminado (cliente o coach). El cupo mensual de coaches (D3) es independiente. Si el producto o la categoría de un regalo se elimina o desactiva, el regalo no se puede canjear mientras tanto, y el admin lo ve marcado. |

---

## 1. Hallazgos del código actual

| # | Hallazgo | Dónde | Consecuencia |
|---|---|---|---|
| H1 | No hay cliente de Supabase ni RLS: Postgres con Drizzle, scripts manuales y permisos en las Server Actions. | `src/db`, `sql/manual` | Mismo patrón; los permisos se validan en cada acción. |
| H2 | `user_role` = `client\|coach\|admin` y el middleware manda cada rol a **un** portal. | `schema.ts`, `middleware.ts:10-14` | `barra` necesita portal `/barra`; el admin opera la misma caja desde `/admin/cafeteria/caja`. |
| H3 | El rol está cableado en 8 puntos: `lib/types/roles.ts`, redirección del login (`actions/auth.ts:62`), `middleware.ts`, `PortalNav.tsx` (`Record<UserRole,…>`), `UserTable.tsx`, `UserRoleFilter.tsx`, `changeUserRoleAction` y el layout de cada portal. | ver paths | TASK-CF-ROLE-01. |
| H4 | `debit_cards.active` lo usa la tienda de suscripciones. | `schema.ts:272`, `actions/debit-cards.ts` | Marca independiente `bar_active`. |
| H5 | `sendEmail` reintenta 3 veces con 5 s de espera; su registro de fallos está en memoria. | `lib/email/service.ts:21-50` | El corte guarda el estado del envío y ofrece reintento. |
| H6 | Next 16: `'use cache'` requiere `cacheComponents: true` en toda la app. `unstable_cache` sigue disponible; `updateTag` (solo Server Actions) expira una etiqueta al instante. `revalidateTag` exige un segundo argumento. | `node_modules/next/dist/docs` | Menú con `unstable_cache` + etiqueta; verificar con un build real (TASK-CF-CACHE-00). |
| H7 | Una página estática que consulta la BD rompe `next build` si la tabla no existe (pasó con la landing). | — | `/menu` es dinámica (`force-dynamic`); los datos salen del caché. |
| H8 | Los precios de la app (paquetes) son pesos enteros. | `suscriptions.price` | El módulo usa centavos; la conversión vive solo en `domain/money.ts`. Nada se mezcla con paquetes. |
| H9 | `PackageForm`/`PackageList` (módulo de paquetes) **no piden confirmación** al guardar ni al activar/desactivar. | `components/admin/packages/*` | Incumple la regla D9. TASK-CF-CONF-00 lo corrige. |
| H10 | `Modal` ya soporta `variant="danger"`, `confirmLabel` y `cancelLabel`. | `components/ui/Modal.tsx` | Es el componente único de confirmación. |

---

## 2. Roles y permisos

| Acción | `barra` | `admin` |
|---|---|---|
| Ver menú y tomar pedidos | ✅ (`/barra`) | ✅ (`/admin/cafeteria/caja`) |
| Buscar clientes registrados | ✅ (limitado, §9) | ✅ |
| Cobrar (efectivo / transferencia) y aplicar cortesía | ✅ | ✅ |
| Ver pedidos del turno abierto | ✅ | ✅ |
| Crear corte (declarar efectivo entregado) | ✅ | ✅ |
| Aprobar / registrar faltante de un corte | ❌ | ✅ |
| CRUD de categorías y productos, reglas de cortesía, correos del corte | ❌ | ✅ |
| Ventas por fechas, filtros y desglose; historial de cortes | ❌ | ✅ |
| Anular una venta (antes del corte) | ❌ | ✅ |
| Regalar y revocar cortesías, ver los regalos de cualquier usuario | ❌ | ✅ |
| Ver **sus propias** cortesías en su panel (D12) | — | — |
| Marcar la cuenta bancaria de barra | ❌ | ✅ |
| Asignar el rol `barra` a un usuario | ❌ | ✅ |

`coach` y `client` no tienen acceso a nada del módulo, salvo ver `/menu` y **sus propias cortesías** en su panel (D12).

---

## 3. Base de datos

### 3.1 `sql/manual/2026-10-15_001_cafeteria.sql`

```sql
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
```

### 3.2 `sql/manual/2026-10-15_002_barra_role.sql`

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'barra';
COMMIT;
-- Verificación (solo lectura): SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--   WHERE t.typname = 'user_role' ORDER BY e.enumsortorder;
```

Orden de despliegue: scripts 001 y 002 → deploy. Asignar el rol `barra` a un usuario solo es posible después del 002.

### 3.3 Reglas que da la BD (además de las de la app)

- Un pedido sin método de pago ⇔ total 0 (100 % cortesía). Transferencia exige cuenta bancaria.
- Una línea de cortesía es siempre de 1 unidad, con total 0, con usuario y con **una sola fuente**: cupo mensual (con periodo) o regalo (con su id).
- Un regalo tiene un alcance coherente (cualquiera / categoría / producto) y, si se revoca, quién, cuándo y por qué.
- Una venta anulada exige motivo, quién la anuló y que **no** tenga corte.
- Un corte solo puede estar `pending`, `approved` (recibido = entregado) o `approved_with_shortfall` (recibido < entregado, con nota).
- `request_id` único: el mismo envío nunca cobra dos veces.

---

## 4. Dominio (TypeScript puro, `src/modules/cafeteria/domain`)

### 4.1 Dinero
- `Cents` = entero. `parsePesos('42.5') → 4250`; rechaza más de 2 decimales, negativos y vacío. `formatPesos(4250) → '$42.50'`.
- Todo cálculo es en enteros. Sin `Number` con decimales.

### 4.2 Cortesía mensual de coaches
- **Elegibilidad efectiva** de un producto, con herencia: `producto.courtesy_override ?? categoría.courtesy_eligible ?? padre.courtesy_eligible ?? false`.
- **Periodo:** `YYYY-MM` del instante del pedido en CDMX (`getMexicoCityYearMonth`, nuevo en `date.ts`).
- **Usadas** = líneas `is_courtesy` del coach en el periodo cuyo pedido está `paid` (anular un pedido devuelve el crédito sin hacer nada más).
- **Disponibles** = `max(0, límite − usadas)`.
- **Asignación:** al cobrar, la cortesía se aplica a las líneas que el cajero marcó (por defecto, las elegibles hasta agotar el saldo). Si pide cortesía de una bebida no elegible o sin saldo, el servidor **rechaza** con motivo; nunca cobra en silencio.
- El cupo mensual es solo para `customer_user_id` con rol `coach`. Los regalos del admin se describen en §4.6.

### 4.3 Pedido
- El servidor **recalcula los precios desde la BD**; nunca confía en los precios del cliente.
- Máximo 30 líneas, cantidad 1–20. Producto inexistente, inactivo, eliminado o no disponible → error.
- `total = Σ líneas no cortesía`. Si `total = 0`, no hay método de pago.

### 4.4 Corte de caja

```
 pedidos pagados sin corte ──(barra: crear corte)──▶ pending ──(admin)──▶ approved
                                                                  └────▶ approved_with_shortfall
```

- Totales: `cash_total` y `transfer_total` salen de los pedidos pagados incluidos; las cortesías se informan aparte (cantidad y valor) y no suman.
- La barra declara `cash_delivered` (≤ `cash_total`); si es menor, la nota es obligatoria (A3).
- El admin resuelve: **recibí completo** (`received = delivered`) o **no completo** (`received < delivered`, con nota); `shortfall = delivered − received`.
- Estados terminales: `approved` y `approved_with_shortfall`. Un corte resuelto no se edita.

### 4.5 Árbol de categorías (D10, A1, A10)
- **Profundidad máxima 2:** una categoría con `parent_id` no puede tener hijas; una categoría que ya tiene hijas no puede pasar a ser hija. La validación corre en la transacción del alta o el cambio (con `FOR UPDATE` sobre el padre).
- **Temperatura:** un producto exige `temperature` (`cold`/`hot`) si la **raíz** de su categoría tiene `uses_temperature`; si no la tiene, `temperature` debe ser `NULL`. Cambiar el interruptor de un padre con productos solo se permite si todos cumplen la regla nueva, o se rechaza listando cuáles faltan.
- **Visibilidad:** un producto se ve en la barra y en `/menu` solo si él, su categoría y el padre están activos y no eliminados.
- **Borrado:** no se elimina una categoría con subcategorías o productos activos; el borrado es lógico.
- **Orden:** `sort_order` entre hermanas; el menú muestra primero los productos que cuelgan directo del padre y luego cada subcategoría.

### 4.6 Cortesías regaladas por el admin (D11, A11–A13)
- **Alcance de un regalo:** `any` (cualquier artículo), `category` (la categoría elegida **y todas sus subcategorías**: elegir «Comida» cubre «Postres» y «Sandwiches») o `product` (ese producto).
- **Un regalo cubre un producto** si es `any`, o su categoría es la elegida o es hija de la elegida, o es exactamente el producto.
- **Vigente** = no revocado, no vencido (`expires_at` ausente o futuro, comparado con el reloj) y con saldo.
- **Restantes** = `quantity − líneas canjeadas` (líneas con ese `courtesy_grant_id` cuyo pedido está `paid`). Anular un pedido devuelve el crédito solo.
- **Vencimiento:** el admin elige un día; vale hasta el último milisegundo de ese día en CDMX.
- **Fuentes de un cliente:** el cupo mensual (si es coach y el producto es elegible por D3) y los regalos vigentes que cubren el producto. Los regalos **no** dependen de las reglas de elegibilidad de D3: el alcance lo decidió el admin al regalar.
- **Asignación (A11):** dadas las líneas que el cajero marcó como cortesía, se busca un reparto en el que cada línea use una fuente que la cubra y ninguna fuente se pase de su saldo, **cubriendo el mayor número de líneas posible** (emparejamiento con rutas de aumento, procesando primero las líneas con menos fuentes posibles). Entre los repartos posibles se prefiere el de mejor prioridad: vence antes → alcance más específico → más antiguo. Ejemplo que un reparto «línea por línea» resolvería mal: regalo A (cualquiera, vence pronto) y regalo B (solo Latte), con un Latte y un Brownie; lo correcto es Latte→B y Brownie→A.
- Si el cajero marca más líneas de cortesía de las que se pueden cubrir, el servidor **rechaza** indicando cuáles no, sin cobrar en silencio.
- **Alta de un regalo:** el usuario existe y no está eliminado; el producto o la categoría existe, está activa y no eliminada; la cantidad es 1–50; el vencimiento, si se da, es futuro.
- **Revocar:** marca `revoked_at`; las cortesías ya canjeadas siguen contadas; el motivo es obligatorio.

---

## 5. Casos de uso y contratos

Las Server Actions (capa `presentation`) validan sesión y rol, parsean con Zod y llaman al caso de uso. Errores con la forma `FormActionResult` existente (`error`, `field`, `fieldErrors`).

| Caso de uso | Rol | Entrada → salida |
|---|---|---|
| `createOrder` | barra, admin | `{ requestId, customer: {name}\|{userId}\|null, items: [{productId, quantity, courtesy?}], paymentMethod }` → `{ orderId, folio, totalCents, courtesyApplied }` |
| `searchCustomers` | barra, admin | `{ q }` (≥ 2 caracteres) → máx. 8 `{ id, name, email, role, courtesy: { monthly?: {used, limit}, grants: [{ id, scopeLabel, remaining, expiresAt }] } }` |
| `getOpenShift` | barra, admin | → pedidos sin corte y totales por método |
| `createClosing` | barra, admin | `{ cashDeliveredCents, deliveryNote?, expectedOrdersCount, expectedCashTotalCents }` → corte `pending` (rechaza si el turno cambió desde que se vio) |
| `resolveClosing` | admin | `{ closingId, outcome: 'received_all'\|'received_partial', cashReceivedCents?, note? }` |
| `retryClosingEmail` | admin | `{ closingId, which: 'created'\|'resolved' }` |
| `voidOrder` | admin | `{ orderId, reason }` (solo `closing_id IS NULL`) |
| `createCategory` / `updateCategory` / `deleteCategory` | admin | `{ name, parentId?, usesTemperature? }`; dos niveles máximo; borrado lógico; no se borra con subcategorías o productos activos |
| `createProduct` / `updateProduct` / `deleteProduct` / `setProductAvailability` | admin | precio en pesos con centavos; `temperature` según la regla de §4.5; borrado lógico |
| `updateCourtesyRules` | admin | `{ limit, categories: [{id, eligible: true\|false\|null}], products: [{id, override: true\|false\|null}], notifyEmails }` |
| `grantCourtesy` | admin | `{ userId, quantity, scope: {type:'any'}\|{type:'category', categoryId}\|{type:'product', productId}, expiresOn?: 'YYYY-MM-DD', note? }` → regalo creado |
| `revokeCourtesy` | admin | `{ grantId, reason }` |
| `listCourtesyGrants` | admin | `{ userQuery?, status?: 'active'\|'used'\|'expired'\|'revoked'\|'unavailable' }` → regalos con restantes y estado |
| `setBarBankAccount` | admin | `{ cardId \| null }` |
| `getSalesReport` | admin | `{ from, to, paymentMethod?, status?, q?, page }` → totales, desglose por producto, pedidos |
| `getPublicMenu` | público | → árbol categoría padre › subcategoría › productos (bebidas separadas en frías y calientes) (§7) |

**Concurrencia y atomicidad**
- `createOrder`: una transacción; el candado de cortesía es `pg_advisory_xact_lock(hashtextextended('bar-courtesy:'||customer_user_id, 0))` por cliente (cubre cupo mensual y regalos) y se toma **antes** de contar saldos. Un `request_id` repetido devuelve el pedido ya creado.
- `createClosing`: en una transacción, `SELECT … FROM bar_orders WHERE closing_id IS NULL AND status='paid' FOR UPDATE`, calcula totales **solo con esas filas**, inserta el corte y marca esas mismas filas. Dos cortes simultáneos: el segundo no encuentra pedidos y se rechaza.
- `voidOrder`: `UPDATE … WHERE id = $1 AND status = 'paid' AND closing_id IS NULL`; 0 filas → error.
- `resolveClosing`: `UPDATE … WHERE id = $1 AND status = 'pending'`; 0 filas → «Este corte ya fue resuelto».

---

## 6. Correos del corte

- Destinatarios: `cafeteria_settings.closing_notify_emails` (inicial `thelabpilates77@gmail.com`; editable por el admin con confirmación).
- **Correo 1 — al crear el corte** («Corte de caja pendiente de aprobación»): fecha y hora CDMX (`DD/MM/YYYY, hh:mm A`), barra, periodo cubierto, número de pedidos, **efectivo cobrado y efectivo entregado** (con la diferencia y su motivo si la hay), transferencias (cantidad y total), cortesías (cantidad y valor) y desglose por producto.
- **Correo 2 — al resolver** («Corte de caja cerrado»): lo anterior más quién lo resolvió, cuándo, **efectivo recibido** y **faltante** si lo hubo, con la nota del admin.
- Se envía **después** de guardar el corte y se espera el resultado (en Vercel una promesa sin esperar puede cortarse). El estado queda en `created_email_status` / `resolved_email_status`; si falla, el admin ve «Correo no enviado» con botón **Reintentar**. Un fallo de correo nunca revierte el corte.

---

## 7. Menú público y caché

- Ruta `/menu` (pública; el middleware ya deja pasar lo que no es `/client|/coach|/admin`). Se agregará `/barra` a las rutas protegidas.
- `export const dynamic = 'force-dynamic'` (H7) y datos desde `getCachedMenu()`:
  `unstable_cache(loadMenu, ['cafeteria-menu'], { tags: ['cafeteria-menu'] })` **sin** caducidad por tiempo.
- **Invalidación (D7):** helper único `invalidateMenuCache()` = `updateTag('cafeteria-menu')` (Server Actions) más `revalidatePath('/menu')`. Todo caso de uso de menú que cambie datos lo llama: crear, editar o eliminar categoría o producto, cambiar precio, disponibilidad o visibilidad. Un test estructural falla si una acción del menú no lo llama.
- **Resultado del spike TASK-CF-CACHE-00 (2026-10-15, `next build && next start`, Next 16.3.5):** con una página `force-dynamic` que lee `unstable_cache(..., { tags })`, una acción vacía (control) **no** cambia el dato; `updateTag(tag)` solo, `revalidateTag(tag, { expire: 0 })` solo y `revalidatePath(ruta)` solo **sí** lo cambian, y el request siguiente ve el dato nuevo. **Decisión:** `invalidateMenuCache()` = `updateTag('cafeteria-menu')` + `revalidatePath('/menu')`. La etiqueta es la principal porque cubre todo lector del menú (caja de barra, admin), no solo `/menu`.
- Contenido: árbol **categoría padre › subcategoría › productos**, solo con nodos visibles (§4.5) que tengan al menos un producto visible. En las categorías que usan temperatura, cada subcategoría separa **Frío** y **Caliente**; en las demás (comida) es una lista simple. Nombre y precio (`$42.50`); lo agotado se ve atenuado con «Agotado». Sin datos de cortesía.

---

## 8. UI/UX

### 8.1 Barra — `/barra` (móvil primero, pensada para tablet y celular)

- **Menú lateral del rol `barra`:** Caja, Corte, Menú (abre `/menu`).
- **Caja** (una sola pantalla):
  1. **Cliente (opcional):** campo de nombre libre o buscador de usuarios (espera 300 ms, mínimo 2 letras) que muestra **nombre y correo** de cada resultado. Al elegir un usuario registrado aparece su **panel de cortesías**: el cupo mensual (si es coach, «3 de 4 este mes») y cada regalo vigente con su alcance, cuántas le quedan y cuándo vence. Al cobrar se muestra qué crédito usará cada artículo.
  2. **Productos:** pestañas de **categoría padre** (Bebidas, Comida…) con scroll horizontal y, debajo, chips de **subcategoría** (Café, Postres, Sandwiches…); buscador rápido sobre todo el menú. El filtro Todas / Frío / Caliente aparece **solo** en las categorías que usan temperatura. Cada tarjeta muestra el nombre, el precio y, en bebidas, un ícono de frío o caliente; las agotadas aparecen deshabilitadas. Con un coach seleccionado, las elegibles muestran la etiqueta «Cortesía».
  3. **Carrito** como panel inferior en móvil (y columna en tablet o escritorio), con cantidades, el interruptor «Cortesía» por artículo y el total.
  4. **Cobrar:** elige Efectivo o Transferencia y abre la confirmación (§8.4). Éxito → aviso con el folio y carrito vacío.
- **Corte** (`/barra/corte`): pedidos del turno abierto, totales por método, campo «Efectivo que entrego» (con la nota obligatoria si es menor al cobrado) y el botón «Hacer corte» con confirmación. Si hay un corte anterior sin aprobar, se avisa.

### 8.2 Admin — «Cafetería» (menú lateral nuevo)

| Ruta | Contenido |
|---|---|
| `/admin/cafeteria` | Resumen de hoy y, si existe, el componente **«Tienes un corte de caja pendiente»** que abre el modal de aprobación. |
| `/admin/cafeteria/menu` | Árbol de categorías (padre › subcategoría) con CRUD; el interruptor «Usa temperatura» solo en el padre; CRUD de productos (precio con centavos, frío/caliente solo si la categoría lo usa, disponibilidad). |
| `/admin/cafeteria/cortesias` | **Reglas de coaches:** límite mensual, árbol de categorías con tri-estado en cada nodo (heredar / sí / no), tri-estado por producto y correos del corte; muestra la elegibilidad **efectiva** de cada producto. |
| `/admin/cafeteria/cortesias/regalos` | **Regalar cortesías:** buscar al usuario (nombre o correo), cantidad, alcance (Cualquier artículo / Una categoría o subcategoría / Un producto), vencimiento opcional y nota; listado de regalos con usuario, alcance, usadas/total, vencimiento, estado y quién regaló; revocar lo no usado. |
| `/admin/cafeteria/ventas` | Ventas del día (se consultan al abrir, al filtrar o con el botón «Actualizar»; sin refresco automático), filtros por rango de fechas, método (Efectivo / Transferencia / Cortesía) y búsqueda; desglose por producto; anular venta. |
| `/admin/cafeteria/cortes` | Historial de cortes con estado, diferencias y estado del correo. |
| `/admin/cafeteria/caja` | La misma pantalla de caja de la barra. |
| `/admin/debit-cards` | Nuevo interruptor «Usar en la barra» por tarjeta. |

**Modal de aprobación del corte** (admin): muestra el periodo (CDMX), barra, pedidos, **efectivo cobrado**, **efectivo entregado** y la diferencia declarada con su motivo, la lista de transferencias aparte (cantidad y total) y las cortesías. Dos salidas: **«Recibí el efectivo completo»** (confirma) o **«No lo recibí completo»**, que pide cuánto se recibió, muestra el faltante calculado y exige una nota.

### 8.3 Menú público
Una sección por categoría padre y una tarjeta por subcategoría, con la tipografía y los colores del tema actual; en bebidas, columnas Frío / Caliente (una debajo de otra en móvil); en comida, lista simple.

### 8.5 Panel del cliente y del coach — «Mis cortesías» (D12)
- Tarjeta en el dashboard de `client` (`/client`) y de `coach` (`/coach`), visible solo si tiene alguna cortesía vigente o un cupo mensual.
- Muestra cada regalo vigente: alcance legible («Comida › Postres»), cuántas le quedan de cuántas y vencimiento (`DD/MM/YYYY` CDMX), más el cupo mensual del coach («Te quedan 3 de 4 este mes»). Texto de ayuda: «Pídelas en la barra al hacer tu pedido».
- Solo lectura y **solo las propias**: la consulta usa el `sub` de la sesión, nunca un id recibido del cliente. No muestra quién regaló ni la nota interna.

### 8.4 Confirmaciones (D9)
Toda decisión crítica abre el `Modal` actual y la acción **no se ejecuta** hasta confirmar.

| Acción | Texto de confirmación |
|---|---|
| Cobrar en efectivo | «Cobrar $84.00 en efectivo — N artículos (M de cortesía)» |
| Cobrar por transferencia | Datos de la cuenta de barra y el total; botón «Transferencia recibida, cobrar» |
| Crear / editar / eliminar categoría o subcategoría | Resumen de lo que cambia (nivel, padre, «Usa temperatura») y, al eliminar, aviso de que sale del menú |
| Crear / editar / eliminar producto | Nombre, categoría, temperatura (si aplica) y precio con centavos |
| Cambiar reglas de cortesía, límite o correos | Resumen de cambios |
| Marcar la cuenta bancaria de barra | Cuenta elegida |
| Regalar cortesías | Usuario, cantidad, alcance y vencimiento |
| Revocar cortesías | Usuario, alcance y cuántas quedan; motivo obligatorio |
| Hacer corte | Cobrado, entregado, diferencia y cantidad de pedidos |
| Aprobar corte / registrar faltante | Monto recibido y faltante |
| Anular venta | Folio, total y campo de motivo obligatorio |
| Asignar el rol barra | Usuario y rol (ya existe en `UserTable`) |

No llevan modal: marcar «agotado» o «disponible», filtros, búsquedas y el reintento del correo.

---

## 9. Seguridad

- **Autorización en cada acción** (§2); el middleware solo redirige.
- **Cliente no confiable:** precios, totales, elegibilidad y saldo de cortesía se recalculan en el servidor.
- **Búsqueda de clientes:** `barra` ve nombres y correos, que son datos personales. Mínimo 2 caracteres, máximo 8 resultados, solo `id, nombre, correo, rol`, y un `RateLimiter` de 60 peticiones por minuto por usuario. Sin contraseña ni ningún otro campo.
- **Idempotencia** del cobro con `request_id`.
- **Regalos solo del admin:** `barra` únicamente ve las cortesías del cliente que seleccionó en ese pedido; no puede crear, editar ni revocar regalos, ni listar los de otros usuarios.
- **Cuenta bancaria:** solo se envía a la pantalla de caja la cuenta marcada para barra; nunca la lista de tarjetas.
- `/menu` es pública pero solo expone nombre, temperatura, precio y disponibilidad.
- **Aviso de privacidad:** se guardan el nombre libre del cliente y las compras de usuarios registrados; revisar el texto antes de publicar (TASK-CF-DOC-01).

---

## 10. Arquitectura de carpetas

```
src/modules/cafeteria/
├── domain/          money.ts · courtesy.ts · order.ts · closing.ts · errors.ts      (TS puro)
├── application/
│   ├── ports/       menu-repository · order-repository · closing-repository · customer-directory
│   │                · settings-repository · bank-account-gateway · mailer · clock · unit-of-work
│   └── use-cases/   create-order · void-order · create-closing · resolve-closing · retry-closing-email
│                    · search-customers · menu-admin · update-courtesy-rules · get-sales-report · get-public-menu
├── infrastructure/  drizzle-*-repository.ts · drizzle-unit-of-work.ts · resend-mailer.ts
│                    · closing-email-templates.ts · menu-cache.ts
└── presentation/    schemas.ts (Zod) · actions/*.ts (Server Actions delgadas)
src/app/(portal)/barra/…   src/app/(portal)/admin/cafeteria/…   src/app/menu/page.tsx
src/components/cafeteria/  (UI compartida: caja, menú, modales)
```

- **Regla de dependencias** (la vigila `module-boundaries.test.ts`): `domain` no importa nada del proyecto; `application` solo importa `domain`; `infrastructure` implementa los puertos; `presentation` y las páginas solo hablan con los casos de uso.
- Los casos de uso reciben `Clock` (tests con hora fija CDMX) y `UnitOfWork` para abrir la transacción.
- Es un módulo piloto: el resto de la app mantiene su estructura actual (`actions/`, `lib/`).

---

## 11. Criterios de aceptación

1. Cada decisión D1–D11 y supuesto A1–A13 tiene al menos un test.
2. Precios con centavos de punta a punta: `$42.50` se guarda como `4250`; un precio con 3 decimales se rechaza.
3. Una bebida fría y una caliente del mismo nombre coexisten con precios distintos; dos productos de comida con el mismo nombre en la misma subcategoría no.
4. Coach con 4 cortesías usadas: la quinta se rechaza con motivo. Anular un pedido le devuelve el crédito.
5. Un producto excluido (`courtesy_override = false`) de una categoría elegible no recibe cortesía, y la elegibilidad se hereda subcategoría → padre.
5b. Las categorías aceptan solo dos niveles; la comida (categoría sin temperatura) no pide frío/caliente y una bebida sí; dos subcategorías con el mismo nombre en padres distintos coexisten.
6. Dos cobros simultáneos del mismo cliente con 1 crédito de cortesía (mensual o regalo): solo uno se confirma.
6b. Un regalo de «Comida» cubre un postre y un sándwich pero no un café; un regalo de un producto solo cubre ese producto; uno vencido, revocado o agotado no se canjea; anular el pedido devuelve el crédito.
6c. Con un regalo «cualquiera» y otro «solo Latte», un pedido de Latte + Brownie con ambos como cortesía se cubre completo (reparto óptimo).
7. El mismo `request_id` enviado dos veces crea **un** pedido.
8. Corte: totales de efectivo y transferencias correctos; dos cortes simultáneos no duplican pedidos.
9. El corte no pasa a cerrado sin la resolución del admin; «No completo» exige monto y nota, y calcula el faltante.
10. Ambos correos llegan a `thelabpilates77@gmail.com` con fecha y hora CDMX; si el envío falla, el corte sigue válido y hay botón de reintento.
11. Solo el admin anula, solo antes del corte, con motivo.
12. Toda acción crítica de §8.4 abre su confirmación y no ejecuta nada antes de confirmar.
13. Cambiar precio, crear o eliminar producto o categoría actualiza `/menu` sin esperar ningún tiempo.
14. `barra` no accede a `/admin` ni a ventas por fechas; `coach` y `client` no acceden a `/barra`.
15. `pnpm test`, `tsc`, `pnpm build` y `pnpm lint` sin problemas nuevos.

---

## 12. Fuera de alcance

- Cola o pantalla de pedidos para preparar.
- Inventario, costos y utilidad.
- Propinas, cupones, descuentos manuales (solo el de membresía, D13) y tarjeta (solo efectivo y transferencia).
- Recetas, ingredientes y control de existencias de la comida.
- Conteo físico de billetes ni fondo de caja inicial.
- Tickets impresos y facturación.
- Notificaciones push al admin (solo el correo y el componente en el panel).

---

## 13. Pendientes de confirmar antes de codificar

1. **A1–A13** de §0.1. Si no se objeta, se asumen.
2. **Commit** de `feat/special-packages` (paquetes especiales y el ajuste de la landing) antes de crear `feat/cafeteria`.
3. **H9:** ¿corrijo ahora las confirmaciones que faltan en el módulo de paquetes? (TASK-CF-CONF-00).
4. **Spike del caché** (TASK-CF-CACHE-00): se hace antes de la fase del menú público.
5. ✅ **Resuelto (D12):** quien recibe una cortesía la ve en su panel; sin correo.

---

## 14. Ajustes durante la implementación (2026-10-16)

1. **Cambio de rol sin confirmación (H11).** §8.4 decía que `UserTable` ya confirmaba el cambio de rol; no era así. Se agregó el `Modal` («Sí, cambiar rol») para todos los roles.
2. **La caja no usa el caché.** Solo `/menu` lee `getCachedMenu()`. La caja y el admin leen el menú fresco en cada carga (pocas filas, siempre correcto); la invalidación con `updateTag` sigue cubriendo `/menu`.
3. **Cortesía por unidad.** En el carrito cada producto lleva «Cortesía n/cantidad»; al cobrar, cada unidad de cortesía viaja como línea de 1 (regla §3.3). La vista previa del reparto usa el mismo `allocateCourtesies` del dominio; el servidor lo recalcula.
4. **Borrado de categorías más estricto.** Bloquea con cualquier subcategoría o producto no eliminado (activo o no), para no dejar productos ocultos bajo una categoría eliminada.
5. **`relations.ts` sin cambios.** El módulo no usa consultas relacionales de Drizzle; las FK viven en `schema.ts` (`.references`) y en el SQL.
6. **Correos uno por destinatario.** `sendEmail` acepta un solo `to`; el estado queda `sent` solo si llegó a todos.
7. **`Modal` con `confirmDisabled`.** Prop opcional nueva (compatible) para los modales con motivo obligatorio y mientras corre una acción.
8. **El admin no entra a `/barra`.** El middleware manda a cada rol a su portal; el admin cobra en `/admin/cafeteria/caja` (misma pantalla).
9. **Pruebas.** Los tests se escribieron junto con cada pieza, no siempre en rojo primero; la concurrencia del candado de cortesías se comprobó con una mutación (quitar `lockCustomer` rompe los dos tests de concurrencia).

