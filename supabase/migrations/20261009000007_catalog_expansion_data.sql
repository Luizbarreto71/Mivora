-- MIVORA — catalogue expansion: brands, category tree and 29 product records.
-- Idempotent: re-running never duplicates rows. It NEVER changes prices, stock,
-- availability, images or publication of existing products.
--
--   01–09  confirmed stock      → untouched commercial data, sourcing = stock_confirmed
--   10–21  priority acquisition → draft + "Em breve" (coming_soon), sourcing = planned
--   22–29  under evaluation     → draft + "Em breve" (coming_soon), sourcing = evaluating, no technical copy
-- None of the 20 new products has price, stock or photos. All technical content is
-- flagged as "to be verified" (product_private.content_verified = false).

-- ---------------------------------------------------------------------------
-- Brands (no partnership or authorised-reseller claims)
-- ---------------------------------------------------------------------------
insert into public.brands (slug, name, tagline, description, origin_country, sort_order) values
  ('biodance', 'Biodance', 'Máscaras de hidrogel e cuidado intensivo', 'Marca sul-coreana conhecida pelas máscaras de hidrogel de uso prolongado.', 'Coreia do Sul', 6),
  ('mediheal', 'Mediheal', 'Especialista em máscaras e discos faciais', 'Marca sul-coreana com ampla linha de máscaras e discos para diferentes necessidades da pele.', 'Coreia do Sul', 7),
  ('torriden', 'Torriden', 'Hidratação com ácido hialurônico', 'Marca sul-coreana reconhecida pela linha DIVE-IN, dedicada à hidratação.', 'Coreia do Sul', 8),
  ('anua', 'Anua', 'Heartleaf para peles que pedem conforto', 'Marca sul-coreana conhecida pelos produtos com heartleaf (Houttuynia cordata).', 'Coreia do Sul', 9),
  ('aestura', 'Aestura', 'Cuidado com a barreira cutânea', 'Marca sul-coreana de dermocosméticos com linhas voltadas à hidratação e à barreira da pele.', 'Coreia do Sul', 10),
  ('beauty-of-joseon', 'Beauty of Joseon', 'Inspiração na tradição coreana', 'Marca sul-coreana que combina ingredientes tradicionais e fórmulas contemporâneas.', 'Coreia do Sul', 11),
  ('cosrx', 'COSRX', 'Fórmulas objetivas e ativos em destaque', 'Marca sul-coreana conhecida por fórmulas diretas, como a linha de mucina de caracol.', 'Coreia do Sul', 12),
  ('round-lab', 'Round Lab', 'Ingredientes de origem coreana', 'Marca sul-coreana conhecida pela linha 1025 Dokdo, inspirada na água do mar profundo de Ulleungdo.', 'Coreia do Sul', 13),
  ('tirtir', 'TIRTIR', 'Skincare e maquiagem coreanos', 'Marca sul-coreana de skincare e maquiagem.', 'Coreia do Sul', 14),
  ('laneige', 'Laneige', 'Hidratação como assinatura', 'Marca sul-coreana conhecida pelos cuidados hidratantes, incluindo a linha de máscaras labiais.', 'Coreia do Sul', 15),
  ('banila-co', 'Banila Co', 'Especialista em limpeza facial', 'Marca sul-coreana conhecida pelos bálsamos de limpeza da linha Clean It Zero.', 'Coreia do Sul', 16)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Category tree (product types). Existing slugs are kept so public URLs survive.
-- ---------------------------------------------------------------------------
insert into public.categories (slug, name, kind, description, sort_order, is_featured) values
  ('limpeza', 'Limpeza facial', 'product_type', 'Óleos, espumas e bálsamos para a primeira etapa do ritual.', 1, true),
  ('hidratantes', 'Hidratantes', 'product_type', 'Cremes, géis e reparadores de barreira para selar a rotina.', 3, true),
  ('tonicos-e-discos', 'Tônicos e discos', 'product_type', 'Tônicos e discos para preparar e equilibrar a pele.', 4, true),
  ('mascaras', 'Máscaras', 'product_type', 'Máscaras de hidrogel, noturnas e hidratantes.', 5, true),
  ('cuidados-especificos', 'Cuidados específicos', 'product_type', 'Olhos, lábios, retinal, poros e manchas.', 6, true)
on conflict (slug) do nothing;

update public.categories set parent_id = null, sort_order = 2, name = 'Séruns e ampolas' where slug = 'seruns-e-ampolas';

with children(slug, name, parent, description, sort_order) as (values
  ('oleos-de-limpeza', 'Óleos de limpeza', 'limpeza', 'Removem maquiagem e protetor solar na primeira limpeza.', 1),
  ('espumas-de-limpeza', 'Espumas de limpeza', 'limpeza', 'Limpeza com espuma para a segunda etapa.', 2),
  ('balsamos-de-limpeza', 'Bálsamos de limpeza', 'limpeza', 'Textura bálsamo que se transforma em óleo ao contato com a pele.', 3),
  ('seruns-hidratantes', 'Séruns hidratantes', 'seruns-e-ampolas', 'Fórmulas concentradas para hidratação.', 1),
  ('seruns-iluminadores', 'Séruns iluminadores', 'seruns-e-ampolas', 'Para uma pele com aparência mais luminosa e uniforme.', 2),
  ('seruns-antissinais', 'Séruns para cuidados antissinais', 'seruns-e-ampolas', 'Para cuidar da aparência de linhas finas e da firmeza.', 3),
  ('ampolas-calmantes', 'Ampolas calmantes', 'seruns-e-ampolas', 'Cuidado suave e sensação de conforto.', 4),
  ('hidratantes-em-gel', 'Hidratantes em gel', 'hidratantes', 'Texturas leves e refrescantes.', 3),
  ('tonicos-hidratantes', 'Tônicos hidratantes', 'tonicos-e-discos', 'Hidratação logo após a limpeza.', 1),
  ('discos-tonificantes', 'Discos tonificantes', 'tonicos-e-discos', 'Discos embebidos em tônico para a etapa de preparação.', 2),
  ('discos-esfoliantes', 'Discos esfoliantes', 'tonicos-e-discos', 'Esfoliação suave em formato de disco.', 3),
  ('mascaras-de-hidrogel', 'Máscaras de hidrogel', 'mascaras', 'Máscaras de hidrogel para um momento de cuidado intensivo.', 1),
  ('mascaras-noturnas', 'Máscaras noturnas', 'mascaras', 'Última etapa da rotina noturna.', 2),
  ('mascaras-hidratantes', 'Máscaras hidratantes', 'mascaras', 'Hidratação extra quando a pele pede.', 3),
  ('cuidados-labiais', 'Cuidados labiais', 'cuidados-especificos', 'Hidratação e conforto para os lábios.', 2),
  ('cuidados-para-poros', 'Cuidados para aparência de poros', 'cuidados-especificos', 'Para cuidar da aparência dos poros e da textura.', 4),
  ('cuidados-para-manchas', 'Produtos para aparência de manchas', 'cuidados-especificos', 'Para cuidar da aparência de manchas e do tom.', 5)
)
insert into public.categories (slug, name, kind, parent_id, description, sort_order)
select c.slug, c.name, 'product_type', p.id, c.description, c.sort_order
  from children c join public.categories p on p.slug = c.parent
on conflict (slug) do nothing;

-- Existing product types move under the new groups (slugs preserved)
update public.categories set parent_id = (select id from public.categories where slug = 'hidratantes'), sort_order = 1
 where slug = 'cremes-faciais';
update public.categories set parent_id = (select id from public.categories where slug = 'hidratantes'), sort_order = 2, name = 'Reparadores de barreira'
 where slug = 'hidratantes-e-cremes-reparadores';
update public.categories set parent_id = (select id from public.categories where slug = 'cuidados-especificos'), sort_order = 1, name = 'Área dos olhos'
 where slug = 'cuidados-com-os-olhos';
update public.categories set parent_id = (select id from public.categories where slug = 'cuidados-especificos'), sort_order = 3, name = 'Produtos com retinal'
 where slug = 'tratamentos-com-retinoides';
-- "Discos faciais" is replaced by "Tônicos e discos" (old URL redirects, see next.config.ts)
update public.categories set is_published = false where slug = 'discos-faciais';

-- Ritual steps now point to the new groups
update public.ritual_steps set category_id = (select id from public.categories where slug = 'limpeza')
 where step_number = 1 and category_id is not distinct from (select id from public.categories where slug = 'limpeza-facial');
update public.ritual_steps set category_id = (select id from public.categories where slug = 'tonicos-e-discos')
 where category_id = (select id from public.categories where slug = 'discos-faciais');
update public.ritual_steps set category_id = (select id from public.categories where slug = 'hidratantes')
 where category_id = (select id from public.categories where slug = 'hidratantes-e-cremes-reparadores');

-- ---------------------------------------------------------------------------
-- 01–09: existing stock. Names aligned to the official commercial names; prices,
-- stock, availability, status and images are left exactly as they are.
-- ---------------------------------------------------------------------------
update public.products set name = 'Medicube PDRN Pink Peptide Serum', seo_title = 'Medicube PDRN Pink Peptide Serum'
 where slug = 'medicube-pdrn-pink-peptide-serum' and name = 'Medicube PDRN Pink Peptide Sérum Facial';
update public.products set name = 'Medicube Zero Pore Pad', seo_title = 'Medicube Zero Pore Pad — Discos Tonificantes'
 where slug = 'medicube-zero-pore-pad' and name = 'Discos Tonificantes Medicube Zero Pore Pad';
update public.products set name = 'Medicube Deep Vita C Pad', seo_title = 'Medicube Deep Vita C Pad — Discos de Vitamina C'
 where slug = 'medicube-deep-vita-c-pad' and name = 'Medicube Deep Vita C Pad — Discos de Vitamina C';
update public.products set name = 'Celimax The Vita A Retinal Shot — 0,1% Retinal', seo_title = 'Celimax The Vita A Retinal Shot — 0,1% Retinal'
 where slug = 'celimax-the-vita-a-retinal-shot' and name = 'Celimax Retinal 0,1% — The Vita A Retinal Shot';
update public.products set name = 'Numbuzin No.9 NAD+ Retinol Volumetox Eye Cream', seo_title = 'Numbuzin No.9 NAD+ Retinol Volumetox Eye Cream'
 where slug = 'numbuzin-no9-volumetox-eye-cream' and name = 'Numbuzin No.9 Creme Volumetox para Olhos com Retinol e NAD+';

-- Canonical tags used by the recommendation engine to avoid irritating pairings
update public.products set tags = array_append(tags, 'retinoide')
 where slug in ('celimax-the-vita-a-retinal-shot', 'numbuzin-no9-volumetox-eye-cream') and not ('retinoide' = any (tags));
update public.products set tags = array_append(tags, 'esfoliante')
 where slug = 'medicube-zero-pore-pad' and not ('esfoliante' = any (tags));

update public.product_private set sourcing_status = 'stock_confirmed'
 where product_id in (select id from public.products where slug in (
   'medicube-pdrn-pink-peptide-serum', 'medicube-zero-pore-pad', 'medicube-deep-vita-c-pad',
   'celimax-the-vita-a-retinal-shot', 'celimax-pore-dark-spot-brightening-cream', 'numbuzin-no9-volumetox-eye-cream',
   'dr-althea-345-relief-cream', 'skin1004-madagascar-centella-ampoule', 'skin1004-madagascar-centella-tone-brightening-capsule-ampoule'));

-- ---------------------------------------------------------------------------
-- 10–29: new records (draft, coming soon, no price/stock/photos)
-- ---------------------------------------------------------------------------
with b as (select id, slug from public.brands)
insert into public.products (
  slug, name, brand_id, product_line, volume, short_description, description, benefits, key_ingredients,
  how_to_use, warnings, skin_types, tags, status, availability, track_inventory, media_pending, sort_order,
  seo_title, seo_description
) values
(
  'medicube-collagen-jelly-cream', 'Medicube Collagen Jelly Cream', (select id from b where slug = 'medicube'), 'Collagen', '110 ml',
  'Creme de textura jelly com colágeno, para uma pele hidratada e com aparência luminosa.',
  'O Collagen Jelly Cream traduz a proposta da linha Collagen da Medicube em uma textura jelly, fresca e macia, que se espalha com facilidade e deixa a pele confortável sem sensação pesada. Funciona como a etapa final da rotina, de manhã ou à noite, para quem busca hidratação com um acabamento luminoso.',
  array['Hidratação com textura leve', 'Contribui para uma aparência luminosa', 'Textura jelly confortável'],
  array['Colágeno'],
  'Na última etapa da rotina, aplique uma quantidade adequada sobre o rosto e espalhe com movimentos suaves até a absorção.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos'], array['colágeno', 'collagen', 'jelly', 'hidratante', 'creme', 'glow', 'luminosidade'],
  'draft', 'coming_soon', false, true, 10,
  'Medicube Collagen Jelly Cream 110 ml', 'Creme hidratante Medicube com colágeno e textura jelly para uma pele hidratada e luminosa.'
),
(
  'medicube-collagen-night-wrapping-mask', 'Medicube Collagen Night Wrapping Mask', (select id from b where slug = 'medicube'), 'Collagen', '75 ml',
  'Máscara noturna com colágeno que envolve a pele durante a noite para um cuidado hidratante.',
  'A Collagen Night Wrapping Mask é a etapa final do ritual noturno: aplicada em camada uniforme, forma um filme sobre a pele enquanto você descansa. Pela manhã, a pele está pronta para começar o dia com sensação de maciez e hidratação. Siga as orientações da embalagem para tempo de uso e remoção.',
  array['Cuidado hidratante durante a noite', 'Sensação de pele macia ao acordar', 'Etapa final do ritual noturno'],
  array['Colágeno'],
  'À noite, como última etapa, aplique uma camada uniforme sobre o rosto seco, evitando olhos, sobrancelhas e lábios. Deixe agir durante a noite e remova pela manhã, conforme as orientações da embalagem.',
  'Uso externo. Evite a área dos olhos, sobrancelhas e linha do cabelo. Não aplique sobre pele irritada. Suspenda o uso em caso de irritação.',
  array['todos'], array['colágeno', 'collagen', 'máscara', 'mascara noturna', 'sleeping mask', 'hidratação'],
  'draft', 'coming_soon', false, true, 11,
  'Medicube Collagen Night Wrapping Mask 75 ml', 'Máscara noturna Medicube com colágeno para um cuidado hidratante durante a noite.'
),
(
  'skin1004-madagascar-centella-light-cleansing-oil', 'SKIN1004 Madagascar Centella Light Cleansing Oil', (select id from b where slug = 'skin1004'), 'Madagascar Centella', '200 ml',
  'Óleo de limpeza leve com Centella asiatica de Madagascar, para remover maquiagem e protetor solar.',
  'Primeira etapa da dupla limpeza, o Light Cleansing Oil dissolve maquiagem, protetor solar e impurezas oleosas com uma textura leve. Em contato com a água, emulsiona e é enxaguado com facilidade, sem deixar sensação oleosa. Combina naturalmente com a Madagascar Centella Ampoule Foam na segunda etapa.',
  array['Remove maquiagem e protetor solar', 'Textura leve que emulsiona com água', 'Primeira etapa da dupla limpeza'],
  array['Extrato de Centella asiatica de Madagascar'],
  'Com as mãos e o rosto secos, aplique uma quantidade adequada e massageie suavemente. Adicione um pouco de água para emulsionar e enxágue bem. Siga com uma espuma de limpeza.',
  'Uso externo. Evite o contato direto com os olhos; em caso de contato, enxágue com água. Suspenda o uso em caso de irritação.',
  array['todos'], array['centella', 'óleo de limpeza', 'cleansing oil', 'demaquilante', 'dupla limpeza', 'limpeza', 'protetor solar'],
  'draft', 'coming_soon', false, true, 12,
  'SKIN1004 Madagascar Centella Light Cleansing Oil 200 ml', 'Óleo de limpeza SKIN1004 com Centella de Madagascar para remover maquiagem e protetor solar.'
),
(
  'skin1004-madagascar-centella-ampoule-foam', 'SKIN1004 Madagascar Centella Ampoule Foam', (select id from b where slug = 'skin1004'), 'Madagascar Centella', '125 ml',
  'Espuma de limpeza da linha Madagascar Centella, para uma limpeza facial com sensação de conforto.',
  'A Ampoule Foam leva a Centella asiatica de Madagascar para a etapa de limpeza. Forma uma espuma cremosa que remove impurezas e o excesso de oleosidade, deixando a pele limpa e confortável. Ideal como segunda etapa após o óleo de limpeza ou como limpeza única pela manhã.',
  array['Limpeza facial com espuma cremosa', 'Sensação de conforto após o enxágue', 'Segunda etapa da dupla limpeza'],
  array['Extrato de Centella asiatica de Madagascar'],
  'Faça espuma com uma pequena quantidade e água nas mãos. Massageie o rosto úmido com movimentos suaves e enxágue bem.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água. Suspenda o uso em caso de irritação.',
  array['todos'], array['centella', 'espuma de limpeza', 'cleansing foam', 'sabonete facial', 'limpeza'],
  'draft', 'coming_soon', false, true, 13,
  'SKIN1004 Madagascar Centella Ampoule Foam 125 ml', 'Espuma de limpeza facial SKIN1004 com Centella de Madagascar.'
),
(
  'biodance-bio-collagen-real-deep-mask', 'Biodance Bio-Collagen Real Deep Mask', (select id from b where slug = 'biodance'), 'Bio-Collagen', '1 unidade',
  'Máscara de hidrogel com colágeno para um momento de hidratação intensiva e aparência luminosa.',
  'A Bio-Collagen Real Deep Mask é uma máscara de hidrogel que se adapta aos contornos do rosto e permanece sobre a pele por um período prolongado. É uma escolha para os dias em que a pele pede um cuidado extra de hidratação. Apresentação individual; outras apresentações serão cadastradas como variantes somente após confirmação.',
  array['Hidratação intensiva', 'Contribui para uma aparência luminosa', 'Hidrogel que se adapta ao rosto'],
  array['Colágeno'],
  'Após a limpeza e o tônico, retire as películas protetoras e aplique a máscara sobre o rosto. Deixe agir pelo tempo indicado na embalagem, retire e massageie o excesso até absorver.',
  'Uso externo. Não aplique sobre pele irritada ou lesionada. Produto de uso único. Suspenda o uso em caso de irritação.',
  array['todos'], array['colágeno', 'collagen', 'máscara', 'hidrogel', 'sheet mask', 'hidratação', 'glow'],
  'draft', 'coming_soon', false, true, 14,
  'Biodance Bio-Collagen Real Deep Mask', 'Máscara de hidrogel Biodance com colágeno para hidratação intensiva.'
),
(
  'mediheal-madecassoside-blemish-pad', 'Mediheal Madecassoside Blemish Pad', (select id from b where slug = 'mediheal'), 'Madecassoside', '100 discos',
  'Discos tonificantes com madecassosídeo, para um cuidado calmante e com foco na textura da pele.',
  'Os Madecassoside Blemish Pads reúnem a praticidade dos discos com o madecassosídeo, ativo derivado da Centella asiatica. Usados após a limpeza, preparam a pele e trazem sensação de conforto, contribuindo para uma textura com aparência mais uniforme.',
  array['Cuidado calmante', 'Contribui para uma textura mais uniforme', 'Formato prático em discos'],
  array['Madecassosídeo'],
  'Após a limpeza, passe um disco suavemente pelo rosto, evitando a área dos olhos. Siga com os demais passos da rotina.',
  'Uso externo. Evite o contato com os olhos. Mantenha a embalagem bem fechada. Suspenda o uso em caso de irritação.',
  array['todos'], array['madecassoside', 'madecassosídeo', 'centella', 'pads', 'discos', 'calmante', 'textura'],
  'draft', 'coming_soon', false, true, 15,
  'Mediheal Madecassoside Blemish Pad — 100 discos', 'Discos tonificantes Mediheal com madecassosídeo para cuidado calmante e textura da pele.'
),
(
  'torriden-dive-in-low-molecular-hyaluronic-acid-serum', 'Torriden DIVE-IN Low Molecular Hyaluronic Acid Serum', (select id from b where slug = 'torriden'), 'DIVE-IN', '50 ml',
  'Sérum hidratante com ácido hialurônico de baixo peso molecular, de textura leve.',
  'O sérum DIVE-IN é o produto mais conhecido da Torriden. Sua fórmula com ácido hialurônico de baixo peso molecular oferece hidratação em uma textura aquosa e leve, que se encaixa em rotinas de manhã e à noite e combina bem com outros tratamentos.',
  array['Hidratação leve', 'Textura aquosa de rápida absorção', 'Combina com diferentes rotinas'],
  array['Ácido hialurônico de baixo peso molecular'],
  'Após o tônico, aplique algumas gotas sobre o rosto e espalhe com leves batidinhas até absorver. Siga com o hidratante.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos'], array['ácido hialurônico', 'acido hialuronico', 'hyaluronic acid', 'sérum', 'serum', 'hidratação', 'dive-in'],
  'draft', 'coming_soon', false, true, 16,
  'Torriden DIVE-IN Low Molecular Hyaluronic Acid Serum 50 ml', 'Sérum Torriden DIVE-IN com ácido hialurônico de baixo peso molecular para hidratação.'
),
(
  'anua-heartleaf-77-soothing-toner', 'Anua Heartleaf 77% Soothing Toner', (select id from b where slug = 'anua'), 'Heartleaf', '250 ml',
  'Tônico com extrato de heartleaf, para hidratar e trazer conforto à pele logo após a limpeza.',
  'O Heartleaf 77% Soothing Toner tem como protagonista o heartleaf (Houttuynia cordata), planta muito presente no skincare coreano. De textura leve e fluida, hidrata e prepara a pele para as próximas etapas, com sensação de frescor e conforto.',
  array['Hidratação após a limpeza', 'Sensação de conforto e frescor', 'Prepara a pele para os próximos passos'],
  array['Extrato de heartleaf (Houttuynia cordata)'],
  'Após a limpeza, aplique com as mãos ou com um algodão, espalhando suavemente pelo rosto. Siga com sérum e hidratante.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos', 'sensivel'], array['heartleaf', 'houttuynia', 'tônico', 'toner', 'calmante', 'hidratação', 'pele sensível'],
  'draft', 'coming_soon', false, true, 17,
  'Anua Heartleaf 77% Soothing Toner 250 ml', 'Tônico Anua com heartleaf para hidratar e trazer conforto à pele.'
),
(
  'aestura-atobarrier365-cream', 'Aestura Atobarrier365 Cream', (select id from b where slug = 'aestura'), 'Atobarrier365', '80 ml',
  'Creme hidratante com ceramidas, voltado ao cuidado com a barreira cutânea e à hidratação intensa.',
  'O Atobarrier365 Cream é um dos cremes de barreira mais procurados da Aestura. Com ceramidas em sua fórmula, oferece hidratação intensa e sensação de conforto prolongado, sendo uma escolha para peles secas e para os dias em que a pele pede mais cuidado.',
  array['Hidratação intensa', 'Cuidado com a barreira cutânea', 'Conforto prolongado'],
  array['Ceramidas'],
  'Como última etapa da rotina, aplique uma quantidade adequada sobre o rosto e espalhe suavemente até a absorção. Pode ser usado de manhã e à noite.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos', 'seca', 'sensivel'], array['ceramida', 'ceramide', 'barreira', 'barreira cutânea', 'hidratante', 'creme', 'pele seca'],
  'draft', 'coming_soon', false, true, 18,
  'Aestura Atobarrier365 Cream 80 ml', 'Creme hidratante Aestura Atobarrier365 com ceramidas para a barreira cutânea.'
),
(
  'beauty-of-joseon-glow-serum-propolis-niacinamide', 'Beauty of Joseon Glow Serum: Propolis + Niacinamide', (select id from b where slug = 'beauty-of-joseon'), 'Glow', '30 ml',
  'Sérum com própolis e niacinamida, para uma pele com aparência luminosa, hidratada e uniforme.',
  'O Glow Serum combina própolis e niacinamida em uma textura levemente viscosa, que se espalha com facilidade e deixa a pele com aspecto saudável e luminoso. Uma escolha versátil para a etapa de tratamento, de manhã ou à noite.',
  array['Contribui para uma aparência luminosa', 'Hidratação', 'Ajuda a uniformizar a aparência do tom'],
  array['Extrato de própolis', 'Niacinamida'],
  'Após o tônico, aplique algumas gotas sobre o rosto e espalhe suavemente até absorver. Siga com o hidratante e, pela manhã, com protetor solar.',
  'Uso externo. Contém derivado de própolis: pessoas com sensibilidade a produtos apícolas devem fazer um teste antes do uso. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos'], array['própolis', 'propolis', 'niacinamida', 'niacinamide', 'glow', 'luminosidade', 'sérum', 'serum'],
  'draft', 'coming_soon', false, true, 19,
  'Beauty of Joseon Glow Serum: Propolis + Niacinamide 30 ml', 'Sérum Beauty of Joseon com própolis e niacinamida para luminosidade e hidratação.'
),
(
  'cosrx-advanced-snail-96-mucin-power-essence', 'COSRX Advanced Snail 96 Mucin Power Essence', (select id from b where slug = 'cosrx'), 'Advanced Snail', '100 ml',
  'Essência com mucina de caracol, para hidratação e cuidado com a textura da pele.',
  'Um clássico do skincare coreano, a Advanced Snail 96 Mucin Power Essence tem como base o filtrado de secreção de caracol. Sua textura fluida e levemente elástica hidrata e deixa a pele com toque macio, contribuindo para uma textura com aparência mais uniforme.',
  array['Hidratação', 'Toque macio', 'Cuidado com a textura da pele'],
  array['Filtrado de secreção de caracol (snail mucin)'],
  'Após o tônico, aplique uma pequena quantidade sobre o rosto e espalhe com leves batidinhas até absorver. Siga com o hidratante.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos'], array['snail', 'mucina', 'mucin', 'caracol', 'essência', 'essence', 'hidratação', 'textura'],
  'draft', 'coming_soon', false, true, 20,
  'COSRX Advanced Snail 96 Mucin Power Essence 100 ml', 'Essência COSRX com mucina de caracol para hidratação e textura da pele.'
),
(
  'round-lab-1025-dokdo-toner', 'Round Lab 1025 Dokdo Toner', (select id from b where slug = 'round-lab'), '1025 Dokdo', '200 ml',
  'Tônico da linha 1025 Dokdo, para hidratar e manter a pele com aparência saudável.',
  'O 1025 Dokdo Toner é inspirado na água do mar profunda da ilha de Ulleungdo, na Coreia. Sua textura leve hidrata e prepara a pele após a limpeza, sendo uma opção suave para o uso diário.',
  array['Hidratação após a limpeza', 'Textura leve para o uso diário', 'Prepara a pele para os próximos passos'],
  array['Água do mar profunda de Ulleungdo'],
  'Após a limpeza, aplique com as mãos ou com um algodão sobre o rosto. Siga com sérum e hidratante.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos'], array['dokdo', 'tônico', 'toner', 'hidratação', 'água do mar'],
  'draft', 'coming_soon', false, true, 21,
  'Round Lab 1025 Dokdo Toner 200 ml', 'Tônico Round Lab 1025 Dokdo para hidratação diária.'
)
on conflict (slug) do nothing;

-- 22–29: names only. Technical copy, volumes and variants stay empty until the
-- exact presentation is confirmed in the manufacturer's official catalogue.
with b as (select id, slug from public.brands), items(slug, name, brand, sort_order) as (values
  ('dr-althea-147-barrier-cream', 'Dr. Althea 147 Barrier Cream', 'dr-althea', 22),
  ('tirtir-milk-skin-toner', 'TIRTIR Milk Skin Toner', 'tirtir', 23),
  ('laneige-lip-sleeping-mask', 'Laneige Lip Sleeping Mask', 'laneige', 24),
  ('medicube-pdrn-pink-collagen-gel-mask', 'Medicube PDRN Pink Collagen Gel Mask', 'medicube', 25),
  ('banila-co-clean-it-zero-cleansing-balm', 'Banila Co Clean It Zero Cleansing Balm', 'banila-co', 26),
  ('medicube-pdrn-pink-collagen-balm', 'Medicube PDRN Pink Collagen Balm', 'medicube', 27),
  ('medicube-zero-pore-one-day-serum', 'Medicube Zero Pore One Day Serum', 'medicube', 28),
  ('medicube-egf-nad-serum', 'Medicube EGF NAD+ Serum', 'medicube', 29)
)
insert into public.products (slug, name, brand_id, status, availability, track_inventory, media_pending, sort_order, seo_title)
select i.slug, i.name, b.id, 'draft', 'coming_soon', false, true, i.sort_order, i.name
  from items i join b on b.slug = i.brand
on conflict (slug) do nothing;

-- Private records for the new products (internal sourcing status + notes)
insert into public.product_private (product_id, sourcing_status, content_verified, internal_notes)
select p.id,
       case when p.sort_order between 10 and 21 then 'planned'::public.sourcing_status else 'evaluating'::public.sourcing_status end,
       false,
       case p.slug
         when 'biodance-bio-collagen-real-deep-mask' then 'Prioridade de aquisição. Cadastrada a apresentação individual; kits/caixas só como variantes após confirmação. Conferir nome, volume e ativos no catálogo oficial antes de publicar.'
         when 'laneige-lip-sleeping-mask' then 'Em avaliação. Existem várias versões/sabores e tamanhos: definir a versão exata antes de preencher dados técnicos e publicar.'
         when 'tirtir-milk-skin-toner' then 'Em avaliação. Confirmar o tamanho (há mais de uma apresentação) e a versão exata antes de preencher dados técnicos.'
         when 'medicube-pdrn-pink-collagen-gel-mask' then 'Em avaliação. Confirmar formato e apresentação oficial antes de preencher dados técnicos.'
         when 'medicube-pdrn-pink-collagen-balm' then 'Em avaliação. Confirmar formato (bálsamo/stick) e apresentação oficial antes de preencher dados técnicos.'
         else case when p.sort_order between 10 and 21
           then 'Prioridade de aquisição. Conferir nome oficial, volume e ativos na embalagem/catálogo do fabricante, cadastrar fotos autorizadas e verificar documentação antes de liberar a venda.'
           else 'Em avaliação, sem compra confirmada. Confirmar nome, versão e apresentação no catálogo oficial antes de preencher dados técnicos.' end
       end
  from public.products p
 where p.slug in (
   'medicube-collagen-jelly-cream', 'medicube-collagen-night-wrapping-mask', 'skin1004-madagascar-centella-light-cleansing-oil',
   'skin1004-madagascar-centella-ampoule-foam', 'biodance-bio-collagen-real-deep-mask', 'mediheal-madecassoside-blemish-pad',
   'torriden-dive-in-low-molecular-hyaluronic-acid-serum', 'anua-heartleaf-77-soothing-toner', 'aestura-atobarrier365-cream',
   'beauty-of-joseon-glow-serum-propolis-niacinamide', 'cosrx-advanced-snail-96-mucin-power-essence', 'round-lab-1025-dokdo-toner',
   'dr-althea-147-barrier-cream', 'tirtir-milk-skin-toner', 'laneige-lip-sleeping-mask', 'medicube-pdrn-pink-collagen-gel-mask',
   'banila-co-clean-it-zero-cleansing-balm', 'medicube-pdrn-pink-collagen-balm', 'medicube-zero-pore-one-day-serum', 'medicube-egf-nad-serum')
on conflict (product_id) do nothing;

-- ---------------------------------------------------------------------------
-- Category links for all 29 (leaf types + needs). Existing links are kept.
-- ---------------------------------------------------------------------------
with links(product_slug, category_slug) as (values
  ('medicube-pdrn-pink-peptide-serum', 'seruns-hidratantes'), ('medicube-pdrn-pink-peptide-serum', 'seruns-antissinais'),
  ('medicube-zero-pore-pad', 'discos-tonificantes'), ('medicube-zero-pore-pad', 'discos-esfoliantes'), ('medicube-zero-pore-pad', 'cuidados-para-poros'),
  ('medicube-deep-vita-c-pad', 'discos-tonificantes'), ('medicube-deep-vita-c-pad', 'cuidados-para-manchas'),
  ('celimax-the-vita-a-retinal-shot', 'seruns-antissinais'),
  ('celimax-pore-dark-spot-brightening-cream', 'cuidados-para-manchas'), ('celimax-pore-dark-spot-brightening-cream', 'cuidados-para-poros'),
  ('dr-althea-345-relief-cream', 'cremes-faciais'),
  ('skin1004-madagascar-centella-ampoule', 'ampolas-calmantes'), ('skin1004-madagascar-centella-ampoule', 'seruns-hidratantes'),
  ('skin1004-madagascar-centella-tone-brightening-capsule-ampoule', 'seruns-iluminadores'),
  ('medicube-collagen-jelly-cream', 'cremes-faciais'), ('medicube-collagen-jelly-cream', 'hidratantes-em-gel'),
  ('medicube-collagen-jelly-cream', 'hidratacao'), ('medicube-collagen-jelly-cream', 'luminosidade'),
  ('medicube-collagen-night-wrapping-mask', 'mascaras-noturnas'), ('medicube-collagen-night-wrapping-mask', 'hidratacao'),
  ('skin1004-madagascar-centella-light-cleansing-oil', 'oleos-de-limpeza'), ('skin1004-madagascar-centella-light-cleansing-oil', 'limpeza-facial'),
  ('skin1004-madagascar-centella-ampoule-foam', 'espumas-de-limpeza'), ('skin1004-madagascar-centella-ampoule-foam', 'limpeza-facial'),
  ('biodance-bio-collagen-real-deep-mask', 'mascaras-de-hidrogel'), ('biodance-bio-collagen-real-deep-mask', 'mascaras-hidratantes'),
  ('biodance-bio-collagen-real-deep-mask', 'hidratacao'), ('biodance-bio-collagen-real-deep-mask', 'luminosidade'),
  ('mediheal-madecassoside-blemish-pad', 'discos-tonificantes'), ('mediheal-madecassoside-blemish-pad', 'pele-sensivel'), ('mediheal-madecassoside-blemish-pad', 'poros-e-oleosidade'),
  ('torriden-dive-in-low-molecular-hyaluronic-acid-serum', 'seruns-hidratantes'), ('torriden-dive-in-low-molecular-hyaluronic-acid-serum', 'hidratacao'),
  ('anua-heartleaf-77-soothing-toner', 'tonicos-hidratantes'), ('anua-heartleaf-77-soothing-toner', 'hidratacao'), ('anua-heartleaf-77-soothing-toner', 'pele-sensivel'),
  ('aestura-atobarrier365-cream', 'hidratantes-e-cremes-reparadores'), ('aestura-atobarrier365-cream', 'cremes-faciais'),
  ('aestura-atobarrier365-cream', 'hidratacao'), ('aestura-atobarrier365-cream', 'pele-sensivel'),
  ('beauty-of-joseon-glow-serum-propolis-niacinamide', 'seruns-iluminadores'), ('beauty-of-joseon-glow-serum-propolis-niacinamide', 'seruns-hidratantes'),
  ('beauty-of-joseon-glow-serum-propolis-niacinamide', 'luminosidade'), ('beauty-of-joseon-glow-serum-propolis-niacinamide', 'hidratacao'),
  ('cosrx-advanced-snail-96-mucin-power-essence', 'seruns-hidratantes'), ('cosrx-advanced-snail-96-mucin-power-essence', 'hidratacao'),
  ('round-lab-1025-dokdo-toner', 'tonicos-hidratantes'), ('round-lab-1025-dokdo-toner', 'hidratacao'),
  ('dr-althea-147-barrier-cream', 'hidratantes-e-cremes-reparadores'),
  ('tirtir-milk-skin-toner', 'tonicos-hidratantes'),
  ('laneige-lip-sleeping-mask', 'cuidados-labiais'),
  ('medicube-pdrn-pink-collagen-gel-mask', 'mascaras'),
  ('banila-co-clean-it-zero-cleansing-balm', 'balsamos-de-limpeza'),
  ('medicube-pdrn-pink-collagen-balm', 'hidratantes'),
  ('medicube-zero-pore-one-day-serum', 'seruns-e-ampolas'), ('medicube-zero-pore-one-day-serum', 'cuidados-para-poros'),
  ('medicube-egf-nad-serum', 'seruns-e-ampolas')
)
insert into public.product_categories (product_id, category_id)
select p.id, c.id from links l
  join public.products p on p.slug = l.product_slug
  join public.categories c on c.slug = l.category_slug
on conflict do nothing;

-- Products formerly under "Discos faciais" now live in "Tônicos e discos"
delete from public.product_categories
 where category_id = (select id from public.categories where slug = 'discos-faciais');

-- ---------------------------------------------------------------------------
-- Suggestions that became catalogue records
-- ---------------------------------------------------------------------------
update public.product_suggestions s
   set product_id = p.id,
       status = case when p.slug in ('medicube-collagen-jelly-cream', 'anua-heartleaf-77-soothing-toner') then 'approved'::public.suggestion_status else 'evaluating'::public.suggestion_status end
  from public.products p
 where s.product_id is null
   and p.slug = case s.name
     when 'Medicube Collagen Jelly Cream' then 'medicube-collagen-jelly-cream'
     when 'Medicube PDRN Pink Collagen Balm' then 'medicube-pdrn-pink-collagen-balm'
     when 'Medicube Zero Pore One Day Serum' then 'medicube-zero-pore-one-day-serum'
     when 'Medicube EGF NAD+ Serum' then 'medicube-egf-nad-serum'
     when 'Anua Heartleaf 77 Soothing Toner' then 'anua-heartleaf-77-soothing-toner'
   end;
