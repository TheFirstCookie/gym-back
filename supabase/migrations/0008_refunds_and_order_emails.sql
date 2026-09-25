-- ForgeFit Supply: refunds and the order confirmation email.
--
-- Lifecycle addition:
--   refunded  the payment was returned (from the admin panel, or in the Stripe dashboard);
--             the admin decides separately whether the items go back in stock
--
-- Plain Postgres 15+. Run the whole file at once: the new enum value is only used inside
-- function bodies, which Postgres doesn't check until they run.

alter type public.order_status add value if not exists 'refunded';

alter table public.orders
  add column refunded_at                timestamptz,
  add column stripe_refund_id           text,
  -- Set when a refunded order's items were put back in stock.
  add column restocked_at               timestamptz,
  -- Set when the confirmation email goes out, so a retried webhook never sends it twice.
  add column confirmation_email_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- Refunded: record it once
-- ---------------------------------------------------------------------------

-- Only paid or fulfilled orders can be refunded. Returns the order's status after the call:
-- 'refunded' when this call refunded it (or it already was), otherwise its current status,
-- or null when the order doesn't exist. Safe to call from the admin panel and from Stripe's
-- refund webhook for the same refund, in either order.
create function public.mark_order_refunded(p_order_id uuid, p_refund_id text default null)
returns public.order_status
language plpgsql
set search_path = ''
as $$
declare
  v_status public.order_status;
begin
  update public.orders
  set
    status = 'refunded',
    refunded_at = now(),
    stripe_refund_id = coalesce(p_refund_id, stripe_refund_id)
  where id = p_order_id
    and status in ('paid', 'fulfilled')
  returning status into v_status;

  if not found then
    select status into v_status from public.orders where id = p_order_id;
  end if;

  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Restock a refunded order: its items go back on the shelf, exactly once
-- ---------------------------------------------------------------------------

-- A separate step from the refund because it's the admin's call (was the parcel returned?),
-- and so a refund webhook arriving first can never cancel the restock. Returns true only
-- for the call that restocked.
create function public.restock_refunded_order(p_order_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.orders
  set restocked_at = now()
  where id = p_order_id
    and status = 'refunded'
    and restocked_at is null;

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

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

revoke execute on function public.mark_order_refunded(uuid, text) from public;
revoke execute on function public.restock_refunded_order(uuid) from public;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke execute on function public.mark_order_refunded(uuid, text) from %I', v_role);
      execute format('revoke execute on function public.restock_refunded_order(uuid) from %I', v_role);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.mark_order_refunded(uuid, text) to service_role;
    grant execute on function public.restock_refunded_order(uuid) to service_role;
  end if;
end;
$$;
