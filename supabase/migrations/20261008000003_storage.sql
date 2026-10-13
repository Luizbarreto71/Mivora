-- MIVORA — media storage
-- Public bucket for catalogue images (read via public URL). Only admins can
-- write. Size and MIME type limits are enforced by Storage itself, in
-- addition to the server-side validation and re-encoding done by the upload
-- route (/api/admin/upload).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-media', 'product-media', true, 8388608,
        array['image/webp', 'image/jpeg', 'image/png', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "admins upload product media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-media' and public.is_admin());

create policy "admins update product media" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-media' and public.is_admin())
  with check (bucket_id = 'product-media' and public.is_admin());

create policy "admins delete product media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-media' and public.is_admin());

create policy "admins list product media" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-media' and public.is_admin());
