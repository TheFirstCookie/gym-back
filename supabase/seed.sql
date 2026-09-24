-- Seed data mirroring the frontend's mock catalog (frontend/lib/catalog.ts).
-- Prices are stored in cents; sort_order preserves the catalog's "featured" order.
-- Idempotent: re-running updates rows by slug instead of duplicating them.

insert into public.categories (name, slug, accent_color, sort_order) values
  ('Strength',     'strength',     '#ff6b1a', 1),
  ('Conditioning', 'conditioning', '#42c49f', 2),
  ('Recovery',     'recovery',     '#e3bb49', 3),
  ('Accessories',  'accessories',  '#7b91ff', 4)
on conflict (slug) do update set
  name         = excluded.name,
  accent_color = excluded.accent_color,
  sort_order   = excluded.sort_order;

insert into public.brands (name, slug) values
  ('Ironline',       'ironline'),
  ('Tempo Labs',     'tempo-labs'),
  ('Groundwork',     'groundwork'),
  ('Kinetic Supply', 'kinetic-supply')
on conflict (slug) do update set
  name = excluded.name;

insert into public.products (
  name, slug, category_id, brand_id, price_cents, stock, tag, image_url, description, specs, sort_order
)
select
  seed.name, seed.slug, c.id, b.id, seed.price_cents, seed.stock, seed.tag,
  seed.image_url, seed.description, seed.specs, seed.sort_order
from (values
  (
    'Ironclad Hex Dumbbell Set', 'ironclad-hex-dumbbell-set', 'strength', 'ironline',
    22900, 12, 'Best seller',
    'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=1200&q=80',
    'Rubber-coated hex dumbbells with knurled chrome grips for daily strength work at home or in a studio.',
    array['5-30 kg pairs', 'Knurled steel grip', 'Low-bounce rubber heads'],
    1
  ),
  (
    'Tempo Sprint Bike', 'tempo-sprint-bike', 'conditioning', 'tempo-labs',
    64900, 5, 'Low stock',
    'https://images.unsplash.com/photo-1599058917212-d750089bc07e?auto=format&fit=crop&w=1200&q=80',
    'Compact air-resistance sprint bike with a stable frame, crisp monitor, and interval-ready controls.',
    array['Air resistance', 'Interval console', '150 kg max user weight'],
    2
  ),
  (
    'Competition Kettlebell', 'competition-kettlebell', 'strength', 'kinetic-supply',
    8600, 24, 'New',
    'https://images.unsplash.com/photo-1517963879433-6ad2b056d712?auto=format&fit=crop&w=1200&q=80',
    'Color-coded steel kettlebell with a consistent shell size across weights for cleaner technique.',
    array['8-32 kg range', 'Matte powder coat', 'Flat machined base'],
    3
  ),
  (
    'GridLock Training Mat', 'gridlock-training-mat', 'accessories', 'groundwork',
    5800, 31, 'Studio pick',
    'https://images.unsplash.com/photo-1605296867304-46d5465a13f1?auto=format&fit=crop&w=1200&q=80',
    'Dense training mat with guide marks for mobility, stretching, bodyweight work, and cooldowns.',
    array['6 mm dense foam', 'Anti-slip texture', 'Alignment grid'],
    4
  ),
  (
    'Pulse Recovery Roller', 'pulse-recovery-roller', 'recovery', 'groundwork',
    7200, 16, 'Recovery',
    'https://images.unsplash.com/photo-1600881333168-2ef49b341f30?auto=format&fit=crop&w=1200&q=80',
    'Firm textured roller for post-session recovery, travel warmups, and mobility maintenance.',
    array['Textured EVA', 'Hollow core', 'Carry strap included'],
    5
  ),
  (
    'Wall Rack Pro', 'wall-rack-pro', 'accessories', 'ironline',
    13400, 8, 'Space saver',
    'https://images.unsplash.com/photo-1571019613914-85f342c6a11e?auto=format&fit=crop&w=1200&q=80',
    'Powder-coated wall storage for bands, bars, straps, and jump ropes in compact training rooms.',
    array['Steel wall plate', '8 storage points', 'Hardware included'],
    6
  )
) as seed (
  name, slug, category_slug, brand_slug, price_cents, stock, tag, image_url, description, specs, sort_order
)
join public.categories c on c.slug = seed.category_slug
join public.brands b on b.slug = seed.brand_slug
on conflict (slug) do update set
  name        = excluded.name,
  category_id = excluded.category_id,
  brand_id    = excluded.brand_id,
  price_cents = excluded.price_cents,
  stock       = excluded.stock,
  tag         = excluded.tag,
  image_url   = excluded.image_url,
  description = excluded.description,
  specs       = excluded.specs,
  sort_order  = excluded.sort_order;
