-- ForgeFit Supply: customer accounts, wishlists and product reviews.
--
-- Customers sign up with Supabase Auth (the same auth.users as the admin, who is just a
-- user with the admin role). Everything here is read and written only by the API (service
-- role): RLS is on and there are no policies, like orders.
--
-- Plain Postgres 15+. On Supabase the user columns reference auth.users; on a Postgres
-- without Supabase Auth they're plain uuids. Safe to run again.

-- ---------------------------------------------------------------------------
-- Orders placed while signed in
-- ---------------------------------------------------------------------------

-- Set at checkout for signed-in shoppers; guest orders keep null. Orders are matched to
-- accounts only by this id, never by email, so nobody can read orders by signing up with
-- someone else's address.
alter table public.orders add column if not exists user_id uuid;

create index if not exists orders_user_id_created_at_idx
  on public.orders (user_id, created_at desc)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- Wishlists
-- ---------------------------------------------------------------------------

create table if not exists public.wishlist_items (
  user_id    uuid not null,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Product reviews
-- ---------------------------------------------------------------------------

-- One review per customer per product; editing replaces it.
create table if not exists public.product_reviews (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products (id) on delete cascade,
  user_id           uuid not null,
  -- Snapshot of the name shown with the review, so renaming an account later doesn't
  -- need to touch old reviews (and deleting one removes them via user_id).
  author_name       text not null check (char_length(author_name) between 1 and 60),
  rating            smallint not null check (rating between 1 and 5),
  title             text check (char_length(title) <= 120),
  body              text not null default '' check (char_length(body) <= 2000),
  -- The author had a paid order containing the product when they wrote it.
  verified_purchase boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (product_id, user_id)
);

create index if not exists product_reviews_product_created_idx
  on public.product_reviews (product_id, created_at desc);
create index if not exists product_reviews_created_idx
  on public.product_reviews (created_at desc);

drop trigger if exists product_reviews_set_updated_at on public.product_reviews;
create trigger product_reviews_set_updated_at before update on public.product_reviews
  for each row execute function public.set_updated_at();

alter table public.wishlist_items  enable row level security;
alter table public.product_reviews enable row level security;

-- ---------------------------------------------------------------------------
-- Links to Supabase Auth (only where it exists)
-- ---------------------------------------------------------------------------

-- Deleting a user keeps their orders (the shop's records) but removes their wishlist and
-- reviews.
do $$
begin
  if to_regclass('auth.users') is null then
    return;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_user_id_fkey') then
    alter table public.orders
      add constraint orders_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wishlist_items_user_id_fkey') then
    alter table public.wishlist_items
      add constraint wishlist_items_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_reviews_user_id_fkey') then
    alter table public.product_reviews
      add constraint product_reviews_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------

-- Star rating summary for one product: how many reviews, the average, and how many of
-- each star value (for the bars on the product page).
create or replace function public.product_rating_summary(p_product_id uuid)
returns table (
  review_count integer,
  average      numeric,
  one_star     integer,
  two_star     integer,
  three_star   integer,
  four_star    integer,
  five_star    integer
)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::integer,
    round(avg(r.rating), 2),
    (count(*) filter (where r.rating = 1))::integer,
    (count(*) filter (where r.rating = 2))::integer,
    (count(*) filter (where r.rating = 3))::integer,
    (count(*) filter (where r.rating = 4))::integer,
    (count(*) filter (where r.rating = 5))::integer
  from public.product_reviews r
  where r.product_id = p_product_id;
$$;

-- Whether a customer paid for this product in one of their orders (refunded ones don't
-- count), for the "Verified purchase" badge.
create or replace function public.has_purchased_product(p_user_id uuid, p_product_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    join public.order_items i on i.order_id = o.id
    where o.user_id = p_user_id
      and o.status in ('paid', 'fulfilled')
      and i.product_id = p_product_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

revoke execute on function public.product_rating_summary(uuid) from public;
revoke execute on function public.has_purchased_product(uuid, uuid) from public;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke execute on function public.product_rating_summary(uuid) from %I', v_role);
      execute format('revoke execute on function public.has_purchased_product(uuid, uuid) from %I', v_role);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.product_rating_summary(uuid) to service_role;
    grant execute on function public.has_purchased_product(uuid, uuid) to service_role;
  end if;
end;
$$;
