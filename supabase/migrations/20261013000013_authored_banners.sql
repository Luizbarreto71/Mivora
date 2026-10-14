-- MIVORA — the owner's own banner art replaces the campaign photos with people (2026-10-13).
-- The new images already carry the MIVORA logo, so they are shown whole ("full" layout), without
-- copy on top; the copy stays for accessibility and for phones (below the image). Re-runnable.

alter table public.banners add column if not exists layout text not null default 'split';
do $$ begin
  alter table public.banners add constraint banners_layout_check check (layout in ('split', 'full'));
exception when duplicate_object then null; end $$;

-- Each old photo slide gets the new art, in the order the owner sent them:
-- serum (1), cream (2), gel texture (3), peel-off mask (4). Colours come from each image's edges.
update public.banners
   set image_desktop_url = '/banners/home-mivora-serum.webp',
       image_mobile_url = null,
       image_alt = 'Modelo sorrindo enquanto aplica sérum com conta-gotas no rosto, com a marca MIVORA',
       background_color = '#E8A9A5',
       layout = 'full',
       sort_order = 1
 where placement = 'hero' and image_desktop_url = '/banners/home-ritual-aparelho-luz.webp';

-- the Zero Pore Pad photo becomes the cream art: copy and link follow the new image
update public.banners
   set image_desktop_url = '/banners/home-mivora-creme.webp',
       image_mobile_url = null,
       image_alt = 'Modelo aplicando creme no rosto, com a marca MIVORA',
       eyebrow = 'Hidratantes',
       title = 'Hidratação que deixa a pele macia',
       subtitle = 'Cremes e géis para manter a pele hidratada e com aparência saudável ao longo do dia.',
       cta_label = 'Ver hidratantes',
       cta_href = '/categorias/hidratantes',
       background_color = '#E7A39E',
       layout = 'full',
       sort_order = 2
 where placement = 'hero' and image_desktop_url = '/banners/home-medicube-zero-pore-pad.webp';

update public.banners
   set image_desktop_url = '/banners/home-mivora-gel.webp',
       image_mobile_url = null,
       image_alt = 'Modelo de olhos fechados com textura em gel no rosto, com a marca MIVORA',
       background_color = '#E6CFB8',
       layout = 'full',
       sort_order = 3
 where placement = 'hero' and image_desktop_url = '/banners/home-medicube-collagen-jelly-cream.webp';

update public.banners
   set image_desktop_url = '/banners/home-mivora-mascara.webp',
       image_mobile_url = null,
       image_alt = 'Modelo removendo uma máscara transparente do rosto, com a marca MIVORA',
       background_color = '#EBAEAB',
       layout = 'full',
       sort_order = 4
 where placement = 'hero' and image_desktop_url = '/banners/home-medicube-collagen-night-wrapping-mask.webp';
