-- ForgeFit Supply: checkout. Orders reserve stock while the shopper pays on Stripe.
--
-- Lifecycle of an order:
--   pending   created with the Stripe Checkout session; its stock is taken off the shelf
--   paid      Stripe confirmed payment (webhook, or the success page double-checking)
--   cancelled the session expired or was abandoned; its stock goes back on the shelf
--   fulfilled shipped (set by the admin later)
--
-- Each step is one SQL function so it runs in a single transaction: two shoppers racing
-- for the last kettlebell can't both get it, and a retried webhook can't pay or restock twice.
-- Plain Postgres 15+, like 0001 and 0002.

-- ---------------------------------------------------------------------------
-- Extra order details captured from Stripe
-- ---------------------------------------------------------------------------

alter table public.orders
  add column customer_name            text,
  add column shipping_address         jsonb,
  add column stripe_payment_intent_id text,
  add column paid_at                  timestamptz,
  add column cancelled_at             timestamptz;

-- Finds abandoned pending orders quickly (see release_stale_orders).
create index orders_pending_created_at_idx on public.orders (created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Create: validate the cart, reserve stock, snapshot prices
-- ---------------------------------------------------------------------------

-- p_items: [{ "slug": "competition-kettlebell", "quantity": 2 }, ...]
-- Returns { order_id, currency, subtotal_cents, lines: [{ product_id, slug, name, image_url,
-- unit_price_cents, quantity }] }.
--
-- Raises (the API turns these into 409s the storefront can explain):
--   FF001 product_unavailable  detail = slug
--   FF002 insufficient_stock   detail = slug, hint = units still available
--   FF003 mixed_currencies
--   FF004 empty_cart
create function public.create_pending_order(p_items jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_request  record;
  v_product  record;
  v_lines    jsonb := '[]'::jsonb;
  v_currency text;
  v_subtotal integer := 0;
  v_order_id uuid;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode = 'FF004', message = 'empty_cart';
  end if;

  -- Duplicate slugs are merged; locking rows in slug order keeps concurrent checkouts
  -- from deadlocking each other.
  for v_request in
    select item ->> 'slug' as slug, sum((item ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_items) as item
    group by item ->> 'slug'
    order by item ->> 'slug'
  loop
    if v_request.quantity is null or v_request.quantity < 1 then
      raise exception using errcode = 'FF004', message = 'empty_cart';
    end if;

    select p.id, p.slug, p.name, p.image_url, p.price_cents, p.currency, p.stock, p.is_active
    into v_product
    from public.products p
    where p.slug = v_request.slug
    for update;

    if not found or not v_product.is_active then
      raise exception using errcode = 'FF001', message = 'product_unavailable', detail = v_request.slug;
    end if;

    if v_product.stock < v_request.quantity then
      raise exception using
        errcode = 'FF002',
        message = 'insufficient_stock',
        detail = v_request.slug,
        hint = v_product.stock::text;
    end if;

    if v_currency is not null and v_currency <> v_product.currency then
      raise exception using errcode = 'FF003', message = 'mixed_currencies';
    end if;
    v_currency := v_product.currency;

    update public.products
    set stock = stock - v_request.quantity
    where id = v_product.id;

    v_subtotal := v_subtotal + v_product.price_cents * v_request.quantity;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id,
      'slug', v_product.slug,
      'name', v_product.name,
      'image_url', v_product.image_url,
      'unit_price_cents', v_product.price_cents,
      'quantity', v_request.quantity
    );
  end loop;

  if v_currency is null then
    raise exception using errcode = 'FF004', message = 'empty_cart';
  end if;

  insert into public.orders (status, currency, subtotal_cents, total_cents)
  values ('pending', v_currency, v_subtotal, v_subtotal)
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, unit_price_cents, quantity)
  select
    v_order_id,
    (line ->> 'product_id')::uuid,
    line ->> 'name',
    (line ->> 'unit_price_cents')::integer,
    (line ->> 'quantity')::integer
  from jsonb_array_elements(v_lines) as line;

  return jsonb_build_object(
    'order_id', v_order_id,
    'currency', v_currency,
    'subtotal_cents', v_subtotal,
    'lines', v_lines
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Paid: record the payment once, however many times Stripe tells us
-- ---------------------------------------------------------------------------

-- Returns the order's status after the call: 'paid' for the first call and for repeats,
-- or whatever it already was if it wasn't pending (e.g. 'cancelled').
create function public.mark_order_paid(
  p_order_id uuid,
  p_session_id text,
  p_payment_intent_id text default null,
  p_customer_email text default null,
  p_customer_name text default null,
  p_shipping_address jsonb default null,
  p_total_cents integer default null
)
returns public.order_status
language plpgsql
set search_path = ''
as $$
declare
  v_status public.order_status;
begin
  update public.orders
  set
    status = 'paid',
    paid_at = now(),
    stripe_payment_intent_id = coalesce(p_payment_intent_id, stripe_payment_intent_id),
    customer_email = coalesce(p_customer_email, customer_email),
    customer_name = coalesce(p_customer_name, customer_name),
    shipping_address = coalesce(p_shipping_address, shipping_address),
    total_cents = coalesce(p_total_cents, total_cents)
  where id = p_order_id
    and stripe_checkout_session_id = p_session_id
    and status = 'pending'
  returning status into v_status;

  if found then
    return v_status;
  end if;

  select status into v_status
  from public.orders
  where id = p_order_id and stripe_checkout_session_id = p_session_id;

  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelled: give reserved stock back, exactly once
-- ---------------------------------------------------------------------------

-- Returns true if this call cancelled the order, false if it wasn't pending anymore.
create function public.cancel_pending_order(p_order_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.orders
  set status = 'cancelled', cancelled_at = now()
  where id = p_order_id and status = 'pending';

  if not found then
    return false;
  end if;

  -- Products deleted since (product_id null) simply have nothing to restock.
  update public.products p
  set stock = p.stock + item.quantity
  from public.order_items item
  where item.order_id = p_order_id
    and item.product_id = p.id;

  return true;
end;
$$;

-- Safety net for missed "session expired" webhooks: cancels pending orders older than
-- p_older_than (well past Stripe's session lifetime) so their stock isn't stuck forever.
-- Returns how many orders were released.
create function public.release_stale_orders(p_older_than interval default interval '2 hours')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_released integer := 0;
begin
  for v_order_id in
    select id
    from public.orders
    where status = 'pending' and created_at < now() - p_older_than
    order by created_at
    limit 100
  loop
    if public.cancel_pending_order(v_order_id) then
      v_released := v_released + 1;
    end if;
  end loop;

  return v_released;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

-- These functions change stock and orders, so only the API (service role) may run them.
-- Supabase grants EXECUTE on new functions to anon and authenticated by default; RLS
-- would still block them, but revoking makes the intent explicit. The service role gets
-- an explicit grant so it never depends on the defaults.
revoke execute on function public.create_pending_order(jsonb) from public;
revoke execute on function public.mark_order_paid(uuid, text, text, text, text, jsonb, integer) from public;
revoke execute on function public.cancel_pending_order(uuid) from public;
revoke execute on function public.release_stale_orders(interval) from public;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke execute on function public.create_pending_order(jsonb) from %I', v_role);
      execute format('revoke execute on function public.mark_order_paid(uuid, text, text, text, text, jsonb, integer) from %I', v_role);
      execute format('revoke execute on function public.cancel_pending_order(uuid) from %I', v_role);
      execute format('revoke execute on function public.release_stale_orders(interval) from %I', v_role);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_pending_order(jsonb) to service_role;
    grant execute on function public.mark_order_paid(uuid, text, text, text, text, jsonb, integer) to service_role;
    grant execute on function public.cancel_pending_order(uuid) to service_role;
    grant execute on function public.release_stale_orders(interval) to service_role;
  end if;
end;
$$;
