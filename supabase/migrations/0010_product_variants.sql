-- ForgeFit Supply: product variants (weights, sizes, colours), each with its own price and
-- stock.
--
-- A product with variants is sold only through them: the shopper picks one, checkout
-- reserves that variant's stock, and the order line remembers which one it was. The
-- product row keeps summary values so every listing, filter and sort keeps working
-- unchanged: its price is the cheapest active variant ("from $X") and its stock the sum
-- of the active variants. Triggers keep those in step; nothing else writes them.
--
-- Products without variants work exactly as before. Plain Postgres 15+. Safe to run again.

-- ---------------------------------------------------------------------------
-- Variants
-- ---------------------------------------------------------------------------

create table if not exists public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  -- What the shopper picks: "16 kg", "Large", "Black".
  name        text not null check (char_length(name) between 1 and 60),
  price_cents integer not null check (price_cents >= 0),
  stock       integer not null default 0 check (stock >= 0),
  sort_order  integer not null default 0,
  -- Hidden variants stay on past orders but can't be bought.
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id, name)
);

create index if not exists product_variants_product_sort_idx
  on public.product_variants (product_id, sort_order, name);

drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

alter table public.product_variants enable row level security;

-- Same rule as products: the storefront may read what's for sale.
drop policy if exists "Active variants are publicly readable" on public.product_variants;
create policy "Active variants are publicly readable"
  on public.product_variants for select using (is_active);

-- ---------------------------------------------------------------------------
-- Order lines remember the variant
-- ---------------------------------------------------------------------------

alter table public.order_items
  -- Nullable: most products have no variants, and a deleted variant keeps its order lines.
  add column if not exists variant_id   uuid references public.product_variants (id) on delete set null,
  -- Snapshot, like product_name: renaming a variant later doesn't rewrite past orders.
  add column if not exists variant_name text;

create index if not exists order_items_variant_id_idx on public.order_items (variant_id);

-- ---------------------------------------------------------------------------
-- Keep the product's price and stock in step with its variants
-- ---------------------------------------------------------------------------

-- A product that has any variants (active or hidden) takes its price and stock from the
-- active ones. With every variant hidden it shows as sold out; delete them all and it's a
-- plain product again, keeping the last values.
create or replace function public.apply_variant_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_min_price integer;
  v_stock     integer;
begin
  if not exists (select 1 from public.product_variants v where v.product_id = new.id) then
    return new;
  end if;

  select min(v.price_cents), coalesce(sum(v.stock), 0)
  into v_min_price, v_stock
  from public.product_variants v
  where v.product_id = new.id and v.is_active;

  new.price_cents := coalesce(v_min_price, new.price_cents);
  new.stock := v_stock;
  return new;
end;
$$;

drop trigger if exists products_apply_variant_totals on public.products;
create trigger products_apply_variant_totals before update of price_cents, stock on public.products
  for each row execute function public.apply_variant_totals();

-- Any change to a variant touches its product, which makes the trigger above recompute.
create or replace function public.sync_product_from_variants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.products
  set stock = stock
  where id = coalesce(new.product_id, old.product_id);
  return null;
end;
$$;

drop trigger if exists product_variants_sync_product on public.product_variants;
create trigger product_variants_sync_product after insert or update or delete on public.product_variants
  for each row execute function public.sync_product_from_variants();

-- ---------------------------------------------------------------------------
-- Checkout: carts can name a variant
-- ---------------------------------------------------------------------------

-- p_items: [{ "slug": "competition-kettlebell", "variant": "<variant id>", "quantity": 2 }, ...]
-- ("variant" only for products that have variants). Returns { order_id, currency,
-- subtotal_cents, lines: [{ product_id, variant_id, slug, name, variant_name, image_url,
-- unit_price_cents, quantity }] }.
--
-- Raises (the API turns these into 409s the storefront can explain):
--   FF001 product_unavailable  detail = slug, hint = variant id (if any)
--   FF002 insufficient_stock   detail = slug or "slug:variant id", hint = units still available
--   FF003 mixed_currencies
--   FF004 empty_cart
--   FF005 variant_required     detail = slug (the product has variants; pick one)
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
  v_subtotal integer := 0;
  v_price    integer;
  v_variant_name text;
  v_order_id uuid;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode = 'FF004', message = 'empty_cart';
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

    v_subtotal := v_subtotal + v_price * v_request.quantity;
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

  return jsonb_build_object(
    'order_id', v_order_id,
    'currency', v_currency,
    'subtotal_cents', v_subtotal,
    'lines', v_lines
  );
end;
$$;

-- Puts an order's items back on the shelf: variant lines into their variant, the rest into
-- the product. Each variant and each plain product appears once per order (checkout merges
-- duplicate lines), so one UPDATE per kind is exact. Deleted products and variants simply
-- have nothing to restock.
create or replace function public.restock_order_items(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.product_variants v
  set stock = v.stock + item.quantity
  from public.order_items item
  where item.order_id = p_order_id
    and item.variant_id = v.id;

  update public.products p
  set stock = p.stock + item.quantity
  from public.order_items item
  where item.order_id = p_order_id
    and item.variant_id is null
    and item.product_id = p.id;
end;
$$;

-- Same behaviour as in 0004, now restocking variants too.
create or replace function public.cancel_pending_order(p_order_id uuid)
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

  perform public.restock_order_items(p_order_id);
  return true;
end;
$$;

-- Same behaviour as in 0008, now restocking variants too.
create or replace function public.restock_refunded_order(p_order_id uuid)
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

  perform public.restock_order_items(p_order_id);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: save a product's whole variant list at once
-- ---------------------------------------------------------------------------

-- p_variants: [{ "id"?: uuid, "name", "price_cents", "stock", "is_active" }, ...] in display
-- order. Rows with an id are updated, rows without are created, and the product's other
-- variants are deleted (their past order lines keep the snapshot name). One transaction,
-- so the storefront never sees half a list. A duplicate name raises 23505.
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
  select coalesce(array_agg((item ->> 'id')::uuid), '{}')
  into v_keep
  from jsonb_array_elements(p_variants) as item
  where item ? 'id';

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

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

revoke execute on function public.restock_order_items(uuid) from public;
revoke execute on function public.admin_save_variants(uuid, jsonb) from public;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke execute on function public.restock_order_items(uuid) from %I', v_role);
      execute format('revoke execute on function public.admin_save_variants(uuid, jsonb) from %I', v_role);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.restock_order_items(uuid) to service_role;
    grant execute on function public.admin_save_variants(uuid, jsonb) to service_role;
    grant select, insert, update, delete on public.product_variants to service_role;
  end if;
end;
$$;
