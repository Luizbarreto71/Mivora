-- Visual refresh: official product photos, editorial images for categories and new hero slides.
-- Product photos come from the brands' own stores (exact SKU checked); editorial photos are under the Unsplash
-- License. Every file lives in /public (see assets/IMAGENS.md for the source of each one).

-- ---------------------------------------------------------------------------
-- Product photos: higher-resolution primary photo (only while it is still the original catalogue file)
-- ---------------------------------------------------------------------------
update public.product_images pi
   set url = p.url, alt = p.alt, width = p.width, height = p.height
  from (values
  ('skin1004-madagascar-centella-light-cleansing-oil', '/products/skin1004-madagascar-centella-light-cleansing-oil.webp', '/products/skin1004-madagascar-centella-light-cleansing-oil-frente.webp', 'Frasco com válvula do SKIN1004 Madagascar Centella Light Cleansing Oil, 200 ml', 1200, 1200),
  ('medicube-collagen-jelly-cream', '/products/medicube-collagen-jelly-cream.webp', '/products/medicube-collagen-jelly-cream-frente.webp', 'Pote aberto do Medicube Collagen Jelly Cream, 50 ml, com o creme em gel à mostra', 1200, 1200),
  ('medicube-collagen-night-wrapping-mask', '/products/medicube-collagen-night-wrapping-mask.webp', '/products/medicube-collagen-night-wrapping-mask-frente.webp', 'Bisnaga do Medicube Collagen Night Wrapping Mask, 75 ml, com gel transparente ao fundo', 1200, 1200),
  ('medicube-pdrn-pink-collagen-capsule-cream', '/products/medicube-pdrn-pink-collagen-capsule-cream.webp', '/products/medicube-pdrn-pink-collagen-capsule-cream-frente.webp', 'Pote aberto do Medicube PDRN Pink Collagen Capsule Cream com as cápsulas rosadas', 1200, 1200),
  ('medicube-pdrn-pink-collagen-exosome-shot-7500', '/products/medicube-pdrn-pink-collagen-exosome-shot-7500.webp', '/products/medicube-pdrn-pink-collagen-exosome-shot-7500-frente.webp', 'Frasco do Medicube PDRN Pink Collagen Exosome Shot 7500', 1200, 1200),
  ('medicube-deep-vita-c-capsule-cream', '/products/medicube-deep-vita-c-capsule-cream.webp', '/products/medicube-deep-vita-c-capsule-cream-frente.webp', 'Pote aberto do Medicube Deep Vita C Capsule Cream com as cápsulas amarelas', 1200, 1200),
  ('beauty-of-joseon-revive-eye-serum-ginseng-retinal', '/products/beauty-of-joseon-revive-eye-serum-ginseng-retinal.webp', '/products/beauty-of-joseon-revive-eye-serum-ginseng-retinal-frente.webp', 'Bisnaga do Beauty of Joseon Revive Eye Serum: Ginseng + Retinal', 1200, 1200),
  ('numbuzin-no9-nad-bio-lifting-sil-essence', '/products/numbuzin-no9-nad-bio-lifting-sil-essence.webp', '/products/numbuzin-no9-nad-bio-lifting-sil-essence-frente.webp', 'Frasco do Numbuzin No.9 NAD+ Bio Lifting-Sil Essence', 1200, 1200),
  ('celimax-the-vita-a-retinal-shot', '/products/celimax-the-vita-a-retinal-shot.webp', '/products/celimax-the-vita-a-retinal-shot-frente.webp', 'Bisnaga do Celimax The Vita A Retinal Shot', 1200, 1200)
  ) as p(slug, old_url, url, alt, width, height)
  join public.products pr on pr.slug = p.slug
 where pi.product_id = pr.id and pi.is_primary and pi.url = p.old_url;

-- Gallery photos (texture, packaging, ambience), added once
insert into public.product_images (product_id, url, alt, width, height, sort_order, is_primary, fit)
select pr.id, g.url, g.alt, g.width, g.height, g.sort_order, false, 'cover'
  from (values
  ('medicube-pdrn-pink-peptide-serum', '/products/medicube-pdrn-pink-peptide-serum-ambiente.webp', 'Frasco do Medicube PDRN Pink Peptide Serum com esferas rosadas ao fundo', 1200, 1200, 1),
  ('medicube-deep-vita-c-pad', '/products/medicube-deep-vita-c-pad-discos.webp', 'Pote do Medicube Deep Vita C Pad com os discos à mostra', 1200, 1200, 1),
  ('skin1004-madagascar-centella-ampoule', '/products/skin1004-madagascar-centella-ampoule-ambiente.webp', 'Frascos do SKIN1004 Madagascar Centella Ampoule sob luz natural', 1200, 1200, 1),
  ('skin1004-madagascar-centella-ampoule', '/products/skin1004-madagascar-centella-ampoule-textura.webp', 'Textura líquida do SKIN1004 Madagascar Centella Ampoule', 900, 900, 2),
  ('skin1004-madagascar-centella-ampoule', '/products/skin1004-madagascar-centella-ampoule-frascos.webp', 'Três frascos do SKIN1004 Madagascar Centella Ampoule', 900, 900, 3),
  ('skin1004-madagascar-centella-tone-brightening-capsule-ampoule', '/products/skin1004-madagascar-centella-tone-brightening-capsule-ampoule-textura.webp', 'Textura com cápsulas do SKIN1004 Tone Brightening Capsule Ampoule', 900, 900, 1),
  ('skin1004-madagascar-centella-tone-brightening-capsule-ampoule', '/products/skin1004-madagascar-centella-tone-brightening-capsule-ampoule-ambiente.webp', 'Frasco do SKIN1004 Tone Brightening Capsule Ampoule sob luz e sombra', 900, 900, 2),
  ('skin1004-madagascar-centella-tone-brightening-capsule-ampoule', '/products/skin1004-madagascar-centella-tone-brightening-capsule-ampoule-composicao.webp', 'Frasco do SKIN1004 Tone Brightening Capsule Ampoule entre pedras', 900, 900, 3),
  ('skin1004-madagascar-centella-light-cleansing-oil', '/products/skin1004-madagascar-centella-light-cleansing-oil-com-caixa.webp', 'SKIN1004 Madagascar Centella Light Cleansing Oil ao lado da embalagem', 1200, 1200, 1),
  ('skin1004-madagascar-centella-light-cleansing-oil', '/products/skin1004-madagascar-centella-light-cleansing-oil-textura.webp', 'Óleo de limpeza escorrendo entre as mãos', 900, 900, 2),
  ('skin1004-madagascar-centella-light-cleansing-oil', '/products/skin1004-madagascar-centella-light-cleansing-oil-ambiente.webp', 'SKIN1004 Madagascar Centella Light Cleansing Oil apoiado em pedra clara', 900, 900, 3),
  ('medicube-collagen-jelly-cream', '/products/medicube-collagen-jelly-cream-textura.webp', 'Espátula com a textura em gel do Medicube Collagen Jelly Cream', 1080, 1080, 1),
  ('numbuzin-no9-nad-bio-lifting-sil-essence', '/products/numbuzin-no9-nad-bio-lifting-sil-essence-ambiente.webp', 'Numbuzin No.9 NAD+ Bio Lifting-Sil Essence sobre fundo lilás', 1000, 1000, 1),
  ('numbuzin-no9-volumetox-eye-cream', '/products/numbuzin-no9-volumetox-eye-cream-aplicador.webp', 'Aplicador do Numbuzin No.9 NAD+ Retinol Volumetox Eye Cream com o creme na ponta', 1000, 1000, 1),
  ('celimax-the-vita-a-retinal-shot', '/products/celimax-the-vita-a-retinal-shot-textura.webp', 'Textura amarela do Celimax The Vita A Retinal Shot', 1000, 1000, 1),
  ('celimax-pore-dark-spot-brightening-cream', '/products/celimax-pore-dark-spot-brightening-cream-textura.webp', 'Textura cremosa do Celimax PORE+DARK Spot Brightening Cream', 828, 828, 1)
  ) as g(slug, url, alt, width, height, sort_order)
  join public.products pr on pr.slug = g.slug
 where not exists (select 1 from public.product_images x where x.product_id = pr.id and x.url = g.url);

-- ---------------------------------------------------------------------------
-- Category images for "Compre por categoria" (kept when the admin already chose one)
-- ---------------------------------------------------------------------------
update public.categories c
   set image_url = v.url
  from (values
  ('limpeza', '/editorial/categoria-limpeza.webp'),
  ('seruns-e-ampolas', '/editorial/categoria-seruns.webp'),
  ('hidratantes', '/editorial/categoria-hidratantes.webp'),
  ('tonicos-e-discos', '/editorial/categoria-tonicos.webp'),
  ('mascaras', '/editorial/categoria-mascaras.webp'),
  ('protecao-solar', '/editorial/categoria-protecao-solar.webp'),
  ('cuidados-capilares', '/editorial/categoria-capilares.webp'),
  ('fragrancias', '/editorial/categoria-fragrancias.webp')
  ) as v(slug, url)
 where c.slug = v.slug and c.image_url is null;

-- ---------------------------------------------------------------------------
-- Home banner: three editorial slides after the current first slide, in high resolution with the copy in HTML.
-- The four 837 px art pieces (logo baked in, soft on large screens) are switched off, not deleted: they can be
-- turned on again in Conteúdo.
-- ---------------------------------------------------------------------------
insert into public.banners (placement, layout, eyebrow, title, subtitle, cta_label, cta_href, cta2_label, cta2_href, image_desktop_url, image_mobile_url, image_alt, background_color, sort_order)
select 'hero', 'split', v.eyebrow, v.title, v.subtitle, v.cta_label, v.cta_href, v.cta2_label, v.cta2_href, v.image_desktop_url, v.image_mobile_url, v.image_alt, v.background_color, v.sort_order
  from (values
  ('Curadoria MIVORA', 'Skincare coreano escolhido para a sua rotina', 'Séruns, ampolas, cremes e tônicos de marcas como Medicube, SKIN1004, Celimax e Dr. Althea.', 'Explorar produtos', '/produtos', 'Ver marcas', '/marcas', '/editorial/hero-seruns-texturas.webp', '/editorial/hero-seruns-texturas-mobile.webp', 'Texturas de séruns e cremes em placas de vidro sobre fundo pêssego', '#F6EAE2', 1),
  ('Hidratação', 'Pele macia, confortável e com viço', 'Cremes, géis e séruns hidratantes para a sua rotina de cuidados.', 'Ver hidratantes', '/categorias/hidratantes', null, null, '/editorial/hero-creme-bege.webp', '/editorial/hero-creme-bege-mobile.webp', 'Textura de creme branco sobre fundo bege', '#F1E9DF', 2),
  ('Ritual MIVORA', 'Sua rotina em etapas, do jeito certo', 'Limpeza, tratamento, hidratação e proteção: monte um ritual com produtos que combinam entre si.', 'Monte seu ritual', '/ritual', null, null, '/editorial/hero-gotas-rose.webp', '/editorial/hero-gotas-rose-mobile.webp', 'Gotas cristalinas sobre fundo rosé', '#F7E8E7', 3)
  ) as v(eyebrow, title, subtitle, cta_label, cta_href, cta2_label, cta2_href, image_desktop_url, image_mobile_url, image_alt, background_color, sort_order)
 where not exists (select 1 from public.banners b where b.placement = 'hero' and b.image_desktop_url = v.image_desktop_url);

update public.banners
   set is_active = false
 where placement = 'hero' and layout = 'full' and is_active
   and image_desktop_url in ('/banners/home-mivora-serum.webp', '/banners/home-mivora-creme.webp', '/banners/home-mivora-gel.webp', '/banners/home-mivora-mascara.webp');
