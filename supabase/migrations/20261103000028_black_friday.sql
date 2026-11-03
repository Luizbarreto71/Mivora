-- Black Friday (2026-11-03): the owner's two vertical (3:4) art pieces open the home carousel.
-- New "poster" layout: vertical art shown whole (full width on phones, beside the copy on computers).
-- The other slides move two places down. Re-runnable.

alter table public.banners drop constraint if exists banners_layout_check;
alter table public.banners add constraint banners_layout_check check (layout in ('split', 'full', 'poster'));

update public.banners
   set sort_order = sort_order + 2
 where placement = 'hero'
   and not exists (select 1 from public.banners where image_desktop_url like '/banners/black-friday-%');

insert into public.banners (placement, layout, eyebrow, title, subtitle, cta_label, cta_href, image_desktop_url, image_alt, background_color, sort_order)
select 'hero', 'poster', v.eyebrow, v.title, v.subtitle, 'Ver ofertas', '/ofertas', v.image, v.alt, v.color, v.sort_order
  from (values
    ('Medicube · Celimax', 'Black Friday MIVORA',
     'Medicube Zero Pore Pad por R$ 129,99 e Celimax Retinal Shot Tightening Booster por R$ 119,99.',
     '/banners/black-friday-medicube-celimax.webp',
     'Arte de Black Friday da MIVORA: Medicube Zero Pore Pad de R$ 219,99 por R$ 129,99 e Celimax Retinal Shot Tightening Booster de R$ 179,99 por R$ 119,99. Compre agora.',
     '#F3E1DE', 0),
    ('Black Friday MIVORA', 'Skincare coreano em oferta',
     'Veja todos os produtos com preço de Black Friday na MIVORA.',
     '/banners/black-friday-ate-50.webp',
     'Arte de Black Friday da MIVORA: até 50% de desconto nos produtos coreanos, com Medicube PDRN Pink Peptide Serum, Zero Pore Pad, PDRN Pink Collagen Exosome Shot 7500 e Collagen Jelly Cream. Compre agora.',
     '#EFDCD8', 1)
  ) as v(eyebrow, title, subtitle, image, alt, color, sort_order)
 where not exists (select 1 from public.banners b where b.image_desktop_url = v.image);
