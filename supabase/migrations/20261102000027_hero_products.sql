-- Home carousel: the three slides with an editorial photo now show a real product, with the same copy.
-- The photo banners stay in Conteúdo, switched off (not deleted). Banners edited to another photo are left alone.
insert into public.banners (placement, layout, eyebrow, title, subtitle, cta_label, cta_href, cta2_label, cta2_href, background_color, sort_order, product_id)
select 'hero', 'split', e.eyebrow, e.title, e.subtitle, e.cta_label, e.cta_href, e.cta2_label, e.cta2_href, e.background_color, e.sort_order, p.id
  from (values
    ('/editorial/hero-seruns-texturas.webp', 'skin1004-madagascar-centella-ampoule'),
    ('/editorial/hero-creme-bege.webp', 'dr-althea-345-relief-cream'),
    ('/editorial/hero-gotas-rose.webp', 'celimax-the-vita-a-retinal-shot')
  ) as v(photo, slug)
  join public.banners e on e.placement = 'hero' and e.image_desktop_url = v.photo
  join public.products p on p.slug = v.slug and p.status = 'published'
 where not exists (select 1 from public.banners b where b.placement = 'hero' and b.product_id = p.id and b.image_desktop_url is null);

update public.banners e
   set is_active = false
  from (values
    ('/editorial/hero-seruns-texturas.webp', 'skin1004-madagascar-centella-ampoule'),
    ('/editorial/hero-creme-bege.webp', 'dr-althea-345-relief-cream'),
    ('/editorial/hero-gotas-rose.webp', 'celimax-the-vita-a-retinal-shot')
  ) as v(photo, slug)
 where e.placement = 'hero'
   and e.image_desktop_url = v.photo
   and exists (select 1 from public.banners b join public.products p on p.id = b.product_id
                where b.placement = 'hero' and p.slug = v.slug and b.image_desktop_url is null);
