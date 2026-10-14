-- MIVORA — home carousel: four campaign photos with copy beside each photo (owner's request, 2026-10-13).
-- Re-runnable. Photos are bundled with the site in public/banners (originals in assets/originals/banners).
-- Every active "hero" banner is a slide; the owner edits, reorders or deactivates them in Admin → Conteúdo da home.

-- 1. Brand slide: the original "Sua pele, seu ritual." banner gets the photo (or is created if it was changed)
do $$
begin
  -- skipped once the owner's own art replaced these photos (migration 013)
  if not exists (select 1 from public.banners where image_desktop_url = '/banners/home-ritual-aparelho-luz.webp')
     and not exists (select 1 from public.banners where image_desktop_url like '/banners/home-mivora-%') then
    update public.banners
       set image_desktop_url = '/banners/home-ritual-aparelho-luz.webp',
           image_alt = 'Modelo com a pele luminosa usando um aparelho facial de luz na bochecha',
           cta2_label = null,
           cta2_href = null,
           sort_order = 1
     where placement = 'hero' and image_desktop_url is null and title = 'Sua pele, seu ritual.';
    if not found then
      insert into public.banners (placement, eyebrow, title, subtitle, cta_label, cta_href, image_desktop_url, image_alt, sort_order)
      values ('hero', 'Skincare coreano e beleza internacional', 'Sua pele, seu ritual.',
              'Uma curadoria especial de skincare para transformar seus momentos de autocuidado.',
              'Explorar produtos', '/produtos', '/banners/home-ritual-aparelho-luz.webp',
              'Modelo com a pele luminosa usando um aparelho facial de luz na bochecha', 1);
    end if;
  end if;
end $$;

-- 2. Product slides (cosmetic claims only: appearance and feel, never guaranteed results)
insert into public.banners (placement, eyebrow, title, subtitle, cta_label, cta_href, image_desktop_url, image_alt, sort_order)
select v.* from (values
  ('hero', 'Medicube · Collagen Night Wrapping Mask', 'Desperte seu glow com o cuidado noturno',
   'Máscara noturna com colágeno: aplique antes de dormir e, pela manhã, remova o filme para revelar uma pele com aparência mais firme e viçosa.',
   'Ver produto', '/produtos/medicube-collagen-night-wrapping-mask', '/banners/home-medicube-collagen-night-wrapping-mask.webp',
   'Modelo sorrindo enquanto remove do rosto a película transparente da máscara noturna', 2),
  ('hero', 'Medicube · Zero Pore Pad', 'Poros limpos, pele lisa',
   'Discos com AHA e BHA para um cuidado diário simples, que deixa os poros com aparência mais discreta.',
   'Comprar agora', '/produtos/medicube-zero-pore-pad', '/banners/home-medicube-zero-pore-pad.webp',
   'Modelo sorrindo e segurando o pote do Medicube Zero Pore Pad', 3),
  ('hero', 'Medicube · Collagen Jelly Cream', 'Glow de pele de vidro o dia todo',
   'Creme em gel com colágeno que hidrata e deixa a pele com aparência viçosa e luminosa do amanhecer ao fim do dia.',
   'Ver produto', '/produtos/medicube-collagen-jelly-cream', '/banners/home-medicube-collagen-jelly-cream.webp',
   'Modelo com a pele luminosa, apoiada ao lado do pote do Medicube Collagen Jelly Cream', 4)
) as v(placement, eyebrow, title, subtitle, cta_label, cta_href, image_desktop_url, image_alt, sort_order)
where not exists (select 1 from public.banners b where b.image_desktop_url = v.image_desktop_url)
  and not exists (select 1 from public.banners b where b.image_desktop_url like '/banners/home-mivora-%');
