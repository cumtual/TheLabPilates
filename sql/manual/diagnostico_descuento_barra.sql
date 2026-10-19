-- Diagnóstico (SOLO LECTURA): ¿por qué un cliente no recibe el descuento en la barra?
-- Cambia el correo y ejecútalo en el SQL Editor de Supabase. No modifica nada.
--
-- El descuento aplica si existe una fila con TODO esto:
--   us_active = true, us_status = 'active', pago_confirmado = true,
--   vence_el vacío o en el futuro, y descuento_barra > 0.

-- 1) Suscripciones del cliente y el paquete al que apunta cada una
SELECT
  u.username                       AS cliente,
  s.id                             AS paquete_id,
  s.name                           AS paquete,
  s.bar_discount_percent           AS descuento_barra,
  s.deleted_at                     AS paquete_eliminado,
  us.active                        AS us_active,
  us.status                        AS us_status,
  p.confirmend                     AS pago_confirmado,
  us.expiration_date               AS vence_el,
  us.expiration_date > now()       AS sigue_vigente
FROM public.users u
JOIN public.user_suscriptions us ON us.user_id = u.id
JOIN public.suscriptions s       ON s.id = us.suscription_id
LEFT JOIN public.payments p      ON p.id = us.payment_id
WHERE lower(u.email) = lower('CORREO_DEL_CLIENTE@ejemplo.com')
ORDER BY us.created_at DESC;

-- 2) Paquetes con nombre parecido a «Open Lab» / «Progress» (¿hay duplicados?)
SELECT id, name, bar_discount_percent, is_active, deleted_at
FROM public.suscriptions
WHERE name ILIKE '%open%' OR name ILIKE '%progress%'
ORDER BY name;
