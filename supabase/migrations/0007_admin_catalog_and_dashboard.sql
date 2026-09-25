-- ForgeFit Supply: read helpers for the admin panel's category/brand screens and dashboard.
-- Plain Postgres 15+, like the earlier migrations. Only the API (service role) may call them.

-- ---------------------------------------------------------------------------
-- Categories and brands with product counts
-- ---------------------------------------------------------------------------

-- product_count includes hidden products (they still block deleting the category);
-- active_product_count is what the storefront shows.
create function public.admin_categories()
returns table (
  id                   uuid,
  name                 text,
  slug                 text,
  accent_color         text,
  sort_order           integer,
  created_at           timestamptz,
  updated_at           timestamptz,
  product_count        integer,
  active_product_count integer
)
language sql
stable
set search_path = ''
as $$
  select
    c.id, c.name, c.slug, c.accent_color, c.sort_order, c.created_at, c.updated_at,
    count(p.id)::integer,
    (count(p.id) filter (where p.is_active))::integer
  from public.categories c
  left join public.products p on p.category_id = c.id
  group by c.id
  order by c.sort_order, c.name;
$$;

create function public.admin_brands()
returns table (
  id                   uuid,
  name                 text,
  slug                 text,
  created_at           timestamptz,
  updated_at           timestamptz,
  product_count        integer,
  active_product_count integer
)
language sql
stable
set search_path = ''
as $$
  select
    b.id, b.name, b.slug, b.created_at, b.updated_at,
    count(p.id)::integer,
    (count(p.id) filter (where p.is_active))::integer
  from public.brands b
  left join public.products p on p.brand_id = b.id
  group by b.id
  order by b.name;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard
-- ---------------------------------------------------------------------------

-- Everything the dashboard shows, in one round trip. A sale is an order that was paid
-- (status paid or fulfilled), counted on the day it was paid, in UTC days. Amounts are in
-- cents of p_currency; orders in other currencies are left out rather than mixed in.
--
-- Returns:
--   { currency, days,
--     revenue_cents, order_count,                     -- the last p_days days, today included
--     previous_revenue_cents, previous_order_count,   -- the p_days days before that
--     all_time_revenue_cents, to_ship_count, awaiting_payment_count,
--     daily:         [{ date, revenue_cents, order_count }]   one entry per day, oldest first
--     top_products:  [{ product_id, name, units, revenue_cents }]  best sellers in the window
--     low_stock:     [{ id, name, slug, stock, image_url }]   live products at or under p_low_stock
--     recent_orders: [{ id, status, customer_name, customer_email, total_cents, currency, created_at }] }
create function public.admin_dashboard_stats(
  p_currency  text default 'usd',
  p_days      integer default 30,
  p_low_stock integer default 5
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with
  window_start as (
    select date_trunc('day', now() at time zone 'utc') at time zone 'utc'
           - make_interval(days => greatest(p_days, 1) - 1) as since
  ),
  sales as (
    select o.id, o.total_cents, o.paid_at
    from public.orders o
    where o.status in ('paid', 'fulfilled')
      and o.currency = p_currency
      and o.paid_at is not null
  ),
  current_sales as (
    select s.* from sales s, window_start w where s.paid_at >= w.since
  ),
  previous_sales as (
    select s.*
    from sales s, window_start w
    where s.paid_at >= w.since - make_interval(days => greatest(p_days, 1))
      and s.paid_at < w.since
  ),
  daily as (
    select
      d.day::date as date,
      coalesce(sum(s.total_cents), 0)::bigint as revenue_cents,
      count(s.id)::integer as order_count
    from window_start w
    cross join generate_series(w.since, w.since + make_interval(days => greatest(p_days, 1) - 1), interval '1 day') as d(day)
    left join current_sales s
      on s.paid_at >= d.day and s.paid_at < d.day + interval '1 day'
    group by d.day
  ),
  top_products as (
    select
      i.product_id,
      i.product_name as name,
      sum(i.quantity)::integer as units,
      sum(i.line_total_cents)::bigint as revenue_cents
    from public.order_items i
    join current_sales s on s.id = i.order_id
    group by i.product_id, i.product_name
    order by units desc, revenue_cents desc
    limit 5
  ),
  low_stock as (
    select p.id, p.name, p.slug, p.stock, p.image_url
    from public.products p
    where p.is_active and p.stock <= p_low_stock
    order by p.stock, p.name
    limit 8
  ),
  recent_orders as (
    -- Orders a shopper actually paid for, newest first (open and abandoned checkouts skipped).
    select o.id, o.status, o.customer_name, o.customer_email, o.total_cents, o.currency, o.created_at
    from public.orders o
    where o.status not in ('pending', 'cancelled')
    order by o.created_at desc
    limit 5
  )
  select jsonb_build_object(
    'currency', p_currency,
    'days', greatest(p_days, 1),
    'revenue_cents', (select coalesce(sum(total_cents), 0) from current_sales),
    'order_count', (select count(*) from current_sales),
    'previous_revenue_cents', (select coalesce(sum(total_cents), 0) from previous_sales),
    'previous_order_count', (select count(*) from previous_sales),
    'all_time_revenue_cents', (select coalesce(sum(total_cents), 0) from sales),
    'to_ship_count', (select count(*) from public.orders where status = 'paid'),
    'awaiting_payment_count', (select count(*) from public.orders where status = 'pending'),
    'daily', (select coalesce(jsonb_agg(to_jsonb(d) order by d.date), '[]'::jsonb) from daily d),
    'top_products', (select coalesce(jsonb_agg(to_jsonb(t) order by t.units desc, t.revenue_cents desc), '[]'::jsonb) from top_products t),
    'low_stock', (select coalesce(jsonb_agg(to_jsonb(l) order by l.stock, l.name), '[]'::jsonb) from low_stock l),
    'recent_orders', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb) from recent_orders r)
  );
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

revoke execute on function public.admin_categories() from public;
revoke execute on function public.admin_brands() from public;
revoke execute on function public.admin_dashboard_stats(text, integer, integer) from public;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke execute on function public.admin_categories() from %I', v_role);
      execute format('revoke execute on function public.admin_brands() from %I', v_role);
      execute format('revoke execute on function public.admin_dashboard_stats(text, integer, integer) from %I', v_role);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.admin_categories() to service_role;
    grant execute on function public.admin_brands() to service_role;
    grant execute on function public.admin_dashboard_stats(text, integer, integer) to service_role;
  end if;
end;
$$;
