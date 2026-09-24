-- ForgeFit Supply: catalog (categories, brands, products) and orders.
--
-- Plain Postgres 15+ on purpose: nothing here depends on Supabase-only schemas
-- (auth, storage) or roles, so it also runs against a local Postgres.
--
-- Access model:
--   * The API server uses the service_role key, which bypasses RLS entirely.
--   * RLS is enabled on every table; catalog tables get a public read-only policy so
--     the frontend can later use the anon key for Realtime or direct reads.
--   * orders / order_items have no policies, so only the service role can touch them.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create type public.order_status as enum ('pending', 'paid', 'cancelled', 'fulfilled');

-- Empty search_path keeps the function safe from search_path hijacking
-- (Supabase's database linter flags functions without it).
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  accent_color text not null check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 160),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category_id uuid not null references public.categories (id) on delete restrict,
  brand_id    uuid not null references public.brands (id) on delete restrict,
  price_cents integer not null check (price_cents >= 0),
  currency    text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  stock       integer not null default 0 check (stock >= 0),
  tag         text,
  image_url   text,
  description text not null default '',
  specs       text[] not null default '{}',
  -- Merchandising order for the storefront's default "featured" sort.
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index categories_sort_order_idx on public.categories (sort_order, name);
-- Foreign keys aren't indexed automatically; these serve category/brand filters and FK checks.
create index products_category_id_idx on public.products (category_id);
create index products_brand_id_idx on public.products (brand_id);
create index products_active_sort_idx on public.products (sort_order, name) where is_active;

-- Product counts per category. security_invoker makes the view respect the caller's
-- RLS, so anon readers only ever count active products.
create view public.categories_with_counts
with (security_invoker = true) as
select
  c.id,
  c.name,
  c.slug,
  c.accent_color,
  c.sort_order,
  c.created_at,
  c.updated_at,
  (count(p.id) filter (where p.is_active))::integer as product_count
from public.categories c
left join public.products p on p.category_id = c.id
group by c.id;

-- ---------------------------------------------------------------------------
-- Orders (written by the upcoming Stripe checkout flow)
-- ---------------------------------------------------------------------------

create table public.orders (
  id                         uuid primary key default gen_random_uuid(),
  status                     public.order_status not null default 'pending',
  customer_email             text,
  currency                   text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  subtotal_cents             integer not null check (subtotal_cents >= 0),
  total_cents                integer not null check (total_cents >= 0),
  stripe_checkout_session_id text unique,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  -- Nullable so order history survives a product being deleted.
  product_id       uuid references public.products (id) on delete set null,
  -- Snapshot at purchase time; later catalog edits must not rewrite past orders.
  product_name     text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity         integer not null check (quantity > 0),
  line_total_cents integer generated always as (unit_price_cents * quantity) stored,
  created_at       timestamptz not null default now()
);

create index orders_status_created_at_idx on public.orders (status, created_at desc);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger brands_set_updated_at before update on public.brands
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.categories  enable row level security;
alter table public.brands      enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- No "to <role>" clause: the policies apply to every role (anon and authenticated on
-- Supabase) and the migration doesn't depend on those roles existing.
create policy "Catalog categories are publicly readable"
  on public.categories for select using (true);

create policy "Catalog brands are publicly readable"
  on public.brands for select using (true);

create policy "Active products are publicly readable"
  on public.products for select using (is_active);
