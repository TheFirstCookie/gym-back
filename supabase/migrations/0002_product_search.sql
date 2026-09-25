-- ForgeFit Supply: product listings, search, brand facets and related products.
--
-- The storefront needs filtering, relevance-ranked search and pagination in one query,
-- which PostgREST's table filters can't express, so the logic lives in SQL functions the
-- API calls through supabase.rpc(). Like 0001, this is plain Postgres 15+.
--
-- Every function is SECURITY INVOKER (the default) and reads through a security_invoker
-- view, so callers only ever see rows their RLS policies allow: anon sees active products,
-- the API's service role sees everything.

-- ---------------------------------------------------------------------------
-- Flattened product rows with their category, brand and search document
-- ---------------------------------------------------------------------------

create view public.product_listings
with (security_invoker = true) as
select
  p.id,
  p.name,
  p.slug,
  p.price_cents,
  p.currency,
  p.stock,
  p.tag,
  p.image_url,
  p.description,
  p.specs,
  p.sort_order,
  p.is_active,
  p.created_at,
  p.updated_at,
  c.id   as category_id,
  c.name as category_name,
  c.slug as category_slug,
  b.id   as brand_id,
  b.name as brand_name,
  b.slug as brand_slug,
  -- Weights rank name hits (A) above brand/category/tag (B) above description/specs (C).
  -- Computed per query, which is fine at catalog scale; move it to a stored column with a
  -- GIN index if the catalog grows into the tens of thousands.
  setweight(to_tsvector('pg_catalog.english', p.name), 'A')
    || setweight(to_tsvector('pg_catalog.english', concat_ws(' ', b.name, c.name, p.tag)), 'B')
    || setweight(to_tsvector('pg_catalog.english', concat_ws(' ', p.description, array_to_string(p.specs, ' '))), 'C')
    as search_document
from public.products p
join public.categories c on c.id = p.category_id
join public.brands b on b.id = p.brand_id;

-- ---------------------------------------------------------------------------
-- Search helpers
-- ---------------------------------------------------------------------------

-- Turns free text into a prefix query: "Kettle bells!" -> 'kettl':* & 'bell':*.
-- Every word must match (AND), and each word matches as a prefix so results appear
-- while the shopper is still typing. English stemming makes plurals match singulars.
-- Returns NULL when the text has no searchable words, meaning "no search filter".
create function public.product_search_query(p_query text)
returns tsquery
language sql
immutable
set search_path = ''
as $$
  select case
    when terms is null then null
    else pg_catalog.to_tsquery('pg_catalog.english', terms)
  end
  from (
    select string_agg(term || ':*', ' & ') as terms
    from regexp_split_to_table(
      btrim(regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9]+', ' ', 'g')),
      ' '
    ) as term
    where term <> ''
  ) as words;
$$;

-- ---------------------------------------------------------------------------
-- Listing: filters, search, sort and pagination in one call
-- ---------------------------------------------------------------------------

-- p_status: 'active' (storefront), 'inactive' or 'all' (admin).
-- p_sort: 'featured' (merchandising order, or relevance when searching), 'price-asc',
--         'price-desc' or 'newest'.
-- total_count repeats the number of matches (before pagination) on every row.
create function public.search_products(
  p_category text default null,
  p_brands text[] default null,
  p_query text default null,
  p_sort text default 'featured',
  p_status text default 'active',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  price_cents integer,
  currency text,
  stock integer,
  tag text,
  image_url text,
  description text,
  specs text[],
  sort_order integer,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  category_id uuid,
  category_name text,
  category_slug text,
  brand_id uuid,
  brand_name text,
  brand_slug text,
  total_count bigint
)
language sql
stable
set search_path = ''
as $$
  with search as (
    select public.product_search_query(p_query) as tsq
  ),
  matches as (
    select
      l.*,
      coalesce(pg_catalog.ts_rank(l.search_document, s.tsq), 0) as rank
    from public.product_listings l
    cross join search s
    where (
        p_status = 'all'
        or (p_status = 'active' and l.is_active)
        or (p_status = 'inactive' and not l.is_active)
      )
      and (p_category is null or l.category_slug = p_category)
      and (coalesce(cardinality(p_brands), 0) = 0 or l.brand_slug = any (p_brands))
      and (s.tsq is null or l.search_document @@ s.tsq)
  )
  select
    m.id, m.name, m.slug, m.price_cents, m.currency, m.stock, m.tag, m.image_url,
    m.description, m.specs, m.sort_order, m.is_active, m.created_at, m.updated_at,
    m.category_id, m.category_name, m.category_slug,
    m.brand_id, m.brand_name, m.brand_slug,
    count(*) over () as total_count
  from matches m
  order by
    case when p_sort = 'price-asc' then m.price_cents end asc,
    case when p_sort = 'price-desc' then m.price_cents end desc,
    case when p_sort = 'newest' then m.created_at end desc,
    m.rank desc,
    m.sort_order,
    m.name,
    m.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- Brand facets: how many active products each brand has within a category/search
-- ---------------------------------------------------------------------------

-- Ignores the brand filter on purpose, so the storefront can show every brand chip with
-- its count and let shoppers combine brands. Brands with no matches come back with 0.
create function public.product_brand_facets(
  p_category text default null,
  p_query text default null
)
returns table (
  id uuid,
  name text,
  slug text,
  product_count integer
)
language sql
stable
set search_path = ''
as $$
  with search as (
    select public.product_search_query(p_query) as tsq
  )
  select
    b.id,
    b.name,
    b.slug,
    (count(l.id))::integer as product_count
  from public.brands b
  cross join search s
  left join public.product_listings l
    on l.brand_id = b.id
    and l.is_active
    and (p_category is null or l.category_slug = p_category)
    and (s.tsq is null or l.search_document @@ s.tsq)
  group by b.id
  order by b.name;
$$;

-- ---------------------------------------------------------------------------
-- Related products (first version of recommendations)
-- ---------------------------------------------------------------------------

-- Same category first, then same brand, then the rest of the catalog, so the row is
-- never empty. Order history can refine this later ("often bought together").
create function public.related_products(
  p_slug text,
  p_limit integer default 3
)
returns setof public.product_listings
language sql
stable
set search_path = ''
as $$
  select l.*
  from public.product_listings l
  join public.product_listings target on target.slug = p_slug
  where l.is_active
    and l.id <> target.id
  order by
    (l.category_id = target.category_id) desc,
    (l.brand_id = target.brand_id) desc,
    l.sort_order,
    l.name
  limit least(greatest(coalesce(p_limit, 3), 1), 12);
$$;
