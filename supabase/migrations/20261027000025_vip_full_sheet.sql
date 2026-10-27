-- MIVORA — Comunidade VIP, ficha completa (2026-10-27): each post carries the bottle photo and the
-- whole technical sheet (accords, perfumers, launch year and, only when Fragrantica or Parfumo rate
-- them, longevity and sillage). Sheets researched before this version are researched again.
-- Re-runnable.

alter table public.vip_fragrances
  add column if not exists sheet_version smallint not null default 1,
  add column if not exists accords text[] not null default '{}',
  add column if not exists perfumers text[] not null default '{}',
  add column if not exists launch_year smallint,
  add column if not exists longevity text,
  add column if not exists sillage text,
  add column if not exists performance_source text,
  add column if not exists image_url text,
  add column if not exists image_source text;

alter table public.vip_fragrances drop constraint if exists vip_fragrances_full_sheet_check;
alter table public.vip_fragrances add constraint vip_fragrances_full_sheet_check check (
  (launch_year is null or launch_year between 1700 and 2100)
  and coalesce(length(longevity), 0) <= 60
  and coalesce(length(sillage), 0) <= 60
  and (performance_source is null or performance_source in ('Fragrantica', 'Parfumo'))
  and coalesce(length(image_url), 0) <= 2000
  and coalesce(length(image_source), 0) <= 80
  and cardinality(accords) <= 8
  and cardinality(perfumers) <= 4
);

-- where the post's photo came from: the store's product, the research or a photo the admin sent
alter table public.vip_posts add column if not exists image_source text;
alter table public.vip_posts drop constraint if exists vip_posts_image_source_check;
alter table public.vip_posts add constraint vip_posts_image_source_check check (coalesce(length(image_source), 0) <= 80);

-- posts made before this version: their photo came from the store's product
update public.vip_posts set image_source = 'loja' where image_url is not null and image_source is null;
