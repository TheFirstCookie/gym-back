-- ForgeFit Supply: order management for the admin panel.
--
-- Adds the shipping timestamp and two read helpers the /admin/orders API uses: a searchable,
-- paginated order list and per-status counts for the tabs. Plain Postgres 15+, like 0001-0004.

-- ---------------------------------------------------------------------------
-- Shipping
-- ---------------------------------------------------------------------------

-- Set when an admin marks a paid order as shipped (status 'fulfilled'); cleared on undo.
alter table public.orders add column fulfilled_at timestamptz;

-- ---------------------------------------------------------------------------
-- Order list
-- ---------------------------------------------------------------------------

-- Newest first. p_query matches part of the customer's email or name, or of the order id
-- (the admin panel shows ids shortened to their first characters). Every row carries
-- total_count, the number of matches before paging, like search_products in 0002.
create function public.admin_search_orders(
  p_status public.order_status default null,
  p_query  text default null,
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  id             uuid,
  status         public.order_status,
  customer_email text,
  customer_name  text,
  currency       text,
  total_cents    integer,
  item_count     integer,
  created_at     timestamptz,
  paid_at        timestamptz,
  fulfilled_at   timestamptz,
  total_count    bigint
)
language sql
stable
set search_path = ''
as $$
  select
    o.id,
    o.status,
    o.customer_email,
    o.customer_name,
    o.currency,
    o.total_cents,
    coalesce((select sum(i.quantity) from public.order_items i where i.order_id = o.id), 0)::integer,
    o.created_at,
    o.paid_at,
    o.fulfilled_at,
    count(*) over ()
  from public.orders o
  -- The search text as a LIKE pattern, with its own % and _ taken literally.
  cross join (
    select '%' || replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  ) search
  where (p_status is null or o.status = p_status)
    and (
      p_query is null
      or o.customer_email ilike search.pattern
      or o.customer_name ilike search.pattern
      or o.id::text ilike search.pattern
    )
  order by o.created_at desc, o.id
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

-- How many orders are in each status (statuses with none are simply absent).
create function public.order_status_counts()
returns table (status public.order_status, order_count bigint)
language sql
stable
set search_path = ''
as $$
  select o.status, count(*)
  from public.orders o
  group by o.status;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

-- Orders hold customer names and addresses: only the API (service role) may read them,
-- same as the checkout functions in 0004.
revoke execute on function public.admin_search_orders(public.order_status, text, integer, integer) from public;
revoke execute on function public.order_status_counts() from public;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke execute on function public.admin_search_orders(public.order_status, text, integer, integer) from %I', v_role);
      execute format('revoke execute on function public.order_status_counts() from %I', v_role);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.admin_search_orders(public.order_status, text, integer, integer) to service_role;
    grant execute on function public.order_status_counts() to service_role;
  end if;
end;
$$;
