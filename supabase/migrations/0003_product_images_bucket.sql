-- ForgeFit Supply: Storage bucket for product photos.
--
-- Supabase-only (uses the storage schema), unlike 0001 and 0002.
--
-- Public bucket: anyone can read a photo by its URL, which the storefront needs.
-- No policies are added on storage.objects, so anon and signed-in users can't upload,
-- replace or delete. Uploads go through signed upload URLs that the API issues to admins
-- (see modules/admin-uploads), and the limits below are enforced by Storage itself.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
