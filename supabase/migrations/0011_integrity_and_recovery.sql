-- Apply after 0010. Inventory concurrency, payment recovery, refunds, and email outbox.
-- Existing migrations are deliberately retained for clean installations.

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end;
$$;

drop policy if exists "Active variants are publicly readable" on public.product_variants;
create policy "Active variants are publicly readable" on public.product_variants for select
using (is_active and exists(select 1 from public.products p where p.id = product_id and p.is_active));

alter table public.orders
  add column if not exists checkout_images text[] not null default '{}',
  add column if not exists last_reconciled_at timestamptz,
  add column if not exists checkout_started_at timestamptz,
  add column if not exists payment_exception text,
  add column if not exists refund_status text,
  add column if not exists refund_restock boolean not null default false,
  add column if not exists refund_attempt uuid,
  add column if not exists pre_refund_status public.order_status;
-- Legacy ambiguous requests predate the attempt marker: reconcile them conservatively.
update public.orders set checkout_started_at=created_at where status='pending' and checkout_started_at is null;
create index if not exists orders_pending_reconcile_idx on public.orders(created_at,id) where status='pending';

-- SQL/cron may release only reservations for which no Stripe request was started.
-- Linked/ambiguous requests are reconciled by the API's maintenance worker.
create or replace function public.release_stale_orders(p_older_than interval default interval '2 hours')
returns integer language plpgsql set search_path = '' as $$
declare v_id uuid; v_count integer := 0;
begin
  for v_id in select id from public.orders
    where status='pending' and created_at < now()-p_older_than
      and stripe_checkout_session_id is null and checkout_started_at is null
    order by created_at,id limit 100
  loop
    if public.cancel_pending_order(v_id) then v_count := v_count+1; end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.restock_order_items(p_order_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.products p where p.id in
    (select product_id from public.order_items where order_id=p_order_id)
    order by p.slug for update;
  update public.product_variants v set stock=v.stock+i.quantity
    from (select variant_id,sum(quantity)::integer quantity from public.order_items
      where order_id=p_order_id and variant_id is not null group by variant_id) i
    where v.id=i.variant_id;
  -- A deleted historical variant must never become a plain-product restock.
  update public.products p set stock=p.stock+i.quantity
    from (select product_id,sum(quantity)::integer quantity from public.order_items
      where order_id=p_order_id and variant_id is null and variant_name is null group by product_id) i
    where p.id=i.product_id;
end;
$$;

create or replace function public.create_pending_order(p_items jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_request  record;
  v_product  record;
  v_variant  record;
  v_lines    jsonb := '[]'::jsonb;
  v_currency text;
  v_subtotal bigint := 0;
  v_price    integer;
  v_variant_name text;
  v_order_id uuid;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode = 'FF004', message = 'empty_cart';
  end if;

  if jsonb_array_length(p_items) not between 1 and 20 then
    raise exception using errcode = 'FF004', message = 'Use between 1 and 20 cart lines';
  end if;

  -- Duplicate lines are merged; locking rows in a fixed order keeps concurrent checkouts
  -- from deadlocking each other.
  for v_request in
    select
      item ->> 'slug' as slug,
      nullif(item ->> 'variant', '')::uuid as variant_id,
      sum((item ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_items) as item
    group by 1, 2
    order by 1, 2 nulls first
  loop
    if v_request.quantity is null or v_request.quantity < 1 or v_request.quantity > 99 then
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

    if v_currency is not null and v_currency <> v_product.currency then
      raise exception using errcode = 'FF003', message = 'mixed_currencies';
    end if;
    v_currency := v_product.currency;

    if v_request.variant_id is null then
      -- A product with variants can't be bought without choosing one.
      if exists (select 1 from public.product_variants v where v.product_id = v_product.id) then
        raise exception using errcode = 'FF005', message = 'variant_required', detail = v_request.slug;
      end if;

      if v_product.stock < v_request.quantity then
        raise exception using
          errcode = 'FF002', message = 'insufficient_stock', detail = v_request.slug, hint = v_product.stock::text;
      end if;

      update public.products set stock = stock - v_request.quantity where id = v_product.id;
      v_price := v_product.price_cents;
      v_variant_name := null;
    else
      select v.id, v.name, v.price_cents, v.stock, v.is_active
      into v_variant
      from public.product_variants v
      where v.id = v_request.variant_id and v.product_id = v_product.id
      for update;

      if not found or not v_variant.is_active then
        raise exception using
          errcode = 'FF001', message = 'product_unavailable',
          detail = v_request.slug, hint = v_request.variant_id::text;
      end if;

      if v_variant.stock < v_request.quantity then
        raise exception using
          errcode = 'FF002', message = 'insufficient_stock',
          detail = v_request.slug || ':' || v_variant.id::text, hint = v_variant.stock::text;
      end if;

      -- The product's own stock follows through the variant trigger.
      update public.product_variants set stock = stock - v_request.quantity where id = v_variant.id;
      v_price := v_variant.price_cents;
      v_variant_name := v_variant.name;
    end if;

    v_subtotal := v_subtotal + v_price::bigint * v_request.quantity;
    if v_subtotal > 99999999 then
      raise exception using errcode = 'FF007', message = 'Order total exceeds the payment limit';
    end if;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id,
      'variant_id', v_request.variant_id,
      'slug', v_product.slug,
      'name', v_product.name,
      'variant_name', v_variant_name,
      'image_url', v_product.image_url,
      'unit_price_cents', v_price,
      'quantity', v_request.quantity
    );
  end loop;

  if v_currency is null then
    raise exception using errcode = 'FF004', message = 'empty_cart';
  end if;

  insert into public.orders (status, currency, subtotal_cents, total_cents)
  values ('pending', v_currency, v_subtotal, v_subtotal)
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, unit_price_cents, quantity)
  select
    v_order_id,
    (line ->> 'product_id')::uuid,
    (line ->> 'variant_id')::uuid,
    line ->> 'name',
    line ->> 'variant_name',
    (line ->> 'unit_price_cents')::integer,
    (line ->> 'quantity')::integer
  from jsonb_array_elements(v_lines) as line;

  update public.orders set checkout_images=array(
    select split_part(split_part(line->>'image_url','?',1),'#',1) from jsonb_array_elements(v_lines) line
    where line->>'image_url' is not null
  ) where id=v_order_id;
  return jsonb_build_object(
    'order_id', v_order_id,
    'currency', v_currency,
    'subtotal_cents', v_subtotal,
    'lines', v_lines
  );
end;
$$;
create or replace function public.admin_save_variants(p_product_id uuid, p_variants jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item  jsonb;
  v_index integer := 0;
  v_keep  uuid[];
  v_id    uuid;
begin
  -- Every inventory operation locks parent products before variant rows.
  perform 1 from public.products where id = p_product_id for update;
  if not found then raise exception using errcode = '23503', message = 'Product not found'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_variants) item
    where item ? 'id' and not exists (
      select 1 from public.product_variants v
      where v.id = (item->>'id')::uuid and v.product_id = p_product_id
    )
  ) then raise exception using errcode = 'FF006', message = 'A variant no longer belongs to this product'; end if;

  select coalesce(array_agg((item ->> 'id')::uuid), '{}')
  into v_keep
  from jsonb_array_elements(p_variants) as item
  where item ? 'id';

  if exists (
    select 1 from public.product_variants v join public.order_items i on i.variant_id = v.id
    where v.product_id = p_product_id and not (v.id = any(v_keep))
  ) then
    raise exception using errcode = 'FF006', message = 'An ordered variant cannot be removed. Hide it instead.';
  end if;
  if jsonb_array_length(p_variants) > 0
    and not exists (select 1 from public.product_variants where product_id = p_product_id)
    and exists (select 1 from public.order_items where product_id = p_product_id and variant_name is null)
  then
    raise exception using errcode = 'FF006', message = 'This product has plain-item orders. Create a separate variant product to preserve inventory history.';
  end if;

  -- Removed ones go first, so a new variant can reuse a removed one's name ("M" deleted,
  -- a new "M" added) in the same save.
  delete from public.product_variants
  where product_id = p_product_id and not (id = any (v_keep));

  -- Then clear the kept ones' names, so swapping or reusing names can't trip the unique check.
  update public.product_variants
  set name = '~' || id::text
  where product_id = p_product_id;

  for v_item in select value from jsonb_array_elements(p_variants)
  loop
    v_id := null;
    if v_item ? 'id' then
      update public.product_variants
      set
        name = v_item ->> 'name',
        price_cents = (v_item ->> 'price_cents')::integer,
        stock = (v_item ->> 'stock')::integer,
        is_active = coalesce((v_item ->> 'is_active')::boolean, true),
        sort_order = v_index
      where id = (v_item ->> 'id')::uuid and product_id = p_product_id
      returning id into v_id;
    end if;

    -- New, or an id that isn't (or is no longer) one of this product's variants.
    if v_id is null then
      insert into public.product_variants (product_id, name, price_cents, stock, is_active, sort_order)
      values (
        p_product_id,
        v_item ->> 'name',
        (v_item ->> 'price_cents')::integer,
        (v_item ->> 'stock')::integer,
        coalesce((v_item ->> 'is_active')::boolean, true),
        v_index
      );
    end if;

    v_index := v_index + 1;
  end loop;
end;
$$;

create or replace function public.mark_order_paid(
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
    payment_exception = null,
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

-- One transaction publishes a product and its variants. Stale absolute stock writes fail.
create or replace function public.admin_write_product(
  p_id uuid, p_patch jsonb, p_variants jsonb default null, p_expected_updated_at timestamptz default null
) returns uuid language plpgsql set search_path = '' as $$
declare v_before public.products; v_after public.products; v_id uuid;
begin
  if p_id is null then
    insert into public.products(name,slug,category_id,brand_id,price_cents,currency,stock,tag,image_url,description,specs,sort_order,is_active)
    values(p_patch->>'name',p_patch->>'slug',(p_patch->>'category_id')::uuid,(p_patch->>'brand_id')::uuid,
      (p_patch->>'price_cents')::integer,coalesce(p_patch->>'currency','usd'),coalesce((p_patch->>'stock')::integer,0),
      p_patch->>'tag',p_patch->>'image_url',coalesce(p_patch->>'description',''),
      array(select jsonb_array_elements_text(coalesce(p_patch->'specs','[]'::jsonb))),
      coalesce((p_patch->>'sort_order')::integer,0),coalesce((p_patch->>'is_active')::boolean,true)) returning id into v_id;
  else
    select * into v_before from public.products where id=p_id for update;
    if not found then return null; end if;
    if ((p_patch ? 'stock' or p_variants is not null) and p_expected_updated_at is null)
      or (p_expected_updated_at is not null and p_expected_updated_at <> v_before.updated_at) then
      raise exception using errcode='FF008', message='Product or stock changed. Reload before saving.';
    end if;
    v_id := p_id;
  end if;
  if p_variants is not null then perform public.admin_save_variants(v_id,p_variants); end if;
  if p_id is not null then
    select * into v_before from public.products where id=v_id;
    v_after := jsonb_populate_record(v_before,p_patch);
    update public.products set name=v_after.name,slug=v_after.slug,category_id=v_after.category_id,
      brand_id=v_after.brand_id,price_cents=v_after.price_cents,currency=v_after.currency,stock=v_after.stock,
      tag=v_after.tag,image_url=v_after.image_url,description=v_after.description,specs=v_after.specs,
      sort_order=v_after.sort_order,is_active=v_after.is_active where id=v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.begin_order_refund(p_order_id uuid,p_restock boolean)
returns uuid language plpgsql set search_path = '' as $$
declare v_attempt uuid;
begin
  select refund_attempt into v_attempt from public.orders where id=p_order_id for update;
  update public.orders set
    refund_attempt=case when refund_attempt is null or refund_status in ('failed','canceled') then gen_random_uuid() else refund_attempt end,
    stripe_refund_id=case when refund_status in ('failed','canceled') then null else stripe_refund_id end,
    refund_status=case when refund_status is null or refund_status in ('failed','canceled') then 'pending' else refund_status end,
    pre_refund_status=case when refund_status is null or refund_status in ('failed','canceled') then status else coalesce(pre_refund_status,status) end,
    refund_restock=refund_restock or p_restock
  where id=p_order_id and status in ('paid','fulfilled') returning refund_attempt into v_attempt;
  return v_attempt;
end;
$$;

create or replace function public.record_order_refund(p_order_id uuid,p_refund_id text,p_status text,p_attempt uuid default null)
returns public.order_status language plpgsql set search_path = '' as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then return null; end if;
  -- Ignore events from a superseded refund attempt and stale events after terminal states.
  if v_order.refund_attempt is not null and (
    (p_attempt is not null and p_attempt <> v_order.refund_attempt) or
    (p_attempt is null and v_order.stripe_refund_id is distinct from p_refund_id)
  ) then return v_order.status; end if;
  if v_order.stripe_refund_id is not null and v_order.stripe_refund_id <> p_refund_id then return v_order.status; end if;
  if v_order.refund_status in ('failed','canceled') and p_status <> v_order.refund_status then return v_order.status; end if;
  if v_order.refund_status='succeeded' and p_status not in ('failed','canceled') then return v_order.status; end if;
  update public.orders set stripe_refund_id=p_refund_id,refund_status=p_status,
    pre_refund_status=coalesce(pre_refund_status,case when status in ('paid','fulfilled') then status else null end)
    where id=p_order_id;
  if p_status='succeeded' then
    perform public.mark_order_refunded(p_order_id,p_refund_id);
    if v_order.refund_restock then perform public.restock_refunded_order(p_order_id); end if;
  elsif p_status in ('failed','canceled') and v_order.status='refunded' then
    update public.orders set status=coalesce(pre_refund_status,'paid'),refunded_at=null,
      payment_exception=case when restocked_at is not null then 'Refund failed after restock: review inventory and payment in Stripe' else payment_exception end
    where id=p_order_id;
  end if;
  return (select status from public.orders where id=p_order_id);
end;
$$;

-- Durable email jobs survive provider errors and process restarts.
create table if not exists public.order_email_jobs(
  order_id uuid primary key references public.orders(id) on delete cascade,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token uuid,
  sent_at timestamptz
);
alter table public.order_email_jobs enable row level security;
create or replace function public.enqueue_order_email() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status in ('paid','fulfilled') and new.confirmation_email_sent_at is null then
    insert into public.order_email_jobs(order_id) values(new.id) on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger orders_enqueue_email after insert or update of status on public.orders
  for each row execute function public.enqueue_order_email();
insert into public.order_email_jobs(order_id) select id from public.orders
  where status in ('paid','fulfilled') and confirmation_email_sent_at is null on conflict do nothing;

create or replace function public.claim_order_email(p_order_id uuid) returns uuid language plpgsql set search_path = '' as $$
declare v_token uuid;
begin
  update public.order_email_jobs set claim_token=gen_random_uuid(),claimed_at=now(),attempts=attempts+1
    where order_id=p_order_id and sent_at is null and next_attempt_at <= now()
      and (claimed_at is null or claimed_at < now()-interval '5 minutes')
    returning claim_token into v_token;
  return v_token;
end;
$$;
create or replace function public.finish_order_email(p_order_id uuid,p_token uuid,p_success boolean)
returns void language plpgsql set search_path = '' as $$
begin
  update public.order_email_jobs set claimed_at=null,claim_token=null,
    sent_at=case when p_success then now() else null end,
    next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::integer)
  where order_id=p_order_id and claim_token=p_token;
  if found and p_success then update public.orders set confirmation_email_sent_at=now() where id=p_order_id; end if;
end;
$$;

-- No new function or job table is exposed to browser roles.
revoke all on public.order_email_jobs from public;
do $$
declare v_fn text; v_role text;
begin
  foreach v_fn in array array[
    'admin_write_product(uuid,jsonb,jsonb,timestamptz)', 'begin_order_refund(uuid,boolean)',
    'record_order_refund(uuid,text,text,uuid)', 'claim_order_email(uuid)', 'finish_order_email(uuid,uuid,boolean)'
  ] loop
    execute 'revoke execute on function public.'||v_fn||' from public';
    foreach v_role in array array['anon','authenticated'] loop
      if exists(select 1 from pg_roles where rolname=v_role) then
        execute 'revoke execute on function public.'||v_fn||' from '||quote_ident(v_role);
      end if;
    end loop;
    if exists(select 1 from pg_roles where rolname='service_role') then
      execute 'grant execute on function public.'||v_fn||' to service_role';
    end if;
  end loop;
  foreach v_role in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=v_role) then
      execute 'revoke all on public.order_email_jobs from '||quote_ident(v_role);
    end if;
  end loop;
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant all on public.order_email_jobs to service_role;
  end if;
end;
$$;
