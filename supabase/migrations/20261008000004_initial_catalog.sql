-- MIVORA — initial catalogue and store content
-- Prices and stock quantities are intentionally NULL until the owner provides
-- them. Technical content comes from the packaging visible in the product
-- photos and must be reviewed in the admin (product_private.content_verified).

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
insert into public.brands (slug, name, tagline, description, origin_country, sort_order) values
  ('medicube', 'Medicube', 'Skincare coreano orientado a resultados visíveis',
   'Marca sul-coreana de skincare conhecida por linhas dedicadas a poros, luminosidade e firmeza, como Zero Pore, Deep Vita C e PDRN Pink.', 'Coreia do Sul', 1),
  ('skin1004', 'SKIN1004', 'Centella asiatica de Madagascar',
   'Marca sul-coreana reconhecida pela linha Madagascar Centella, com fórmulas leves desenvolvidas a partir da Centella asiatica de Madagascar.', 'Coreia do Sul', 2),
  ('celimax', 'Celimax', 'Ativos em concentrações declaradas',
   'Marca sul-coreana de skincare com fórmulas que destacam seus ativos e concentrações, como retinal, niacinamida e ácido tranexâmico.', 'Coreia do Sul', 3),
  ('dr-althea', 'Dr. Althea', 'Pro Lab — fórmulas de inspiração dermatológica',
   'Marca sul-coreana com linha Pro Lab de cuidados hidratantes e calmantes para todos os tipos de pele.', 'Coreia do Sul', 4),
  ('numbuzin', 'Numbuzin', 'Skincare numerado por necessidade',
   'Marca sul-coreana que organiza seus produtos por números, cada um dedicado a uma necessidade de cuidado.', 'Coreia do Sul', 5)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Categories: product types and cosmetic needs
-- ---------------------------------------------------------------------------
insert into public.categories (slug, name, kind, description, sort_order, is_featured) values
  ('seruns-e-ampolas', 'Séruns e ampolas', 'product_type', 'Fórmulas concentradas para a etapa de tratamento da rotina.', 1, true),
  ('discos-faciais', 'Discos faciais', 'product_type', 'Discos tonificantes e de tratamento para preparar e cuidar da pele.', 2, true),
  ('tratamentos-com-retinoides', 'Tratamentos com retinoides', 'product_type', 'Cuidados antissinais com retinal ou retinol, para uso gradual e com proteção solar.', 3, false),
  ('cremes-faciais', 'Cremes faciais', 'product_type', 'Cremes de tratamento para o rosto.', 4, true),
  ('hidratantes-e-cremes-reparadores', 'Hidratantes e cremes reparadores', 'product_type', 'Hidratação, conforto e cuidado com a barreira cutânea.', 5, true),
  ('cuidados-com-os-olhos', 'Cuidados com os olhos', 'product_type', 'Fórmulas dedicadas à delicada região dos olhos.', 6, false),
  ('hidratacao', 'Hidratação', 'concern', 'Para uma pele confortável e com aparência saudável.', 1, true),
  ('luminosidade', 'Luminosidade', 'concern', 'Para uma pele com aparência mais radiante.', 2, true),
  ('aparencia-de-manchas', 'Aparência de manchas', 'concern', 'Para cuidar da aparência de manchas e do tom irregular.', 3, true),
  ('poros-e-oleosidade', 'Poros e oleosidade', 'concern', 'Para cuidar da aparência dos poros, da textura e do brilho excessivo.', 4, true),
  ('firmeza-e-linhas-finas', 'Firmeza e linhas finas', 'concern', 'Para cuidar da aparência de linhas finas e da firmeza.', 5, true),
  ('pele-sensivel', 'Pele sensível', 'concern', 'Fórmulas de cuidado suave e calmante.', 6, true),
  ('limpeza-facial', 'Limpeza facial', 'concern', 'O primeiro passo de qualquer ritual.', 7, true),
  ('area-dos-olhos', 'Cuidados com a área dos olhos', 'concern', 'Hidratação e cuidado para o contorno dos olhos.', 8, true)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Products (all published, price NULL, stock not tracked numerically)
-- ---------------------------------------------------------------------------
with b as (select id, slug from public.brands)
insert into public.products (
  slug, name, brand_id, product_line, volume, short_description, description,
  benefits, key_ingredients, how_to_use, warnings, skin_types, tags,
  status, availability, track_inventory, is_featured, featured_order, media_pending, sort_order,
  seo_title, seo_description
) values
(
  'medicube-pdrn-pink-peptide-serum', 'Medicube PDRN Pink Peptide Sérum Facial',
  (select id from b where slug = 'medicube'), 'PDRN Pink', null,
  'Sérum facial da linha PDRN Pink com PDRN e peptídeos, pensado para uma rotina de hidratação, luminosidade e aparência de elasticidade.',
  'O PDRN Pink Peptide Sérum integra a linha PDRN Pink da Medicube. Sua textura leve se espalha com facilidade e se encaixa na etapa de tratamento da rotina, logo após o tônico. É uma escolha para quem busca uma pele com aparência hidratada, luminosa e com mais viço.',
  array['Ajuda a manter a pele hidratada', 'Contribui para uma aparência mais luminosa', 'Cuida da aparência da elasticidade da pele'],
  array['PDRN (Sodium DNA)', 'Peptídeos'],
  'Após a limpeza e o tônico, aplique algumas gotas sobre o rosto e espalhe suavemente até a completa absorção. Siga com o hidratante. Pela manhã, finalize com protetor solar.',
  'Uso externo. Evite o contato com os olhos. Faça um teste de sensibilidade antes do primeiro uso e suspenda em caso de irritação. Mantenha fora do alcance de crianças.',
  array['todos'], array['pdrn', 'peptídeos', 'peptide', 'sérum', 'serum', 'pink', 'elasticidade', 'viço'],
  'published', 'in_stock', false, true, 1, true, 1,
  'Medicube PDRN Pink Peptide Sérum Facial', 'Sérum facial Medicube da linha PDRN Pink, com PDRN e peptídeos para hidratação, luminosidade e aparência de elasticidade.'
),
(
  'medicube-zero-pore-pad', 'Discos Tonificantes Medicube Zero Pore Pad',
  (select id from b where slug = 'medicube'), 'Zero Pore', null,
  'Discos tonificantes de dupla face para a rotina de cuidado com os poros, com esfoliação suave e foco na textura da pele.',
  'Os discos Zero Pore Pad unem as etapas de tônico e esfoliação suave em um gesto prático. A face texturizada ajuda na remoção de impurezas e células superficiais, enquanto a face lisa finaliza a aplicação. Indicados para quem deseja cuidar da aparência dos poros e de uma textura mais uniforme.',
  array['Cuidado com a aparência dos poros', 'Esfoliação suave para uma textura mais uniforme', 'Sensação de pele limpa e renovada'],
  array['AHA (ácido lático)', 'BHA (ácido salicílico)'],
  'Após a limpeza, passe a face texturizada do disco pelo rosto, de dentro para fora, evitando a área dos olhos e os lábios. Use a face lisa para finalizar e siga com os demais passos da rotina.',
  'Contém ácidos esfoliantes: use protetor solar diariamente. Evite a área dos olhos e não aplique sobre pele irritada ou lesionada. Evite combinar com outros esfoliantes ou retinoides na mesma aplicação. Suspenda em caso de irritação.',
  array['oleosa', 'mista', 'normal'], array['poros', 'esfoliação', 'esfoliante', 'aha', 'bha', 'pads', 'discos', 'tônico', 'toner', 'textura', 'oleosidade'],
  'published', 'in_stock', false, false, 0, true, 2,
  'Discos Tonificantes Medicube Zero Pore Pad', 'Discos tonificantes Medicube Zero Pore Pad para cuidado com os poros, esfoliação suave e textura da pele.'
),
(
  'medicube-deep-vita-c-pad', 'Medicube Deep Vita C Pad — Discos de Vitamina C',
  (select id from b where slug = 'medicube'), 'Deep Vita C', '150 g · 70 discos',
  'Discos de tratamento com derivado de vitamina C e niacinamida 2%, para uma rotina focada em luminosidade e aparência uniforme do tom.',
  'Os Deep Vita C Pads combinam água vitaminada, derivado de vitamina C e niacinamida 2% em discos práticos para o dia a dia. Podem ser usados como etapa de tônico ou deixados por alguns minutos sobre a pele, como uma máscara rápida, para uma aparência mais luminosa e um tom mais uniforme.',
  array['Contribui para uma pele com aparência mais luminosa', 'Ajuda a uniformizar a aparência do tom', 'Formato prático em discos'],
  array['Água vitaminada (Vitamin Water)', 'Derivado de vitamina C', 'Niacinamida 2%'],
  'Após a limpeza, passe o disco suavemente por todo o rosto. Se desejar, deixe-o por alguns minutos sobre áreas específicas. Siga com o restante da rotina e use protetor solar durante o dia.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação. Mantenha o pote bem fechado após o uso.',
  array['todos'], array['vitamina c', 'vitamin c', 'vita c', 'niacinamida', 'niacinamide', 'luminosidade', 'pads', 'discos', 'tom uniforme', 'glow'],
  'published', 'in_stock', false, true, 2, false, 3,
  'Medicube Deep Vita C Pad — Discos de Vitamina C', 'Discos Medicube Deep Vita C com derivado de vitamina C e niacinamida 2% para luminosidade e aparência uniforme do tom. 70 discos.'
),
(
  'celimax-the-vita-a-retinal-shot', 'Celimax Retinal 0,1% — The Vita A Retinal Shot',
  (select id from b where slug = 'celimax'), 'The Vita-A', null,
  'Tratamento facial com retinal 0,1% para um cuidado antissinais voltado à textura da pele e à aparência de linhas finas.',
  'O The Vita A Retinal Shot traz retinal (retinaldeído) a 0,1% em uma fórmula para a rotina noturna. O retinal é um derivado da vitamina A muito utilizado em cuidados antissinais. Por ser um ativo potente, deve ser introduzido aos poucos, respeitando a tolerância da pele e sempre acompanhado de proteção solar diária.',
  array['Cuidado com a textura da pele', 'Ajuda a suavizar a aparência de linhas finas', 'Integra uma rotina antissinais noturna'],
  array['Retinal (retinaldeído) 0,1%'],
  'Use somente à noite, após a limpeza. Aplique uma pequena quantidade sobre a pele seca, evitando o contorno dos olhos, os cantos do nariz e os lábios. Comece 2 a 3 vezes por semana e aumente a frequência gradualmente, conforme a tolerância da sua pele. Siga com um hidratante.',
  'Retinoides podem causar sensibilidade, vermelhidão, ressecamento ou descamação, principalmente nas primeiras semanas. Use protetor solar diariamente durante o uso e evite exposição solar intensa. Não combine com outros retinoides ou esfoliantes ácidos na mesma noite. Não aplique sobre pele irritada ou lesionada. Gestantes, lactantes e pessoas em tratamento dermatológico devem consultar um profissional de saúde antes do uso. Suspenda em caso de irritação persistente e siga as orientações da embalagem.',
  array['normal', 'mista', 'oleosa'], array['retinal', 'retinol', 'retinoide', 'vitamina a', 'antissinais', 'linhas finas', 'textura', 'booster'],
  'published', 'in_stock', false, false, 0, true, 4,
  'Celimax Retinal 0,1% — The Vita A Retinal Shot', 'Tratamento facial Celimax com retinal 0,1% para cuidado antissinais, textura da pele e aparência de linhas finas.'
),
(
  'numbuzin-no9-volumetox-eye-cream', 'Numbuzin No.9 Creme Volumetox para Olhos com Retinol e NAD+',
  (select id from b where slug = 'numbuzin'), 'No.9', null,
  'Cuidado para a área dos olhos com retinol e NAD+, voltado à hidratação e à aparência de linhas finas e de firmeza.',
  'Da linha No.9 da Numbuzin, este cuidado para a região dos olhos combina retinol e NAD+. O aplicador facilita a dosagem de pequenas quantidades, ideal para a pele delicada do contorno dos olhos. Indicado para quem deseja hidratar e cuidar da aparência de linhas finas e da firmeza dessa região.',
  array['Hidratação para a região dos olhos', 'Cuida da aparência de linhas finas', 'Contribui para a aparência de firmeza'],
  array['Retinol', 'NAD+'],
  'À noite, aplique uma pequena quantidade ao redor dos olhos com o dedo anelar, com toques leves, sem atingir a pálpebra móvel e a linha dos cílios. Introduza gradualmente na rotina.',
  'Contém retinol: use protetor solar durante o dia. Evite o contato direto com os olhos; em caso de contato, enxágue com água em abundância. Suspenda o uso em caso de irritação. Gestantes e lactantes devem consultar um profissional de saúde antes do uso.',
  array['todos'], array['olhos', 'área dos olhos', 'contorno dos olhos', 'eye cream', 'retinol', 'nad+', 'nad', 'firmeza', 'linhas finas', 'volumetox'],
  'published', 'in_stock', false, false, 0, false, 5,
  'Numbuzin No.9 Creme Volumetox para Olhos com Retinol e NAD+', 'Cuidado Numbuzin No.9 para a área dos olhos com retinol e NAD+, para hidratação, linhas finas e firmeza.'
),
(
  'celimax-pore-dark-spot-brightening-cream', 'Celimax PORE+DARK Spot Brightening Cream',
  (select id from b where slug = 'celimax'), 'Pore + Dark Spot', null,
  'Creme iluminador com niacinamida 5% e ácido tranexâmico 3%, para uma rotina focada na aparência de manchas, luminosidade e tom mais uniforme.',
  'O PORE+DARK Spot Brightening Cream reúne niacinamida 5%, ácido tranexâmico 3%, Melazero V2 1% e Centella asiatica (10.000 ppm), conforme indicado na embalagem. A textura cremosa se espalha com facilidade e pode ser usada no rosto todo ou em áreas específicas, como parte de uma rotina dedicada a um tom com aparência mais uniforme.',
  array['Cuida da aparência de manchas', 'Contribui para uma pele mais luminosa', 'Ajuda a uniformizar a aparência do tom', 'Cuidado com a aparência dos poros'],
  array['Niacinamida 5%', 'Ácido tranexâmico 3%', 'Melazero V2 1%', 'Centella asiatica 10.000 ppm'],
  'Após o sérum, aplique uma camada fina sobre o rosto ou nas áreas desejadas e massageie até absorver. Pela manhã, finalize com protetor solar.',
  'Uso externo. Evite o contato com os olhos. Faça um teste de sensibilidade antes do primeiro uso e suspenda em caso de irritação.',
  array['todos'], array['manchas', 'niacinamida', 'niacinamide', 'ácido tranexâmico', 'tranexamic acid', 'txa', 'luminosidade', 'poros', 'centella', 'tom uniforme', 'clareador'],
  'published', 'in_stock', false, true, 3, false, 6,
  'Celimax PORE+DARK Spot Brightening Cream', 'Creme Celimax com niacinamida 5% e ácido tranexâmico 3% para aparência de manchas, luminosidade e tom uniforme.'
),
(
  'dr-althea-345-relief-cream', 'Dr. Althea 345 Relief Cream',
  (select id from b where slug = 'dr-althea'), 'Pro Lab', '50 ml',
  'Creme hidratante e calmante para todos os tipos de pele, com ceramida NP, pantenol, niacinamida e madecassosídeo, voltado ao conforto e à barreira cutânea.',
  'O 345 Relief Cream, da linha Pro Lab da Dr. Althea, é um creme de textura confortável para hidratar e acalmar a pele. Sua fórmula reúne ceramida NP, pantenol, niacinamida, madecassosídeo e água de folha de melaleuca (tea tree), ingredientes destacados na embalagem, em um cuidado pensado para fortalecer a sensação de conforto da pele no dia a dia.',
  array['Hidratação e conforto prolongado', 'Cuidado com a barreira cutânea', 'Sensação calmante para a pele'],
  array['Ceramida NP', 'Pantenol', 'Niacinamida', 'Madecassosídeo', 'Água de folha de melaleuca (tea tree)'],
  'Como última etapa da rotina, aplique uma quantidade adequada sobre o rosto e espalhe com movimentos suaves até a absorção. Pode ser usado de manhã e à noite.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos', 'sensivel'], array['barreira', 'barreira cutânea', 'ceramida', 'ceramide', 'pantenol', 'calmante', 'hidratante', 'pele sensível', 'creme', 'relief', 'tea tree'],
  'published', 'in_stock', false, true, 4, false, 7,
  'Dr. Althea 345 Relief Cream', 'Creme hidratante e calmante Dr. Althea 345 Relief Cream com ceramida, pantenol e niacinamida. 50 ml.'
),
(
  'skin1004-madagascar-centella-ampoule', 'SKIN1004 Madagascar Centella Ampoule',
  (select id from b where slug = 'skin1004'), 'Madagascar Centella', '100 ml',
  'Ampoule leve feita com Centella asiatica de Madagascar, para hidratar e trazer conforto à pele com um cuidado calmante.',
  'Ícone da SKIN1004, a Madagascar Centella Ampoule é feita com Centella asiatica de Madagascar. Sua textura fluida e leve é absorvida rapidamente, sendo uma opção versátil para a etapa de tratamento de quem busca hidratação e uma sensação calmante, inclusive em peles sensíveis.',
  array['Hidratação leve', 'Sensação calmante e de conforto', 'Textura fluida de rápida absorção'],
  array['Extrato de Centella asiatica de Madagascar'],
  'Após a limpeza e o tônico, aplique algumas gotas sobre o rosto e espalhe com leves batidinhas até absorver. Siga com o hidratante.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos', 'sensivel'], array['centella', 'cica', 'calmante', 'hidratação', 'ampola', 'ampoule', 'sérum', 'pele sensível', 'madagascar'],
  'published', 'in_stock', false, true, 5, false, 8,
  'SKIN1004 Madagascar Centella Ampoule', 'Ampoule SKIN1004 com Centella asiatica de Madagascar para hidratação, conforto e cuidado calmante. 100 ml.'
),
(
  'skin1004-madagascar-centella-tone-brightening-capsule-ampoule', 'SKIN1004 Madagascar Centella Tone Brightening Capsule Ampoule',
  (select id from b where slug = 'skin1004'), 'Madagascar Centella', '100 ml',
  'Ampoule da linha Madagascar Centella com cápsulas iluminadoras de textura líquida, para uma pele com aparência mais luminosa e uniforme.',
  'A Tone Brightening Capsule Ampoule leva a Centella asiatica de Madagascar a uma rotina focada em luminosidade. As cápsulas iluminadoras de textura líquida se desfazem ao contato com a pele, resultando em uma aplicação leve, para uma aparência mais radiante e um tom mais uniforme.',
  array['Contribui para uma aparência mais luminosa', 'Ajuda a uniformizar a aparência do tom', 'Textura leve com cápsulas líquidas'],
  array['Centella asiatica de Madagascar', 'Cápsulas iluminadoras de textura líquida'],
  'Após a limpeza e o tônico, aplique algumas gotas sobre o rosto e espalhe suavemente até absorver. Siga com o hidratante e, pela manhã, com protetor solar.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos'], array['centella', 'luminosidade', 'tom uniforme', 'ampola', 'ampoule', 'sérum', 'iluminador', 'brightening', 'manchas', 'cápsulas'],
  'published', 'in_stock', false, true, 6, false, 9,
  'SKIN1004 Madagascar Centella Tone Brightening Capsule Ampoule', 'Ampoule iluminadora SKIN1004 com Centella de Madagascar e cápsulas líquidas para luminosidade e tom uniforme. 100 ml.'
)
on conflict (slug) do nothing;

-- Private records (cost/SKU pending) — content flagged for review
insert into public.product_private (product_id, content_verified, internal_notes)
select p.id, false,
  case p.slug
    when 'medicube-pdrn-pink-peptide-serum' then 'Foto oficial pendente. Confirmar volume e lista de ativos com a embalagem.'
    when 'medicube-zero-pore-pad' then 'Foto oficial pendente. Confirmar versão (ex.: 2.0), quantidade de discos e ativos.'
    when 'celimax-the-vita-a-retinal-shot' then 'Foto oficial pendente. Confirmar volume e orientações do fabricante.'
    when 'numbuzin-no9-volumetox-eye-cream' then 'Verificar se a foto enviada corresponde exatamente a este produto: a embalagem mostra "No.9 NAD+ Retinol" em aplicador tipo seringa. Confirmar nome comercial e volume.'
    when 'celimax-pore-dark-spot-brightening-cream' then 'Confirmar volume. Ativos conferidos pela embalagem da foto.'
    else 'Ativos conferidos pela embalagem da foto. Revisar textos.'
  end
from public.products p
on conflict (product_id) do nothing;

-- Category links
with links(product_slug, category_slug) as (values
  ('medicube-pdrn-pink-peptide-serum', 'seruns-e-ampolas'),
  ('medicube-pdrn-pink-peptide-serum', 'hidratacao'),
  ('medicube-pdrn-pink-peptide-serum', 'luminosidade'),
  ('medicube-pdrn-pink-peptide-serum', 'firmeza-e-linhas-finas'),
  ('medicube-zero-pore-pad', 'discos-faciais'),
  ('medicube-zero-pore-pad', 'poros-e-oleosidade'),
  ('medicube-deep-vita-c-pad', 'discos-faciais'),
  ('medicube-deep-vita-c-pad', 'luminosidade'),
  ('medicube-deep-vita-c-pad', 'aparencia-de-manchas'),
  ('celimax-the-vita-a-retinal-shot', 'tratamentos-com-retinoides'),
  ('celimax-the-vita-a-retinal-shot', 'firmeza-e-linhas-finas'),
  ('celimax-the-vita-a-retinal-shot', 'poros-e-oleosidade'),
  ('numbuzin-no9-volumetox-eye-cream', 'cuidados-com-os-olhos'),
  ('numbuzin-no9-volumetox-eye-cream', 'area-dos-olhos'),
  ('numbuzin-no9-volumetox-eye-cream', 'firmeza-e-linhas-finas'),
  ('numbuzin-no9-volumetox-eye-cream', 'hidratacao'),
  ('celimax-pore-dark-spot-brightening-cream', 'cremes-faciais'),
  ('celimax-pore-dark-spot-brightening-cream', 'aparencia-de-manchas'),
  ('celimax-pore-dark-spot-brightening-cream', 'luminosidade'),
  ('celimax-pore-dark-spot-brightening-cream', 'poros-e-oleosidade'),
  ('dr-althea-345-relief-cream', 'hidratantes-e-cremes-reparadores'),
  ('dr-althea-345-relief-cream', 'pele-sensivel'),
  ('dr-althea-345-relief-cream', 'hidratacao'),
  ('skin1004-madagascar-centella-ampoule', 'seruns-e-ampolas'),
  ('skin1004-madagascar-centella-ampoule', 'pele-sensivel'),
  ('skin1004-madagascar-centella-ampoule', 'hidratacao'),
  ('skin1004-madagascar-centella-tone-brightening-capsule-ampoule', 'seruns-e-ampolas'),
  ('skin1004-madagascar-centella-tone-brightening-capsule-ampoule', 'luminosidade'),
  ('skin1004-madagascar-centella-tone-brightening-capsule-ampoule', 'aparencia-de-manchas')
)
insert into public.product_categories (product_id, category_id)
select p.id, c.id from links l
  join public.products p on p.slug = l.product_slug
  join public.categories c on c.slug = l.category_slug
on conflict do nothing;

-- Photos supplied by the owner (served from /public/products). Each file was
-- matched to its product by the text on the packaging.
with imgs(product_slug, url, alt) as (values
  ('medicube-deep-vita-c-pad', '/products/medicube-deep-vita-c-pad.webp', 'Pote Medicube Deep Vita C Pad com 70 discos'),
  ('numbuzin-no9-volumetox-eye-cream', '/products/numbuzin-no9-nad-retinol.webp', 'Numbuzin No.9 com retinol e NAD+ em aplicador lilás'),
  ('celimax-pore-dark-spot-brightening-cream', '/products/celimax-pore-dark-spot-brightening-cream.webp', 'Bisnaga Celimax PORE+DARK Spot Brightening Cream'),
  ('dr-althea-345-relief-cream', '/products/dr-althea-345-relief-cream.webp', 'Bisnaga Dr. Althea 345 Relief Cream 50 ml'),
  ('skin1004-madagascar-centella-ampoule', '/products/skin1004-madagascar-centella-ampoule.webp', 'Frasco conta-gotas SKIN1004 Madagascar Centella Ampoule 100 ml'),
  ('skin1004-madagascar-centella-tone-brightening-capsule-ampoule', '/products/skin1004-madagascar-centella-tone-brightening-capsule-ampoule.webp', 'Frasco conta-gotas SKIN1004 Madagascar Centella Tone Brightening Capsule Ampoule 100 ml')
)
insert into public.product_images (product_id, url, alt, width, height, sort_order, is_primary)
select p.id, i.url, i.alt, 1200, 1200, 0, true
  from imgs i join public.products p on p.slug = i.product_slug
 where not exists (select 1 from public.product_images x where x.product_id = p.id);

-- ---------------------------------------------------------------------------
-- Store settings and home content
-- ---------------------------------------------------------------------------
insert into public.store_settings (
  id, store_name, tagline, delivery_summary, about_headline, about_text,
  whatsapp_section_title, whatsapp_section_text, seo_title, seo_description
) values (
  1, 'MIVORA', 'Boutique de skincare e beleza internacional',
  'Entrega combinada pelo WhatsApp, de acordo com a sua região.',
  'Curadoria com propósito',
  'A MIVORA nasceu para tornar o skincare internacional mais próximo e mais simples de escolher. Selecionamos cada produto com cuidado, priorizando marcas reconhecidas e fórmulas bem estabelecidas, e acompanhamos você de perto em um atendimento personalizado, do primeiro contato à entrega.',
  'Atendimento que entende o seu ritual',
  'Tem dúvidas sobre qual produto escolher ou como combinar etapas da rotina? Fale com a MIVORA pelo WhatsApp e receba uma orientação cosmética personalizada.',
  'MIVORA — Skincare coreano e beleza internacional',
  'Boutique digital de skincare com curadoria de marcas como Medicube, SKIN1004, Celimax, Dr. Althea e Numbuzin. Compre pelo site e finalize pelo WhatsApp.'
) on conflict (id) do nothing;

insert into public.delivery_zones (name, region, method, notes, sort_order)
select 'Entrega a combinar', null, 'to_arrange', 'Valores e prazos confirmados no atendimento pelo WhatsApp.', 0
where not exists (select 1 from public.delivery_zones);

insert into public.banners (placement, eyebrow, title, subtitle, cta_label, cta_href, cta2_label, cta2_href, image_alt, sort_order)
select 'hero', 'Skincare coreano e beleza internacional', 'Sua pele, seu ritual.',
       'Uma curadoria especial de skincare para transformar seus momentos de autocuidado.',
       'Explorar produtos', '/produtos', 'Conhecer a MIVORA', '/sobre',
       'Seleção de produtos de skincare MIVORA', 0
where not exists (select 1 from public.banners where placement = 'hero');

insert into public.ritual_steps (step_number, title, description, category_id, sort_order)
select v.n, v.title, v.descr, (select id from public.categories where slug = v.cat), v.n
  from (values
    (1, 'Limpeza', 'Remova impurezas, oleosidade e resíduos para preparar a pele para os próximos passos.', 'limpeza-facial'),
    (2, 'Preparação', 'Tônicos e discos equilibram e preparam a pele, facilitando a etapa de tratamento.', 'discos-faciais'),
    (3, 'Tratamento', 'Séruns e ampolas concentram ativos para o seu objetivo principal de cuidado.', 'seruns-e-ampolas'),
    (4, 'Área dos olhos', 'Uma fórmula dedicada respeita a delicadeza do contorno dos olhos.', 'cuidados-com-os-olhos'),
    (5, 'Hidratação', 'O hidratante sela a rotina, mantendo a pele confortável e protegida.', 'hidratantes-e-cremes-reparadores'),
    (6, 'Proteção solar', 'Pela manhã, finalize com protetor solar. Ele é indispensável ao usar retinoides, ácidos e vitamina C.', null)
  ) as v(n, title, descr, cat)
where not exists (select 1 from public.ritual_steps);

insert into public.faqs (question, answer, sort_order)
select q, a, n from (values
  (1, 'Como faço meu pedido?', 'Adicione os produtos ao carrinho e toque em "Finalizar pelo WhatsApp". Abriremos uma conversa com a MIVORA já com a lista dos itens e o código do pedido, para confirmarmos disponibilidade, entrega e pagamento.'),
  (2, 'Preciso criar uma conta?', 'Não. Você pode comprar sem cadastro. Seu carrinho e seus favoritos ficam salvos neste dispositivo.'),
  (3, 'Quais são as formas de pagamento?', 'As opções de pagamento são apresentadas e combinadas diretamente pelo WhatsApp, no momento da confirmação do pedido.'),
  (4, 'Como funciona a entrega?', 'As condições de entrega, prazos e valores dependem da sua região e são confirmados pelo nosso atendimento antes do fechamento do pedido.'),
  (5, 'Vocês indicam produtos para a minha pele?', 'Podemos ajudar você a escolher produtos de acordo com os seus objetivos de cuidado. As sugestões são cosméticas e não substituem a avaliação de um dermatologista.'),
  (6, 'O que significa "Consultar preço"?', 'Indica que o valor do produto está sendo atualizado. Fale com a gente pelo WhatsApp para saber o preço atual.')
) as v(n, q, a)
where not exists (select 1 from public.faqs);

-- ---------------------------------------------------------------------------
-- Institutional pages (drafts to be reviewed with the company's legal data)
-- ---------------------------------------------------------------------------
insert into public.pages (slug, title, body, needs_review, seo_description) values
('sobre', 'Sobre a MIVORA',
'## Uma boutique digital de beleza

A MIVORA é uma loja dedicada a skincare coreano e produtos internacionais de beleza. Nosso trabalho é selecionar, entre marcas reconhecidas, produtos que façam sentido para rotinas reais de autocuidado.

## Curadoria

Cada item do nosso catálogo é escolhido com atenção à reputação da marca, à composição e à experiência de uso. Começamos com Medicube, SKIN1004, Celimax, Dr. Althea e Numbuzin, e seguimos ampliando a seleção com o mesmo cuidado.

## Atendimento próximo

Na MIVORA, você monta seu pedido no site e conversa diretamente com a nossa equipe pelo WhatsApp para confirmar disponibilidade, entrega e pagamento. Também estamos por perto para ajudar a escolher produtos e montar a sua rotina.

## Orientação responsável

Nossas sugestões são cosméticas. Elas não substituem a avaliação de um dermatologista ou de outro profissional de saúde.', true,
'Conheça a MIVORA, boutique digital de skincare coreano e beleza internacional com curadoria e atendimento personalizado.'),

('politica-de-privacidade', 'Política de Privacidade',
'Esta política explica como a MIVORA trata dados pessoais neste site, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).

## Quais dados tratamos

- **Carrinho e favoritos:** ficam armazenados apenas no seu próprio dispositivo (armazenamento local do navegador) e não são enviados aos nossos servidores até que você finalize um pedido.
- **Intenção de pedido:** ao tocar em "Finalizar pelo WhatsApp", registramos os produtos, quantidades, valores e um código de pedido. Nome, telefone e observações são opcionais e só são registrados se você os informar.
- **Conversa no WhatsApp:** o atendimento acontece no WhatsApp, serviço de terceiro com política de privacidade própria.
- **Dados técnicos:** nosso provedor de hospedagem pode registrar dados técnicos de acesso (como endereço IP) para segurança e funcionamento do site.

Não coletamos dados de pagamento neste site.

## Para que usamos

Usamos os dados para atender e acompanhar o seu pedido, responder às suas solicitações e manter a segurança do site. Não vendemos dados pessoais.

## Por quanto tempo

Mantemos os registros de pedidos pelo período necessário para o atendimento e para o cumprimento de obrigações legais.

## Seus direitos

Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade ou eliminação dos seus dados, além de informações sobre compartilhamento, nos termos do art. 18 da LGPD. Para isso, entre em contato pelos canais da página de Contato.

## Ferramentas de análise

Caso ferramentas de análise ou publicidade venham a ser utilizadas, esta política será atualizada e, quando exigido, solicitaremos o seu consentimento.

## Controlador

Os dados de identificação da empresa responsável estão disponíveis no rodapé e na página de Contato.', true,
'Saiba como a MIVORA trata dados pessoais, em conformidade com a LGPD.'),

('termos-de-uso', 'Termos de Uso',
'Ao utilizar este site, você concorda com os termos abaixo.

## Sobre o site

O site da MIVORA apresenta produtos de terceiros comercializados pela loja. A MIVORA não é fabricante dos cosméticos anunciados; as marcas exibidas pertencem aos seus respectivos titulares.

## Pedidos

Montar um carrinho e tocar em "Finalizar pelo WhatsApp" gera uma intenção de pedido. A compra só é concluída após a confirmação, pela nossa equipe, de disponibilidade, valores, forma de pagamento e entrega.

## Preços e disponibilidade

Preços e disponibilidade podem ser alterados sem aviso prévio e são confirmados no atendimento. Produtos marcados com "Consultar preço" têm o valor informado pelo WhatsApp.

## Informações dos produtos

As descrições têm caráter informativo e cosmético, com base em informações dos fabricantes. Elas não constituem orientação médica. Sempre leia a embalagem antes do uso e, em caso de dúvida ou condição de pele específica, consulte um profissional de saúde.

## Propriedade intelectual

Os elementos visuais e textos da MIVORA não podem ser reproduzidos sem autorização.', true,
'Termos de uso do site MIVORA.'),

('politica-de-envio', 'Política de Envio',
'## Como funciona

Após a finalização do pedido pelo WhatsApp, nossa equipe confirma a disponibilidade dos produtos e informa as opções de entrega disponíveis para a sua região, com valores e prazos.

## Regiões atendidas

As regiões e modalidades disponíveis (como retirada, entrega local ou envio) são informadas no carrinho e no atendimento, conforme as configurações vigentes da loja.

## Valores e prazos

O valor da entrega e o prazo estimado são confirmados antes do pagamento. Prazos começam a contar após a confirmação do pagamento.

## Acompanhamento

Quando houver código de rastreio, ele será enviado pelo WhatsApp.', true,
'Saiba como funcionam as entregas da MIVORA.'),

('trocas-e-devolucoes', 'Trocas e Devoluções',
'## Direito de arrependimento

Em compras realizadas fora do estabelecimento físico, como pela internet ou pelo WhatsApp, você pode desistir da compra em até 7 dias corridos a partir do recebimento do produto, conforme o art. 49 do Código de Defesa do Consumidor.

## Produtos com defeito

Caso o produto apresente defeito ou avaria, entre em contato pelo WhatsApp com o código do pedido e fotos do item. Analisaremos e indicaremos a solução adequada, nos termos da legislação aplicável.

## Como solicitar

Entre em contato pelos canais da página de Contato informando o código do pedido (por exemplo, MIV-000123). Orientaremos sobre o envio ou a retirada do produto e sobre a restituição dos valores.

## Condições do produto

Por se tratar de cosméticos, recomendamos que o produto seja devolvido em sua embalagem original. As condições específicas serão orientadas no atendimento, sempre respeitando os direitos previstos em lei.', true,
'Política de trocas, devoluções e direito de arrependimento da MIVORA.'),

('contato', 'Contato',
'Fale com a MIVORA pelos canais abaixo. Nosso atendimento acontece principalmente pelo WhatsApp.', true,
'Entre em contato com a MIVORA.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Future catalogue ideas (never published; no price/stock)
-- ---------------------------------------------------------------------------
insert into public.product_suggestions (name, brand_name, notes)
select n, b, 'Sugestão inicial de expansão — avaliar fornecedor, preço e demanda.' from (values
  ('Medicube Collagen Jelly Cream', 'Medicube'),
  ('Medicube PDRN Pink Collagen Balm', 'Medicube'),
  ('Medicube Zero Pore One Day Serum', 'Medicube'),
  ('Medicube EGF NAD+ Serum', 'Medicube'),
  ('Anua Heartleaf 77 Soothing Toner', 'Anua'),
  ('Beauty of Joseon Relief Sun', 'Beauty of Joseon')
) as v(n, b)
where not exists (select 1 from public.product_suggestions);
