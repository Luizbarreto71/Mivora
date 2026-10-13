-- MIVORA — Catálogo MIVORA 2026 (50 produtos) → site.
-- Re-runnable: nothing is duplicated, and prices, stock and existing photos are never changed.
--
-- * Photos from the catalogue are attached only to products that have no photo yet.
-- * Catalogue products that were drafts and the 34 new products are published as
--   "Sob consulta" (availability = on_request): visible, price NULL → "Consultar preço",
--   enquiry via WhatsApp, no cart. Selling still requires the documentation check
--   (product_sale_blocked) before the admin switches a product to "Disponível".
-- * Technical copy is conservative and flagged for review (content_verified = false).

-- ---------------------------------------------------------------------------
-- Brands (no partnership or authorised-reseller claims)
-- ---------------------------------------------------------------------------
insert into public.brands (slug, name, tagline, description, origin_country, sort_order) values
  ('lilyeve', 'Lilyeve', 'Cuidado com o couro cabeludo', 'Marca sul-coreana de cuidados com o couro cabeludo e os cabelos.', 'Coreia do Sul', 17),
  ('mise-en-scene', 'Mise en Scène', 'Cuidados capilares coreanos', 'Marca sul-coreana de cuidados capilares, conhecida pelo Perfect Serum.', 'Coreia do Sul', 18),
  ('kerastase', 'Kérastase', 'Alta performance capilar', 'Marca francesa de cuidados capilares de alta performance.', 'França', 19),
  ('loreal-professionnel', 'L''Oréal Professionnel', 'Cuidados capilares profissionais', 'Linha profissional de cuidados capilares da L''Oréal.', 'França', 20),
  ('wella-professionals', 'Wella Professionals', 'Cuidados capilares profissionais', 'Marca de cuidados capilares profissionais.', null, 21),
  ('olaplex', 'Olaplex', 'Fortalecimento capilar', 'Marca norte-americana conhecida pelos tratamentos de fortalecimento dos fios.', 'Estados Unidos', 22),
  ('k18', 'K18', 'Reparação capilar', 'Marca norte-americana de tratamento capilar, conhecida pela máscara leave-in.', 'Estados Unidos', 23),
  ('redken', 'Redken', 'Cuidados capilares profissionais', 'Marca norte-americana de cuidados capilares profissionais.', 'Estados Unidos', 24),
  ('moroccanoil', 'Moroccanoil', 'Óleo de argan', 'Marca de cuidados capilares conhecida pelo tratamento com óleo de argan.', null, 25),
  ('shiseido-fino', 'Shiseido Fino', 'Cuidado capilar japonês', 'Linha japonesa de cuidados capilares, conhecida pela máscara Premium Touch.', 'Japão', 26),
  ('tsubaki', 'Tsubaki', 'Inspirada na camélia japonesa', 'Marca japonesa de cuidados capilares inspirada no óleo de camélia (tsubaki).', 'Japão', 27),
  ('unove', 'UNOVE', 'Cuidados capilares coreanos', 'Marca sul-coreana de cuidados capilares.', 'Coreia do Sul', 28),
  ('victorias-secret', 'Victoria''s Secret', 'Fragrâncias e body splashes', 'Marca norte-americana de lingerie, beleza e fragrâncias, conhecida pelos body splashes.', 'Estados Unidos', 29)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Categories: sun protection, make-up, hair care, fragrances (+ subcategories)
-- ---------------------------------------------------------------------------
insert into public.categories (slug, name, kind, description, sort_order, is_featured)
values ('protecao-solar', 'Proteção solar', 'product_type', 'Protetores solares faciais para a última etapa da rotina da manhã.', 7, true) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sort_order, is_featured)
values ('maquiagem', 'Maquiagem', 'product_type', 'Bases e produtos de maquiagem.', 8, true) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sort_order, is_featured)
values ('cuidados-capilares', 'Cuidados capilares', 'product_type', 'Shampoos, máscaras, tratamentos e finalizadores para os cabelos.', 9, true) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sort_order, is_featured)
values ('fragrancias', 'Fragrâncias', 'product_type', 'Body splashes e fragrâncias para o dia a dia.', 10, true) on conflict (slug) do nothing;
with children(slug, name, parent, description, sort_order) as (values
  ('geis-de-limpeza', 'Géis de limpeza', 'limpeza', 'Géis de limpeza facial para o uso diário.', 4),
  ('mascaras-de-argila', 'Máscaras de argila', 'mascaras', 'Máscaras de argila para poros e oleosidade.', 4),
  ('bases-e-cushions', 'Bases e cushions', 'maquiagem', 'Bases em cushion e outras texturas.', 1),
  ('shampoos', 'Shampoos', 'cuidados-capilares', 'Shampoos para diferentes necessidades dos fios.', 1),
  ('mascaras-capilares', 'Máscaras capilares', 'cuidados-capilares', 'Máscaras e tratamentos de enxágue.', 2),
  ('tratamentos-capilares', 'Tratamentos capilares', 'cuidados-capilares', 'Tratamentos para os fios e o couro cabeludo.', 3),
  ('oleos-e-seruns-capilares', 'Óleos e séruns capilares', 'cuidados-capilares', 'Óleos e séruns para brilho e finalização.', 4),
  ('body-splash', 'Body splash', 'fragrancias', 'Fragrance mists para perfumar o corpo com leveza.', 1)
)
insert into public.categories (slug, name, kind, parent_id, description, sort_order)
select c.slug, c.name, 'product_type', p.id, c.description, c.sort_order
  from children c join public.categories p on p.slug = c.parent
on conflict (slug) do nothing;

-- The last ritual step ("Proteção solar") now links to the sunscreen category
update public.ritual_steps set category_id = (select id from public.categories where slug = 'protecao-solar')
 where step_number = 6 and category_id is null;

-- ---------------------------------------------------------------------------
-- Registered products that appear in the catalogue
-- ---------------------------------------------------------------------------
-- Drafts present in the catalogue become visible as "Sob consulta" (only if still untouched drafts)
update public.products set status = 'published', availability = 'on_request'
 where slug in ('cosrx-advanced-snail-96-mucin-power-essence', 'anua-heartleaf-77-soothing-toner', 'laneige-lip-sleeping-mask', 'biodance-bio-collagen-real-deep-mask', 'skin1004-madagascar-centella-light-cleansing-oil', 'medicube-collagen-jelly-cream', 'medicube-collagen-night-wrapping-mask', 'dr-althea-147-barrier-cream', 'torriden-dive-in-low-molecular-hyaluronic-acid-serum', 'round-lab-1025-dokdo-toner')
   and status = 'draft' and availability = 'coming_soon';
update public.product_private set sourcing_status = 'planned'
 where sourcing_status = 'evaluating'
   and product_id in (select id from public.products where slug in ('cosrx-advanced-snail-96-mucin-power-essence', 'anua-heartleaf-77-soothing-toner', 'laneige-lip-sleeping-mask', 'biodance-bio-collagen-real-deep-mask', 'skin1004-madagascar-centella-light-cleansing-oil', 'medicube-collagen-jelly-cream', 'medicube-collagen-night-wrapping-mask', 'dr-althea-147-barrier-cream', 'torriden-dive-in-low-molecular-hyaluronic-acid-serum', 'round-lab-1025-dokdo-toner'));

-- Presentation stated in the catalogue (only fills empty values)
update public.products set volume = '70 discos' where slug = 'medicube-zero-pore-pad' and volume is null;
update public.products set volume = '30 ml' where slug = 'medicube-pdrn-pink-peptide-serum' and volume is null;
update public.products set volume = '50 ml' where slug = 'dr-althea-147-barrier-cream' and volume is null;
-- Collagen Jelly Cream: the catalogue (and its photo) show the 50 ml jar
update public.products set volume = '50 ml',
       seo_title = case when seo_title = 'Medicube Collagen Jelly Cream 110 ml' then 'Medicube Collagen Jelly Cream 50 ml' else seo_title end
 where slug = 'medicube-collagen-jelly-cream' and volume = '110 ml';

-- ---------------------------------------------------------------------------
-- New products (published as "Sob consulta", no price, stock not tracked)
-- ---------------------------------------------------------------------------
with b as (select id, slug from public.brands)
insert into public.products (
  slug, name, brand_id, volume, short_description, description, benefits, key_ingredients,
  how_to_use, warnings, skin_types, tags, status, availability, track_inventory, media_pending, sort_order,
  seo_title, seo_description
) values
(
  'numbuzin-no9-nad-bio-lifting-sil-essence', 'Numbuzin No.9 NAD+ Bio Lifting-Sil Essence', (select id from b where slug = 'numbuzin'), null,
  'Essência da linha No.9 com NAD+, de textura leve, para uma rotina focada na aparência de firmeza e no viço da pele.',
  'Da linha No.9 da Numbuzin, a NAD+ Bio Lifting-Sil Essence é aplicada logo após o tônico e prepara a pele para os próximos passos. Uma escolha para quem busca uma pele com aparência mais firme, hidratada e radiante.',
  array['Contribui para a aparência de firmeza', 'Hidratação leve', 'Pele com mais viço']::text[], array['NAD+']::text[],
  'Após o tônico, aplique uma pequena quantidade no rosto e espalhe com leves batidinhas até absorver. Siga com sérum e hidratante.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos']::text[], array['nad+', 'nad', 'essência', 'essence', 'lifting', 'firmeza', 'no.9']::text[],
  'published', 'on_request', false, false, 105,
  'Numbuzin No.9 NAD+ Bio Lifting-Sil Essence', 'Essência da linha No.9 com NAD+, de textura leve, para uma rotina focada na aparência de firmeza e no viço da pele.'
),
(
  'skin1004-madagascar-centella-hyalu-cica-water-fit-sun-serum', 'SKIN1004 Madagascar Centella Hyalu-Cica Water-Fit Sun Serum SPF50+', (select id from b where slug = 'skin1004'), null,
  'Protetor solar facial em textura sérum, FPS 50+, com Centella asiatica e ácido hialurônico, para a proteção diária com sensação leve.',
  'O Hyalu-Cica Water-Fit Sun Serum une proteção solar e cuidado em uma textura fluida, que se espalha com facilidade e não pesa na pele. Da linha Madagascar Centella, é a etapa final da rotina da manhã.',
  array['Proteção solar diária FPS 50+', 'Textura sérum leve', 'Sensação de hidratação e conforto']::text[], array['Centella asiatica de Madagascar', 'Ácido hialurônico']::text[],
  'Pela manhã, como último passo da rotina, aplique uma quantidade generosa no rosto e no pescoço cerca de 15 minutos antes da exposição ao sol. Reaplique ao longo do dia, principalmente após suar, nadar ou secar o rosto com a toalha.',
  'Uso externo. Evite o contato com os olhos. Reaplique com frequência: nenhum protetor solar oferece proteção total. Suspenda o uso em caso de irritação.',
  array['todos', 'sensivel']::text[], array['protetor solar', 'filtro solar', 'fps 50', 'spf50', 'sun serum', 'centella', 'hialurônico', 'cica']::text[],
  'published', 'on_request', false, false, 108,
  'SKIN1004 Madagascar Centella Hyalu-Cica Water-Fit Sun Serum SPF50+', 'Protetor solar facial em textura sérum, FPS 50+, com Centella asiatica e ácido hialurônico, para a proteção diária com sensação leve.'
),
(
  'lilyeve-grow-turn-exosome-brush-ampoule', 'Lilyeve Grow:Turn Exosome Brush Ampoule', (select id from b where slug = 'lilyeve'), null,
  'Ampola para o couro cabeludo com aplicador em escova, que distribui o produto enquanto massageia.',
  'A Grow:Turn Exosome Brush Ampoule foi pensada para o cuidado do couro cabeludo. O aplicador com cerdas permite levar a ampola diretamente à raiz com uma massagem suave, deixando o couro cabeludo com sensação de frescor e cuidado.',
  array['Cuidado direcionado ao couro cabeludo', 'Aplicador em escova para massagem', 'Aplicação prática, direto na raiz']::text[], array['Exossomos']::text[],
  'Aplique diretamente no couro cabeludo, deslizando o aplicador pela raiz com uma massagem suave. Siga as orientações da embalagem quanto à frequência de uso e ao enxágue.',
  'Uso externo. Evite o contato com os olhos. Não aplique sobre o couro cabeludo irritado ou lesionado. Suspenda o uso em caso de irritação.',
  '{}'::text[], array['couro cabeludo', 'scalp', 'exossomos', 'exosome', 'ampola capilar', 'cabelo']::text[],
  'published', 'on_request', false, false, 109,
  'Lilyeve Grow:Turn Exosome Brush Ampoule', 'Ampola para o couro cabeludo com aplicador em escova, que distribui o produto enquanto massageia.'
),
(
  'beauty-of-joseon-revive-eye-serum-ginseng-retinal', 'Beauty of Joseon Revive Eye Serum: Ginseng + Retinal', (select id from b where slug = 'beauty-of-joseon'), null,
  'Sérum para a área dos olhos com ginseng e retinal, para cuidar da aparência de linhas finas.',
  'O Revive Eye Serum reúne ginseng e retinal em uma textura cremosa, pensada para a delicada região dos olhos. Como contém retinal, deve ser introduzido aos poucos na rotina noturna.',
  array['Cuidado com a aparência de linhas finas', 'Hidratação para a área dos olhos', 'Textura confortável']::text[], array['Ginseng', 'Retinal']::text[],
  'À noite, aplique uma pequena quantidade ao redor dos olhos com toques leves, sem atingir a pálpebra móvel e a linha dos cílios. Comece algumas vezes por semana e aumente conforme a tolerância da pele.',
  'Contém retinal: use protetor solar diariamente. Evite o contato direto com os olhos. Não combine com outros retinoides ou esfoliantes na mesma aplicação. Gestantes e lactantes devem consultar um profissional de saúde antes do uso. Suspenda em caso de irritação.',
  array['todos']::text[], array['olhos', 'área dos olhos', 'contorno dos olhos', 'eye serum', 'retinal', 'retinoide', 'ginseng', 'linhas finas']::text[],
  'published', 'on_request', false, false, 110,
  'Beauty of Joseon Revive Eye Serum: Ginseng + Retinal', 'Sérum para a área dos olhos com ginseng e retinal, para cuidar da aparência de linhas finas.'
),
(
  'beauty-of-joseon-relief-sun-rice-probiotics', 'Beauty of Joseon Relief Sun: Rice + Probiotics SPF50+', (select id from b where slug = 'beauty-of-joseon'), null,
  'Protetor solar facial FPS 50+ com extrato de arroz e probióticos, de textura cremosa e leve.',
  'Um dos protetores solares coreanos mais conhecidos, o Relief Sun combina extrato de arroz e probióticos em uma textura cremosa que se espalha com facilidade, para a proteção diária na última etapa da rotina da manhã.',
  array['Proteção solar diária FPS 50+', 'Textura cremosa e leve', 'Sensação de conforto na pele']::text[], array['Extrato de arroz', 'Probióticos']::text[],
  'Pela manhã, como último passo da rotina, aplique uma quantidade generosa no rosto e no pescoço cerca de 15 minutos antes da exposição ao sol. Reaplique ao longo do dia, principalmente após suar, nadar ou secar o rosto com a toalha.',
  'Uso externo. Evite o contato com os olhos. Reaplique com frequência: nenhum protetor solar oferece proteção total. Suspenda o uso em caso de irritação.',
  array['todos']::text[], array['protetor solar', 'filtro solar', 'fps 50', 'spf50', 'arroz', 'probióticos', 'relief sun']::text[],
  'published', 'on_request', false, false, 113,
  'Beauty of Joseon Relief Sun: Rice + Probiotics SPF50+', 'Protetor solar facial FPS 50+ com extrato de arroz e probióticos, de textura cremosa e leve.'
),
(
  'tirtir-mask-fit-red-cushion', 'TIRTIR Mask Fit Red Cushion', (select id from b where slug = 'tirtir'), null,
  'Base em cushion com esponja aplicadora, de cobertura construível. Consulte os tons disponíveis.',
  'O Mask Fit Red Cushion é uma base em formato cushion, prática para retoques ao longo do dia. A esponja permite construir a cobertura em camadas, do efeito natural ao mais uniforme. Os tons disponíveis são informados no atendimento.',
  array['Formato prático para retoques', 'Cobertura construível', 'Acompanha esponja aplicadora']::text[], '{}'::text[],
  'Pressione a esponja levemente no cushion e aplique com toques suaves, do centro do rosto para fora. Adicione camadas onde desejar mais cobertura.',
  'Uso externo. Evite o contato com os olhos. Mantenha a esponja limpa. Suspenda o uso em caso de irritação.',
  '{}'::text[], array['maquiagem', 'base', 'cushion', 'cobertura', 'tirtir']::text[],
  'published', 'on_request', false, false, 114,
  'TIRTIR Mask Fit Red Cushion', 'Base em cushion com esponja aplicadora, de cobertura construível. Consulte os tons disponíveis.'
),
(
  'cosrx-low-ph-good-morning-gel-cleanser', 'COSRX Low pH Good Morning Gel Cleanser', (select id from b where slug = 'cosrx'), null,
  'Gel de limpeza facial de pH levemente ácido, para uma limpeza suave de manhã e à noite.',
  'Um clássico da COSRX, o Low pH Good Morning Gel Cleanser forma uma espuma leve que remove impurezas e oleosidade sem deixar a pele com sensação de repuxar. Ideal para a limpeza diária.',
  array['Limpeza suave', 'pH levemente ácido', 'Não deixa sensação de repuxar']::text[], '{}'::text[],
  'Molhe o rosto, faça espuma com uma pequena quantidade nas mãos e massageie suavemente. Enxágue bem.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água. Suspenda o uso em caso de irritação.',
  array['todos']::text[], array['gel de limpeza', 'sabonete facial', 'limpeza', 'low ph', 'ph baixo', 'cleanser']::text[],
  'published', 'on_request', false, false, 117,
  'COSRX Low pH Good Morning Gel Cleanser', 'Gel de limpeza facial de pH levemente ácido, para uma limpeza suave de manhã e à noite.'
),
(
  'mise-en-scene-perfect-serum-original', 'Mise en Scène Perfect Serum Original', (select id from b where slug = 'mise-en-scene'), null,
  'Sérum capilar finalizador para cabelos com mais brilho, maciez e pontas bem cuidadas.',
  'O Perfect Serum Original é um dos finalizadores capilares mais conhecidos da Coreia. Aplicado no comprimento e nas pontas, ajuda a controlar o frizz e deixa os fios com toque macio e brilho.',
  array['Brilho e maciez', 'Ajuda a controlar o frizz', 'Cuidado com as pontas']::text[], '{}'::text[],
  'Aplique algumas gotas no comprimento e nas pontas, com os cabelos úmidos ou secos, evitando a raiz.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água em abundância.',
  '{}'::text[], array['sérum capilar', 'óleo capilar', 'finalizador', 'cabelo', 'brilho', 'frizz', 'pontas']::text[],
  'published', 'on_request', false, false, 119,
  'Mise en Scène Perfect Serum Original', 'Sérum capilar finalizador para cabelos com mais brilho, maciez e pontas bem cuidadas.'
),
(
  'kerastase-elixir-ultime-lhuile-originale', 'Kérastase Elixir Ultime L''Huile Originale', (select id from b where slug = 'kerastase'), null,
  'Óleo capilar para todos os tipos de cabelo, para brilho intenso e toque sedoso.',
  'Ícone da Kérastase, o Elixir Ultime L''Huile Originale é um óleo versátil que pode ser usado antes da secagem ou na finalização, deixando os fios com brilho, maciez e aspecto bem cuidado.',
  array['Brilho intenso', 'Toque sedoso', 'Uso antes da secagem ou na finalização']::text[], '{}'::text[],
  'Aplique de 1 a 3 pumps no comprimento e nas pontas, com os cabelos úmidos ou secos. Ajuste a quantidade ao comprimento e à espessura dos fios.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água em abundância.',
  '{}'::text[], array['óleo capilar', 'finalizador', 'brilho', 'cabelo', 'elixir', 'kérastase']::text[],
  'published', 'on_request', false, false, 121,
  'Kérastase Elixir Ultime L''Huile Originale', 'Óleo capilar para todos os tipos de cabelo, para brilho intenso e toque sedoso.'
),
(
  'loreal-professionnel-absolut-repair-shampoo', 'L''Oréal Professionnel Absolut Repair Shampoo', (select id from b where slug = 'loreal-professionnel'), null,
  'Shampoo profissional da linha Absolut Repair, para cabelos secos e danificados.',
  'Da linha Serie Expert, o Absolut Repair Shampoo limpa com suavidade os fios danificados, preparando-os para os tratamentos da linha e deixando os cabelos com toque macio.',
  array['Limpeza suave para cabelos danificados', 'Toque macio', 'Prepara os fios para o tratamento']::text[], '{}'::text[],
  'Aplique nos cabelos molhados, massageie suavemente o couro cabeludo até formar espuma e enxágue bem. Repita se necessário.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água em abundância.',
  '{}'::text[], array['shampoo', 'cabelos danificados', 'reparação', 'absolut repair', 'serie expert']::text[],
  'published', 'on_request', false, false, 122,
  'L''Oréal Professionnel Absolut Repair Shampoo', 'Shampoo profissional da linha Absolut Repair, para cabelos secos e danificados.'
),
(
  'wella-professionals-ultimate-repair-shampoo', 'Wella Professionals Ultimate Repair Shampoo', (select id from b where slug = 'wella-professionals'), null,
  'Shampoo da linha Ultimate Repair, para uma limpeza suave de cabelos danificados.',
  'O Ultimate Repair Shampoo da Wella Professionals limpa os fios com suavidade e é o primeiro passo da linha Ultimate Repair, dedicada aos cabelos que precisam de cuidado extra.',
  array['Limpeza suave', 'Indicado para cabelos danificados', 'Primeiro passo da linha Ultimate Repair']::text[], '{}'::text[],
  'Aplique nos cabelos molhados, massageie suavemente o couro cabeludo até formar espuma e enxágue bem. Repita se necessário.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água em abundância.',
  '{}'::text[], array['shampoo', 'cabelos danificados', 'reparação', 'ultimate repair']::text[],
  'published', 'on_request', false, false, 123,
  'Wella Professionals Ultimate Repair Shampoo', 'Shampoo da linha Ultimate Repair, para uma limpeza suave de cabelos danificados.'
),
(
  'olaplex-no3-hair-perfector', 'Olaplex Nº 3 Hair Perfector', (select id from b where slug = 'olaplex'), '100 ml',
  'Tratamento capilar pré-shampoo para fortalecer os fios e cuidar de cabelos danificados.',
  'O Nº 3 Hair Perfector é o tratamento de uso em casa mais conhecido da Olaplex. Aplicado antes do shampoo, ajuda a fortalecer os fios e a melhorar a aparência dos cabelos danificados por química, calor ou agressões do dia a dia.',
  array['Ajuda a fortalecer os fios', 'Cuidado com cabelos danificados', 'Para todos os tipos de cabelo']::text[], '{}'::text[],
  'Aplique nos cabelos úmidos, do comprimento às pontas, e deixe agir por pelo menos 10 minutos. Depois, lave com shampoo e use condicionador.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água em abundância.',
  '{}'::text[], array['tratamento capilar', 'pré-shampoo', 'olaplex 3', 'no.3', 'cabelos danificados', 'fortalecimento']::text[],
  'published', 'on_request', false, false, 124,
  'Olaplex Nº 3 Hair Perfector 100 ml', 'Tratamento capilar pré-shampoo para fortalecer os fios e cuidar de cabelos danificados.'
),
(
  'k18-leave-in-molecular-repair-hair-mask', 'K18 Leave-In Molecular Repair Hair Mask', (select id from b where slug = 'k18'), '50 ml',
  'Máscara capilar sem enxágue, aplicada após a lavagem, para cabelos danificados.',
  'A K18 Leave-In Molecular Repair Hair Mask é usada logo após a lavagem, sem enxágue, e faz parte da rotina de quem busca recuperar a aparência de fios danificados por química, calor ou atrito.',
  array['Tratamento sem enxágue', 'Cuidado com cabelos danificados', 'Pequena quantidade por aplicação']::text[], '{}'::text[],
  'Lave os cabelos com shampoo, sem condicionador, e retire o excesso de água com a toalha. Aplique uma pequena quantidade no comprimento e nas pontas, aguarde alguns minutos e finalize como de costume. Não enxágue.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água em abundância.',
  '{}'::text[], array['máscara capilar', 'leave-in', 'sem enxágue', 'reparação', 'cabelos danificados', 'k18']::text[],
  'published', 'on_request', false, false, 125,
  'K18 Leave-In Molecular Repair Hair Mask 50 ml', 'Máscara capilar sem enxágue, aplicada após a lavagem, para cabelos danificados.'
),
(
  'redken-acidic-bonding-concentrate-shampoo', 'Redken Acidic Bonding Concentrate Shampoo', (select id from b where slug = 'redken'), null,
  'Shampoo da linha Acidic Bonding Concentrate, para cabelos danificados e com química.',
  'Da linha Acidic Bonding Concentrate, o shampoo limpa com suavidade cabelos fragilizados por química e coloração, sendo o primeiro passo da rotina de cuidado da linha.',
  array['Limpeza suave', 'Indicado para cabelos com química', 'Primeiro passo da linha']::text[], '{}'::text[],
  'Aplique nos cabelos molhados, massageie suavemente o couro cabeludo até formar espuma e enxágue bem. Repita se necessário.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água em abundância.',
  '{}'::text[], array['shampoo', 'cabelos com química', 'coloração', 'danificados', 'reparação', 'acidic bonding']::text[],
  'published', 'on_request', false, false, 126,
  'Redken Acidic Bonding Concentrate Shampoo', 'Shampoo da linha Acidic Bonding Concentrate, para cabelos danificados e com química.'
),
(
  'moroccanoil-treatment-original', 'Moroccanoil Treatment Original', (select id from b where slug = 'moroccanoil'), null,
  'Tratamento capilar com óleo de argan, para brilho, maciez e controle do frizz.',
  'O Moroccanoil Treatment é o produto que deu origem à marca. Com óleo de argan, pode ser usado como base de finalização ou para dar brilho aos fios secos.',
  array['Brilho e maciez', 'Ajuda a controlar o frizz', 'Versátil: antes de secar ou para finalizar']::text[], array['Óleo de argan']::text[],
  'Aplique uma pequena quantidade no comprimento e nas pontas dos cabelos úmidos antes de secar, ou nos fios secos para finalizar.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água em abundância.',
  '{}'::text[], array['óleo capilar', 'argan', 'finalizador', 'brilho', 'frizz', 'moroccanoil']::text[],
  'published', 'on_request', false, false, 127,
  'Moroccanoil Treatment Original', 'Tratamento capilar com óleo de argan, para brilho, maciez e controle do frizz.'
),
(
  'shiseido-fino-premium-touch-hair-mask', 'Shiseido Fino Premium Touch Hair Mask', (select id from b where slug = 'shiseido-fino'), '230 g',
  'Máscara capilar japonesa para cabelos danificados, que deixa os fios macios e com brilho.',
  'Queridinha do cuidado capilar japonês, a Fino Premium Touch é uma máscara de textura cremosa que nutre os fios e deixa os cabelos com toque macio e brilho.',
  array['Fios mais macios', 'Brilho', 'Textura cremosa']::text[], '{}'::text[],
  'Após o shampoo, retire o excesso de água e aplique no comprimento e nas pontas. Deixe agir pelo tempo indicado na embalagem e enxágue bem.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água em abundância.',
  '{}'::text[], array['máscara capilar', 'hidratação capilar', 'fino', 'cabelos danificados', 'japonês']::text[],
  'published', 'on_request', false, false, 128,
  'Shiseido Fino Premium Touch Hair Mask 230 g', 'Máscara capilar japonesa para cabelos danificados, que deixa os fios macios e com brilho.'
),
(
  'tsubaki-premium-repair-hair-mask', 'Tsubaki Premium Repair Hair Mask', (select id from b where slug = 'tsubaki'), null,
  'Máscara capilar japonesa de reparação, para fios danificados com mais maciez e brilho.',
  'A Premium Repair Hair Mask da Tsubaki é uma máscara de tratamento para cabelos danificados, que deixa os fios com toque sedoso e aparência saudável.',
  array['Toque sedoso', 'Cuidado com fios danificados', 'Brilho']::text[], array['Óleo de camélia (tsubaki)']::text[],
  'Após o shampoo, retire o excesso de água e aplique no comprimento e nas pontas. Deixe agir pelo tempo indicado na embalagem e enxágue bem.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água em abundância.',
  '{}'::text[], array['máscara capilar', 'reparação', 'camélia', 'tsubaki', 'japonês', 'cabelos danificados']::text[],
  'published', 'on_request', false, false, 129,
  'Tsubaki Premium Repair Hair Mask', 'Máscara capilar japonesa de reparação, para fios danificados com mais maciez e brilho.'
),
(
  'unove-deep-damage-treatment-ex', 'UNOVE Deep Damage Treatment EX', (select id from b where slug = 'unove'), null,
  'Tratamento capilar coreano de enxágue para cabelos muito danificados, de textura cremosa.',
  'O Deep Damage Treatment EX da UNOVE é um tratamento de enxágue para cabelos danificados, que deixa os fios macios, fáceis de desembaraçar e com brilho.',
  array['Fios macios', 'Facilita o desembaraço', 'Brilho']::text[], '{}'::text[],
  'Após o shampoo, retire o excesso de água e aplique no comprimento e nas pontas. Deixe agir pelo tempo indicado na embalagem e enxágue bem.',
  'Uso externo. Evite o contato com os olhos; em caso de contato, enxágue com água em abundância.',
  '{}'::text[], array['tratamento capilar', 'máscara capilar', 'cabelos danificados', 'coreano', 'unove']::text[],
  'published', 'on_request', false, false, 130,
  'UNOVE Deep Damage Treatment EX', 'Tratamento capilar coreano de enxágue para cabelos muito danificados, de textura cremosa.'
),
(
  'medicube-pdrn-pink-collagen-capsule-cream', 'Medicube PDRN Pink Collagen Capsule Cream', (select id from b where slug = 'medicube'), '55 g',
  'Creme facial da linha PDRN Pink com colágeno em cápsulas, para hidratação e aparência de firmeza.',
  'O PDRN Pink Collagen Capsule Cream combina PDRN e colágeno em uma textura com cápsulas que se desfazem ao contato com a pele. É a etapa final da rotina para quem busca hidratação e uma pele com aparência mais firme e luminosa.',
  array['Hidratação', 'Contribui para a aparência de firmeza', 'Pele com aspecto luminoso']::text[], array['PDRN', 'Colágeno']::text[],
  'Na última etapa da rotina, aplique uma quantidade adequada no rosto e espalhe com movimentos suaves até a absorção.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos']::text[], array['pdrn', 'colágeno', 'collagen', 'cápsulas', 'creme', 'pink', 'firmeza']::text[],
  'published', 'on_request', false, false, 131,
  'Medicube PDRN Pink Collagen Capsule Cream 55 g', 'Creme facial da linha PDRN Pink com colágeno em cápsulas, para hidratação e aparência de firmeza.'
),
(
  'medicube-zero-pore-blackhead-mud-mask', 'Medicube Zero Pore Blackhead Mud Mask', (select id from b where slug = 'medicube'), '100 g',
  'Máscara de argila da linha Zero Pore, para cuidar da aparência dos poros e dos cravos.',
  'A Zero Pore Blackhead Mud Mask é uma máscara de textura argilosa que ajuda a remover o excesso de oleosidade e as impurezas, contribuindo para poros com aparência mais limpa.',
  array['Ajuda a remover o excesso de oleosidade', 'Cuidado com a aparência dos poros e cravos', 'Sensação de pele limpa']::text[], '{}'::text[],
  'Após a limpeza, aplique uma camada uniforme no rosto ou nas áreas desejadas, evitando olhos e lábios. Deixe agir pelo tempo indicado na embalagem e enxágue com água morna.',
  'Uso externo. Evite a área dos olhos e dos lábios. Não aplique sobre pele irritada. Suspenda o uso em caso de irritação.',
  array['oleosa', 'mista', 'normal']::text[], array['máscara de argila', 'mud mask', 'cravos', 'poros', 'oleosidade', 'zero pore']::text[],
  'published', 'on_request', false, false, 133,
  'Medicube Zero Pore Blackhead Mud Mask 100 g', 'Máscara de argila da linha Zero Pore, para cuidar da aparência dos poros e dos cravos.'
),
(
  'medicube-deep-vita-c-capsule-cream', 'Medicube Deep Vita C Capsule Cream', (select id from b where slug = 'medicube'), '55 g',
  'Creme facial da linha Deep Vita C com cápsulas de vitamina C, para uma pele com aparência mais luminosa e uniforme.',
  'O Deep Vita C Capsule Cream leva a linha Deep Vita C para a etapa de hidratação, com cápsulas que se desfazem ao espalhar. Uma escolha para quem busca uma pele com aparência mais luminosa e um tom mais uniforme.',
  array['Contribui para uma aparência luminosa', 'Ajuda a uniformizar a aparência do tom', 'Hidratação']::text[], array['Vitamina C']::text[],
  'Na última etapa da rotina, aplique uma quantidade adequada no rosto e espalhe com movimentos suaves até a absorção. Pela manhã, finalize com protetor solar.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos']::text[], array['vitamina c', 'vitamin c', 'vita c', 'cápsulas', 'creme', 'luminosidade', 'tom uniforme']::text[],
  'published', 'on_request', false, false, 134,
  'Medicube Deep Vita C Capsule Cream 55 g', 'Creme facial da linha Deep Vita C com cápsulas de vitamina C, para uma pele com aparência mais luminosa e uniforme.'
),
(
  'medicube-triple-collagen-serum', 'Medicube Triple Collagen Serum', (select id from b where slug = 'medicube'), '55 ml',
  'Sérum com colágeno da Medicube, para hidratação e uma pele com aparência mais firme e elástica.',
  'O Triple Collagen Serum é um sérum de textura leve com colágeno, pensado para a etapa de tratamento de quem busca hidratação e uma pele com aparência mais firme.',
  array['Hidratação', 'Contribui para a aparência de firmeza e elasticidade', 'Textura leve']::text[], array['Colágeno']::text[],
  'Após o tônico, aplique algumas gotas no rosto e espalhe com leves batidinhas até absorver. Siga com o hidratante.',
  'Uso externo. Evite o contato com os olhos. Suspenda o uso em caso de irritação.',
  array['todos']::text[], array['colágeno', 'collagen', 'sérum', 'serum', 'firmeza', 'hidratação']::text[],
  'published', 'on_request', false, false, 135,
  'Medicube Triple Collagen Serum 55 ml', 'Sérum com colágeno da Medicube, para hidratação e uma pele com aparência mais firme e elástica.'
),
(
  'medicube-pdrn-pink-collagen-exosome-shot-7500', 'Medicube PDRN Pink Collagen Exosome Shot 7500', (select id from b where slug = 'medicube'), '30 ml',
  'Sérum concentrado da linha PDRN Pink com PDRN, colágeno e exossomos, para uma rotina de firmeza e viço.',
  'O PDRN Pink Collagen Exosome Shot 7500 reúne PDRN, colágeno e exossomos em um sérum concentrado da linha PDRN Pink. Siga as orientações da embalagem quanto à frequência de uso.',
  array['Contribui para a aparência de firmeza', 'Pele com mais viço', 'Fórmula concentrada']::text[], array['PDRN', 'Colágeno', 'Exossomos']::text[],
  'Após a limpeza e o tônico, aplique uma pequena quantidade no rosto e espalhe suavemente. Siga as orientações da embalagem quanto à frequência de uso.',
  'Uso externo. Evite o contato com os olhos. Faça um teste de sensibilidade antes do primeiro uso. Suspenda o uso em caso de irritação.',
  array['todos']::text[], array['pdrn', 'colágeno', 'collagen', 'exossomos', 'exosome', 'shot', 'pink']::text[],
  'published', 'on_request', false, false, 136,
  'Medicube PDRN Pink Collagen Exosome Shot 7500 30 ml', 'Sérum concentrado da linha PDRN Pink com PDRN, colágeno e exossomos, para uma rotina de firmeza e viço.'
),
(
  'anua-niacinamide-10-txa-4-dark-spot-correcting-serum', 'Anua Niacinamide 10% + TXA 4% Dark Spot Correcting Serum', (select id from b where slug = 'anua'), '30 ml',
  'Sérum com niacinamida 10% e ácido tranexâmico 4%, para cuidar da aparência de manchas e uniformizar o tom.',
  'O Niacinamide 10% + TXA 4% Dark Spot Correcting Serum reúne niacinamida e ácido tranexâmico em uma textura leve, para a etapa de tratamento de quem deseja uma pele com tom mais uniforme e aparência mais luminosa.',
  array['Cuida da aparência de manchas', 'Ajuda a uniformizar o tom', 'Contribui para uma aparência luminosa']::text[], array['Niacinamida 10%', 'Ácido tranexâmico 4%']::text[],
  'Após o tônico, aplique algumas gotas no rosto e espalhe com leves batidinhas até absorver. Siga com o hidratante. Pela manhã, finalize com protetor solar.',
  'Uso externo. Evite o contato com os olhos. Faça um teste de sensibilidade antes do primeiro uso e suspenda em caso de irritação.',
  array['todos']::text[], array['niacinamida', 'niacinamide', 'ácido tranexâmico', 'tranexamic acid', 'txa', 'manchas', 'sérum', 'uniformizador']::text[],
  'published', 'on_request', false, false, 137,
  'Anua Niacinamide 10% + TXA 4% Dark Spot Correcting Serum 30 ml', 'Sérum com niacinamida 10% e ácido tranexâmico 4%, para cuidar da aparência de manchas e uniformizar o tom.'
),
(
  'victorias-secret-bare-vanilla-fragrance-mist', 'Victoria''s Secret Bare Vanilla Fragrance Mist', (select id from b where slug = 'victorias-secret'), '250 ml',
  'Body splash Victoria''s Secret Bare Vanilla, para perfumar o corpo com leveza ao longo do dia.',
  'O Bare Vanilla Fragrance Mist é um body splash da Victoria''s Secret em frasco de 250 ml. Ideal para usar após o banho e reaplicar sempre que quiser renovar a fragrância.',
  array['Fragrância leve para o dia a dia', 'Frasco de 250 ml', 'Fácil de reaplicar']::text[], '{}'::text[],
  'Borrife a cerca de 15 cm do corpo, após o banho ou sempre que desejar. Evite o rosto.',
  'Uso externo. Produto inflamável: mantenha longe do fogo e do calor. Evite o contato com os olhos e com a pele irritada. Suspenda o uso em caso de irritação.',
  '{}'::text[], array['body splash', 'fragrance mist', 'perfume', 'colônia', 'fragrância', 'victoria''s secret', 'bare vanilla']::text[],
  'published', 'on_request', false, false, 141,
  'Victoria''s Secret Bare Vanilla Fragrance Mist 250 ml', 'Body splash Victoria''s Secret Bare Vanilla, para perfumar o corpo com leveza ao longo do dia.'
),
(
  'victorias-secret-pure-seduction-fragrance-mist', 'Victoria''s Secret Pure Seduction Fragrance Mist', (select id from b where slug = 'victorias-secret'), '250 ml',
  'Body splash Victoria''s Secret Pure Seduction, para perfumar o corpo com leveza ao longo do dia.',
  'O Pure Seduction Fragrance Mist é um body splash da Victoria''s Secret em frasco de 250 ml. Ideal para usar após o banho e reaplicar sempre que quiser renovar a fragrância.',
  array['Fragrância leve para o dia a dia', 'Frasco de 250 ml', 'Fácil de reaplicar']::text[], '{}'::text[],
  'Borrife a cerca de 15 cm do corpo, após o banho ou sempre que desejar. Evite o rosto.',
  'Uso externo. Produto inflamável: mantenha longe do fogo e do calor. Evite o contato com os olhos e com a pele irritada. Suspenda o uso em caso de irritação.',
  '{}'::text[], array['body splash', 'fragrance mist', 'perfume', 'colônia', 'fragrância', 'victoria''s secret', 'pure seduction']::text[],
  'published', 'on_request', false, false, 142,
  'Victoria''s Secret Pure Seduction Fragrance Mist 250 ml', 'Body splash Victoria''s Secret Pure Seduction, para perfumar o corpo com leveza ao longo do dia.'
),
(
  'victorias-secret-love-spell-fragrance-mist', 'Victoria''s Secret Love Spell Fragrance Mist', (select id from b where slug = 'victorias-secret'), '250 ml',
  'Body splash Victoria''s Secret Love Spell, para perfumar o corpo com leveza ao longo do dia.',
  'O Love Spell Fragrance Mist é um body splash da Victoria''s Secret em frasco de 250 ml. Ideal para usar após o banho e reaplicar sempre que quiser renovar a fragrância.',
  array['Fragrância leve para o dia a dia', 'Frasco de 250 ml', 'Fácil de reaplicar']::text[], '{}'::text[],
  'Borrife a cerca de 15 cm do corpo, após o banho ou sempre que desejar. Evite o rosto.',
  'Uso externo. Produto inflamável: mantenha longe do fogo e do calor. Evite o contato com os olhos e com a pele irritada. Suspenda o uso em caso de irritação.',
  '{}'::text[], array['body splash', 'fragrance mist', 'perfume', 'colônia', 'fragrância', 'victoria''s secret', 'love spell']::text[],
  'published', 'on_request', false, false, 143,
  'Victoria''s Secret Love Spell Fragrance Mist 250 ml', 'Body splash Victoria''s Secret Love Spell, para perfumar o corpo com leveza ao longo do dia.'
),
(
  'victorias-secret-velvet-petals-fragrance-mist', 'Victoria''s Secret Velvet Petals Fragrance Mist', (select id from b where slug = 'victorias-secret'), '250 ml',
  'Body splash Victoria''s Secret Velvet Petals, para perfumar o corpo com leveza ao longo do dia.',
  'O Velvet Petals Fragrance Mist é um body splash da Victoria''s Secret em frasco de 250 ml. Ideal para usar após o banho e reaplicar sempre que quiser renovar a fragrância.',
  array['Fragrância leve para o dia a dia', 'Frasco de 250 ml', 'Fácil de reaplicar']::text[], '{}'::text[],
  'Borrife a cerca de 15 cm do corpo, após o banho ou sempre que desejar. Evite o rosto.',
  'Uso externo. Produto inflamável: mantenha longe do fogo e do calor. Evite o contato com os olhos e com a pele irritada. Suspenda o uso em caso de irritação.',
  '{}'::text[], array['body splash', 'fragrance mist', 'perfume', 'colônia', 'fragrância', 'victoria''s secret', 'velvet petals']::text[],
  'published', 'on_request', false, false, 144,
  'Victoria''s Secret Velvet Petals Fragrance Mist 250 ml', 'Body splash Victoria''s Secret Velvet Petals, para perfumar o corpo com leveza ao longo do dia.'
),
(
  'victorias-secret-coconut-passion-fragrance-mist', 'Victoria''s Secret Coconut Passion Fragrance Mist', (select id from b where slug = 'victorias-secret'), '250 ml',
  'Body splash Victoria''s Secret Coconut Passion, para perfumar o corpo com leveza ao longo do dia.',
  'O Coconut Passion Fragrance Mist é um body splash da Victoria''s Secret em frasco de 250 ml. Ideal para usar após o banho e reaplicar sempre que quiser renovar a fragrância.',
  array['Fragrância leve para o dia a dia', 'Frasco de 250 ml', 'Fácil de reaplicar']::text[], '{}'::text[],
  'Borrife a cerca de 15 cm do corpo, após o banho ou sempre que desejar. Evite o rosto.',
  'Uso externo. Produto inflamável: mantenha longe do fogo e do calor. Evite o contato com os olhos e com a pele irritada. Suspenda o uso em caso de irritação.',
  '{}'::text[], array['body splash', 'fragrance mist', 'perfume', 'colônia', 'fragrância', 'victoria''s secret', 'coconut passion']::text[],
  'published', 'on_request', false, false, 145,
  'Victoria''s Secret Coconut Passion Fragrance Mist 250 ml', 'Body splash Victoria''s Secret Coconut Passion, para perfumar o corpo com leveza ao longo do dia.'
),
(
  'victorias-secret-aqua-kiss-fragrance-mist', 'Victoria''s Secret Aqua Kiss Fragrance Mist', (select id from b where slug = 'victorias-secret'), '250 ml',
  'Body splash Victoria''s Secret Aqua Kiss, para perfumar o corpo com leveza ao longo do dia.',
  'O Aqua Kiss Fragrance Mist é um body splash da Victoria''s Secret em frasco de 250 ml. Ideal para usar após o banho e reaplicar sempre que quiser renovar a fragrância.',
  array['Fragrância leve para o dia a dia', 'Frasco de 250 ml', 'Fácil de reaplicar']::text[], '{}'::text[],
  'Borrife a cerca de 15 cm do corpo, após o banho ou sempre que desejar. Evite o rosto.',
  'Uso externo. Produto inflamável: mantenha longe do fogo e do calor. Evite o contato com os olhos e com a pele irritada. Suspenda o uso em caso de irritação.',
  '{}'::text[], array['body splash', 'fragrance mist', 'perfume', 'colônia', 'fragrância', 'victoria''s secret', 'aqua kiss']::text[],
  'published', 'on_request', false, false, 146,
  'Victoria''s Secret Aqua Kiss Fragrance Mist 250 ml', 'Body splash Victoria''s Secret Aqua Kiss, para perfumar o corpo com leveza ao longo do dia.'
),
(
  'victorias-secret-amber-romance-fragrance-mist', 'Victoria''s Secret Amber Romance Fragrance Mist', (select id from b where slug = 'victorias-secret'), '250 ml',
  'Body splash Victoria''s Secret Amber Romance, para perfumar o corpo com leveza ao longo do dia.',
  'O Amber Romance Fragrance Mist é um body splash da Victoria''s Secret em frasco de 250 ml. Ideal para usar após o banho e reaplicar sempre que quiser renovar a fragrância.',
  array['Fragrância leve para o dia a dia', 'Frasco de 250 ml', 'Fácil de reaplicar']::text[], '{}'::text[],
  'Borrife a cerca de 15 cm do corpo, após o banho ou sempre que desejar. Evite o rosto.',
  'Uso externo. Produto inflamável: mantenha longe do fogo e do calor. Evite o contato com os olhos e com a pele irritada. Suspenda o uso em caso de irritação.',
  '{}'::text[], array['body splash', 'fragrance mist', 'perfume', 'colônia', 'fragrância', 'victoria''s secret', 'amber romance']::text[],
  'published', 'on_request', false, false, 147,
  'Victoria''s Secret Amber Romance Fragrance Mist 250 ml', 'Body splash Victoria''s Secret Amber Romance, para perfumar o corpo com leveza ao longo do dia.'
),
(
  'victorias-secret-midnight-bloom-fragrance-mist', 'Victoria''s Secret Midnight Bloom Fragrance Mist', (select id from b where slug = 'victorias-secret'), '250 ml',
  'Body splash Victoria''s Secret Midnight Bloom, para perfumar o corpo com leveza ao longo do dia.',
  'O Midnight Bloom Fragrance Mist é um body splash da Victoria''s Secret em frasco de 250 ml. Ideal para usar após o banho e reaplicar sempre que quiser renovar a fragrância.',
  array['Fragrância leve para o dia a dia', 'Frasco de 250 ml', 'Fácil de reaplicar']::text[], '{}'::text[],
  'Borrife a cerca de 15 cm do corpo, após o banho ou sempre que desejar. Evite o rosto.',
  'Uso externo. Produto inflamável: mantenha longe do fogo e do calor. Evite o contato com os olhos e com a pele irritada. Suspenda o uso em caso de irritação.',
  '{}'::text[], array['body splash', 'fragrance mist', 'perfume', 'colônia', 'fragrância', 'victoria''s secret', 'midnight bloom']::text[],
  'published', 'on_request', false, false, 148,
  'Victoria''s Secret Midnight Bloom Fragrance Mist 250 ml', 'Body splash Victoria''s Secret Midnight Bloom, para perfumar o corpo com leveza ao longo do dia.'
),
(
  'victorias-secret-bombshell-fragrance-mist', 'Victoria''s Secret Bombshell Fragrance Mist', (select id from b where slug = 'victorias-secret'), '250 ml',
  'Body splash Victoria''s Secret Bombshell, para perfumar o corpo com leveza ao longo do dia.',
  'O Bombshell Fragrance Mist é um body splash da Victoria''s Secret em frasco de 250 ml. Ideal para usar após o banho e reaplicar sempre que quiser renovar a fragrância.',
  array['Fragrância leve para o dia a dia', 'Frasco de 250 ml', 'Fácil de reaplicar']::text[], '{}'::text[],
  'Borrife a cerca de 15 cm do corpo, após o banho ou sempre que desejar. Evite o rosto.',
  'Uso externo. Produto inflamável: mantenha longe do fogo e do calor. Evite o contato com os olhos e com a pele irritada. Suspenda o uso em caso de irritação.',
  '{}'::text[], array['body splash', 'fragrance mist', 'perfume', 'colônia', 'fragrância', 'victoria''s secret', 'bombshell']::text[],
  'published', 'on_request', false, false, 149,
  'Victoria''s Secret Bombshell Fragrance Mist 250 ml', 'Body splash Victoria''s Secret Bombshell, para perfumar o corpo com leveza ao longo do dia.'
),
(
  'victorias-secret-tease-fragrance-mist', 'Victoria''s Secret Tease Fragrance Mist', (select id from b where slug = 'victorias-secret'), '250 ml',
  'Body splash Victoria''s Secret Tease, para perfumar o corpo com leveza ao longo do dia.',
  'O Tease Fragrance Mist é um body splash da Victoria''s Secret em frasco de 250 ml. Ideal para usar após o banho e reaplicar sempre que quiser renovar a fragrância.',
  array['Fragrância leve para o dia a dia', 'Frasco de 250 ml', 'Fácil de reaplicar']::text[], '{}'::text[],
  'Borrife a cerca de 15 cm do corpo, após o banho ou sempre que desejar. Evite o rosto.',
  'Uso externo. Produto inflamável: mantenha longe do fogo e do calor. Evite o contato com os olhos e com a pele irritada. Suspenda o uso em caso de irritação.',
  '{}'::text[], array['body splash', 'fragrance mist', 'perfume', 'colônia', 'fragrância', 'victoria''s secret', 'tease']::text[],
  'published', 'on_request', false, false, 150,
  'Victoria''s Secret Tease Fragrance Mist 250 ml', 'Body splash Victoria''s Secret Tease, para perfumar o corpo com leveza ao longo do dia.'
)
on conflict (slug) do nothing;

-- Internal records: acquisition planned, documentation not verified, content to review
insert into public.product_private (product_id, sourcing_status, content_verified, internal_notes)
select p.id, 'planned', false, v.note
  from (values
    ('numbuzin-no9-nad-bio-lifting-sil-essence', 'Catálogo MIVORA 2026, item 05. Foto de referência do catálogo (origem: ulta.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('skin1004-madagascar-centella-hyalu-cica-water-fit-sun-serum', 'Catálogo MIVORA 2026, item 08. Foto de referência do catálogo (origem: pepperyspot.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('lilyeve-grow-turn-exosome-brush-ampoule', 'Catálogo MIVORA 2026, item 09. Foto de referência do catálogo (origem: lilyeve.kr); substituir por imagem oficial ou autorizada quando possível.'),
    ('beauty-of-joseon-revive-eye-serum-ginseng-retinal', 'Catálogo MIVORA 2026, item 10. Foto de referência do catálogo (origem: adorebeauty.com.au); substituir por imagem oficial ou autorizada quando possível.'),
    ('beauty-of-joseon-relief-sun-rice-probiotics', 'Catálogo MIVORA 2026, item 13. Foto de referência do catálogo (origem: glam-moda.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('tirtir-mask-fit-red-cushion', 'Catálogo MIVORA 2026, item 14. Foto de referência do catálogo (origem: magazinuldemakeup.ro); substituir por imagem oficial ou autorizada quando possível. Definir os tons disponíveis (cadastrar como variantes).'),
    ('cosrx-low-ph-good-morning-gel-cleanser', 'Catálogo MIVORA 2026, item 17. Foto de referência do catálogo (origem: glowyskinshop.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('mise-en-scene-perfect-serum-original', 'Catálogo MIVORA 2026, item 19. Foto de referência do catálogo (origem: watsons.com.sg); substituir por imagem oficial ou autorizada quando possível.'),
    ('kerastase-elixir-ultime-lhuile-originale', 'Catálogo MIVORA 2026, item 21. Foto de referência do catálogo (origem: trendencias.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('loreal-professionnel-absolut-repair-shampoo', 'Catálogo MIVORA 2026, item 22. Foto de referência do catálogo (origem: sephora.com.tr); substituir por imagem oficial ou autorizada quando possível.'),
    ('wella-professionals-ultimate-repair-shampoo', 'Catálogo MIVORA 2026, item 23. Foto de referência do catálogo (origem: shop-apotheke.at); substituir por imagem oficial ou autorizada quando possível.'),
    ('olaplex-no3-hair-perfector', 'Catálogo MIVORA 2026, item 24. Foto de referência do catálogo (origem: vivo.co.nz); substituir por imagem oficial ou autorizada quando possível.'),
    ('k18-leave-in-molecular-repair-hair-mask', 'Catálogo MIVORA 2026, item 25. Foto de referência do catálogo (origem: iherb.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('redken-acidic-bonding-concentrate-shampoo', 'Catálogo MIVORA 2026, item 26. Foto de referência do catálogo (origem: blondhairandbeauty.co.uk); substituir por imagem oficial ou autorizada quando possível.'),
    ('moroccanoil-treatment-original', 'Catálogo MIVORA 2026, item 27. Foto de referência do catálogo (origem: melinda.com.br); substituir por imagem oficial ou autorizada quando possível.'),
    ('shiseido-fino-premium-touch-hair-mask', 'Catálogo MIVORA 2026, item 28. Foto de referência do catálogo (origem: princesscosmeticsqa.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('tsubaki-premium-repair-hair-mask', 'Catálogo MIVORA 2026, item 29. Foto de referência do catálogo (origem: multybeauty.com); substituir por imagem oficial ou autorizada quando possível. Foto em baixa resolução (321px): substituir assim que possível.'),
    ('unove-deep-damage-treatment-ex', 'Catálogo MIVORA 2026, item 30. Foto de referência do catálogo (origem: recapbeauty.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('medicube-pdrn-pink-collagen-capsule-cream', 'Catálogo MIVORA 2026, item 31. Foto de referência do catálogo (origem: kosallure.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('medicube-zero-pore-blackhead-mud-mask', 'Catálogo MIVORA 2026, item 33. Foto de referência do catálogo (origem: bloom-and-shine.de); substituir por imagem oficial ou autorizada quando possível.'),
    ('medicube-deep-vita-c-capsule-cream', 'Catálogo MIVORA 2026, item 34. Foto de referência do catálogo (origem: feel22.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('medicube-triple-collagen-serum', 'Catálogo MIVORA 2026, item 35. Foto de referência do catálogo (origem: mdcparis.com.mx); substituir por imagem oficial ou autorizada quando possível.'),
    ('medicube-pdrn-pink-collagen-exosome-shot-7500', 'Catálogo MIVORA 2026, item 36. Foto de referência do catálogo (origem: amarabeauty.com.mx); substituir por imagem oficial ou autorizada quando possível. Confirmar se a fórmula contém espículas (microagulhas). Se sim, incluir advertências de sensibilidade e a tag ''esfoliante'' (assim o site não o sugere junto com retinoides).'),
    ('anua-niacinamide-10-txa-4-dark-spot-correcting-serum', 'Catálogo MIVORA 2026, item 37. Foto de referência do catálogo (origem: buymee.com.br); substituir por imagem oficial ou autorizada quando possível.'),
    ('victorias-secret-bare-vanilla-fragrance-mist', 'Catálogo MIVORA 2026, item 41. Foto de referência do catálogo (origem: perfumedirect.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('victorias-secret-pure-seduction-fragrance-mist', 'Catálogo MIVORA 2026, item 42. Foto de referência do catálogo (origem: yourdiscountchemist.com.au); substituir por imagem oficial ou autorizada quando possível.'),
    ('victorias-secret-love-spell-fragrance-mist', 'Catálogo MIVORA 2026, item 43. Foto de referência do catálogo (origem: benable.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('victorias-secret-velvet-petals-fragrance-mist', 'Catálogo MIVORA 2026, item 44. Foto de referência do catálogo (origem: tuzonamarket.com); substituir por imagem oficial ou autorizada quando possível. Foto em baixa resolução (563px): substituir assim que possível.'),
    ('victorias-secret-coconut-passion-fragrance-mist', 'Catálogo MIVORA 2026, item 45. Foto de referência do catálogo (origem: simple.ripley.com.pe); substituir por imagem oficial ou autorizada quando possível.'),
    ('victorias-secret-aqua-kiss-fragrance-mist', 'Catálogo MIVORA 2026, item 46. Foto de referência do catálogo (origem: simple.ripley.com.pe); substituir por imagem oficial ou autorizada quando possível.'),
    ('victorias-secret-amber-romance-fragrance-mist', 'Catálogo MIVORA 2026, item 47. Foto de referência do catálogo (origem: perfumenz.co.nz); substituir por imagem oficial ou autorizada quando possível.'),
    ('victorias-secret-midnight-bloom-fragrance-mist', 'Catálogo MIVORA 2026, item 48. Foto de referência do catálogo (origem: arzumbeauty.com); substituir por imagem oficial ou autorizada quando possível.'),
    ('victorias-secret-bombshell-fragrance-mist', 'Catálogo MIVORA 2026, item 49. Foto de referência do catálogo (origem: noma.is); substituir por imagem oficial ou autorizada quando possível.'),
    ('victorias-secret-tease-fragrance-mist', 'Catálogo MIVORA 2026, item 50. Foto de referência do catálogo (origem: walmart.com); substituir por imagem oficial ou autorizada quando possível.')
  ) as v(slug, note)
  join public.products p on p.slug = v.slug
on conflict (product_id) do nothing;

-- Notes on registered products that receive a catalogue photo
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 02. Foto de referência do catálogo (origem: celimax.pk); substituir por imagem oficial ou autorizada quando possível.')
 where product_id = (select id from public.products where slug = 'celimax-the-vita-a-retinal-shot')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 06. Foto de referência do catálogo (origem: us.oliveyoung.com); substituir por imagem oficial ou autorizada quando possível.')
 where product_id = (select id from public.products where slug = 'medicube-zero-pore-pad')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 07. Foto de referência do catálogo (origem: koreanskincare.com); substituir por imagem oficial ou autorizada quando possível.')
 where product_id = (select id from public.products where slug = 'medicube-pdrn-pink-peptide-serum')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 11. Foto de referência do catálogo (origem: koreanbeauty.be); substituir por imagem oficial ou autorizada quando possível.')
 where product_id = (select id from public.products where slug = 'cosrx-advanced-snail-96-mucin-power-essence')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 12. Foto de referência do catálogo (origem: kocarebeauty.com); substituir por imagem oficial ou autorizada quando possível.')
 where product_id = (select id from public.products where slug = 'anua-heartleaf-77-soothing-toner')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 15. Foto de referência do catálogo (origem: 28glow.is); substituir por imagem oficial ou autorizada quando possível.')
 where product_id = (select id from public.products where slug = 'laneige-lip-sleeping-mask')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 16. Foto de referência do catálogo (origem: myglowitt.ae); substituir por imagem oficial ou autorizada quando possível.')
 where product_id = (select id from public.products where slug = 'biodance-bio-collagen-real-deep-mask')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 18. Foto de referência do catálogo (origem: faces.ae); substituir por imagem oficial ou autorizada quando possível.')
 where product_id = (select id from public.products where slug = 'skin1004-madagascar-centella-light-cleansing-oil')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 20. Foto de referência do catálogo (origem: kiyoko.com); substituir por imagem oficial ou autorizada quando possível. Foto em baixa resolução (459px): substituir assim que possível.')
 where product_id = (select id from public.products where slug = 'medicube-collagen-jelly-cream')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 32. Foto de referência do catálogo (origem: nykaa.com); substituir por imagem oficial ou autorizada quando possível. Foto em baixa resolução (588px): substituir assim que possível.')
 where product_id = (select id from public.products where slug = 'medicube-collagen-night-wrapping-mask')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 38. Foto de referência do catálogo (origem: chemistwarehouse.ae); substituir por imagem oficial ou autorizada quando possível.')
 where product_id = (select id from public.products where slug = 'dr-althea-147-barrier-cream')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 39. Foto de referência do catálogo (origem: skinsation.com.au); substituir por imagem oficial ou autorizada quando possível.')
 where product_id = (select id from public.products where slug = 'torriden-dive-in-low-molecular-hyaluronic-acid-serum')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;
update public.product_private set internal_notes = concat_ws(E'\n', internal_notes, 'Catálogo MIVORA 2026, item 40. Foto de referência do catálogo (origem: koreanbeauty.pt); substituir por imagem oficial ou autorizada quando possível.')
 where product_id = (select id from public.products where slug = 'round-lab-1025-dokdo-toner')
   and position('Catálogo MIVORA 2026' in coalesce(internal_notes, '')) = 0;

-- Category links
with links(product_slug, category_slug) as (values
  ('numbuzin-no9-nad-bio-lifting-sil-essence', 'seruns-antissinais'),
  ('numbuzin-no9-nad-bio-lifting-sil-essence', 'firmeza-e-linhas-finas'),
  ('numbuzin-no9-nad-bio-lifting-sil-essence', 'hidratacao'),
  ('skin1004-madagascar-centella-hyalu-cica-water-fit-sun-serum', 'protecao-solar'),
  ('skin1004-madagascar-centella-hyalu-cica-water-fit-sun-serum', 'hidratacao'),
  ('skin1004-madagascar-centella-hyalu-cica-water-fit-sun-serum', 'pele-sensivel'),
  ('lilyeve-grow-turn-exosome-brush-ampoule', 'tratamentos-capilares'),
  ('beauty-of-joseon-revive-eye-serum-ginseng-retinal', 'cuidados-com-os-olhos'),
  ('beauty-of-joseon-revive-eye-serum-ginseng-retinal', 'tratamentos-com-retinoides'),
  ('beauty-of-joseon-revive-eye-serum-ginseng-retinal', 'area-dos-olhos'),
  ('beauty-of-joseon-revive-eye-serum-ginseng-retinal', 'firmeza-e-linhas-finas'),
  ('beauty-of-joseon-relief-sun-rice-probiotics', 'protecao-solar'),
  ('beauty-of-joseon-relief-sun-rice-probiotics', 'hidratacao'),
  ('tirtir-mask-fit-red-cushion', 'bases-e-cushions'),
  ('cosrx-low-ph-good-morning-gel-cleanser', 'geis-de-limpeza'),
  ('cosrx-low-ph-good-morning-gel-cleanser', 'limpeza-facial'),
  ('mise-en-scene-perfect-serum-original', 'oleos-e-seruns-capilares'),
  ('kerastase-elixir-ultime-lhuile-originale', 'oleos-e-seruns-capilares'),
  ('loreal-professionnel-absolut-repair-shampoo', 'shampoos'),
  ('wella-professionals-ultimate-repair-shampoo', 'shampoos'),
  ('olaplex-no3-hair-perfector', 'tratamentos-capilares'),
  ('k18-leave-in-molecular-repair-hair-mask', 'tratamentos-capilares'),
  ('k18-leave-in-molecular-repair-hair-mask', 'mascaras-capilares'),
  ('redken-acidic-bonding-concentrate-shampoo', 'shampoos'),
  ('moroccanoil-treatment-original', 'oleos-e-seruns-capilares'),
  ('shiseido-fino-premium-touch-hair-mask', 'mascaras-capilares'),
  ('tsubaki-premium-repair-hair-mask', 'mascaras-capilares'),
  ('unove-deep-damage-treatment-ex', 'mascaras-capilares'),
  ('medicube-pdrn-pink-collagen-capsule-cream', 'cremes-faciais'),
  ('medicube-pdrn-pink-collagen-capsule-cream', 'hidratacao'),
  ('medicube-pdrn-pink-collagen-capsule-cream', 'firmeza-e-linhas-finas'),
  ('medicube-pdrn-pink-collagen-capsule-cream', 'luminosidade'),
  ('medicube-zero-pore-blackhead-mud-mask', 'mascaras-de-argila'),
  ('medicube-zero-pore-blackhead-mud-mask', 'cuidados-para-poros'),
  ('medicube-zero-pore-blackhead-mud-mask', 'poros-e-oleosidade'),
  ('medicube-deep-vita-c-capsule-cream', 'cremes-faciais'),
  ('medicube-deep-vita-c-capsule-cream', 'cuidados-para-manchas'),
  ('medicube-deep-vita-c-capsule-cream', 'luminosidade'),
  ('medicube-deep-vita-c-capsule-cream', 'aparencia-de-manchas'),
  ('medicube-triple-collagen-serum', 'seruns-hidratantes'),
  ('medicube-triple-collagen-serum', 'seruns-antissinais'),
  ('medicube-triple-collagen-serum', 'hidratacao'),
  ('medicube-triple-collagen-serum', 'firmeza-e-linhas-finas'),
  ('medicube-pdrn-pink-collagen-exosome-shot-7500', 'seruns-antissinais'),
  ('medicube-pdrn-pink-collagen-exosome-shot-7500', 'firmeza-e-linhas-finas'),
  ('medicube-pdrn-pink-collagen-exosome-shot-7500', 'luminosidade'),
  ('anua-niacinamide-10-txa-4-dark-spot-correcting-serum', 'seruns-iluminadores'),
  ('anua-niacinamide-10-txa-4-dark-spot-correcting-serum', 'cuidados-para-manchas'),
  ('anua-niacinamide-10-txa-4-dark-spot-correcting-serum', 'aparencia-de-manchas'),
  ('anua-niacinamide-10-txa-4-dark-spot-correcting-serum', 'luminosidade'),
  ('anua-niacinamide-10-txa-4-dark-spot-correcting-serum', 'poros-e-oleosidade'),
  ('victorias-secret-bare-vanilla-fragrance-mist', 'body-splash'),
  ('victorias-secret-pure-seduction-fragrance-mist', 'body-splash'),
  ('victorias-secret-love-spell-fragrance-mist', 'body-splash'),
  ('victorias-secret-velvet-petals-fragrance-mist', 'body-splash'),
  ('victorias-secret-coconut-passion-fragrance-mist', 'body-splash'),
  ('victorias-secret-aqua-kiss-fragrance-mist', 'body-splash'),
  ('victorias-secret-amber-romance-fragrance-mist', 'body-splash'),
  ('victorias-secret-midnight-bloom-fragrance-mist', 'body-splash'),
  ('victorias-secret-bombshell-fragrance-mist', 'body-splash'),
  ('victorias-secret-tease-fragrance-mist', 'body-splash')
)
insert into public.product_categories (product_id, category_id)
select p.id, c.id from links l
  join public.products p on p.slug = l.product_slug
  join public.categories c on c.slug = l.category_slug
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Photos (served from /public/products). Only for products without any photo.
-- ---------------------------------------------------------------------------
with imgs(slug, url, alt, w, h) as (values
  ('celimax-the-vita-a-retinal-shot', '/products/celimax-the-vita-a-retinal-shot.webp', 'celimax-the-vita-a-retinal-shot — embalagem', 800, 800),
  ('medicube-zero-pore-pad', '/products/medicube-zero-pore-pad.webp', 'medicube-zero-pore-pad — embalagem', 945, 945),
  ('medicube-pdrn-pink-peptide-serum', '/products/medicube-pdrn-pink-peptide-serum.webp', 'medicube-pdrn-pink-peptide-serum — embalagem', 887, 887),
  ('cosrx-advanced-snail-96-mucin-power-essence', '/products/cosrx-advanced-snail-96-mucin-power-essence.webp', 'cosrx-advanced-snail-96-mucin-power-essence — embalagem', 925, 925),
  ('anua-heartleaf-77-soothing-toner', '/products/anua-heartleaf-77-soothing-toner.webp', 'anua-heartleaf-77-soothing-toner — embalagem', 1200, 1200),
  ('laneige-lip-sleeping-mask', '/products/laneige-lip-sleeping-mask.webp', 'laneige-lip-sleeping-mask — embalagem', 892, 892),
  ('biodance-bio-collagen-real-deep-mask', '/products/biodance-bio-collagen-real-deep-mask.webp', 'biodance-bio-collagen-real-deep-mask — embalagem', 832, 832),
  ('skin1004-madagascar-centella-light-cleansing-oil', '/products/skin1004-madagascar-centella-light-cleansing-oil.webp', 'skin1004-madagascar-centella-light-cleansing-oil — embalagem', 800, 800),
  ('medicube-collagen-jelly-cream', '/products/medicube-collagen-jelly-cream.webp', 'medicube-collagen-jelly-cream — embalagem', 459, 459),
  ('medicube-collagen-night-wrapping-mask', '/products/medicube-collagen-night-wrapping-mask.webp', 'medicube-collagen-night-wrapping-mask — embalagem', 588, 588),
  ('dr-althea-147-barrier-cream', '/products/dr-althea-147-barrier-cream.webp', 'dr-althea-147-barrier-cream — embalagem', 1094, 1094),
  ('torriden-dive-in-low-molecular-hyaluronic-acid-serum', '/products/torriden-dive-in-low-molecular-hyaluronic-acid-serum.webp', 'torriden-dive-in-low-molecular-hyaluronic-acid-serum — embalagem', 962, 962),
  ('round-lab-1025-dokdo-toner', '/products/round-lab-1025-dokdo-toner.webp', 'round-lab-1025-dokdo-toner — embalagem', 1016, 1016),
  ('numbuzin-no9-nad-bio-lifting-sil-essence', '/products/numbuzin-no9-nad-bio-lifting-sil-essence.webp', 'Numbuzin No.9 NAD+ Bio Lifting-Sil Essence — embalagem', 655, 655),
  ('skin1004-madagascar-centella-hyalu-cica-water-fit-sun-serum', '/products/skin1004-madagascar-centella-hyalu-cica-water-fit-sun-serum.webp', 'SKIN1004 Madagascar Centella Hyalu-Cica Water-Fit Sun Serum SPF50+ — embalagem', 1038, 1038),
  ('lilyeve-grow-turn-exosome-brush-ampoule', '/products/lilyeve-grow-turn-exosome-brush-ampoule.webp', 'Lilyeve Grow:Turn Exosome Brush Ampoule — embalagem', 808, 808),
  ('beauty-of-joseon-revive-eye-serum-ginseng-retinal', '/products/beauty-of-joseon-revive-eye-serum-ginseng-retinal.webp', 'Beauty of Joseon Revive Eye Serum: Ginseng + Retinal — embalagem', 655, 655),
  ('beauty-of-joseon-relief-sun-rice-probiotics', '/products/beauty-of-joseon-relief-sun-rice-probiotics.webp', 'Beauty of Joseon Relief Sun: Rice + Probiotics SPF50+ — embalagem', 1080, 1080),
  ('tirtir-mask-fit-red-cushion', '/products/tirtir-mask-fit-red-cushion.webp', 'TIRTIR Mask Fit Red Cushion — embalagem', 1200, 1200),
  ('cosrx-low-ph-good-morning-gel-cleanser', '/products/cosrx-low-ph-good-morning-gel-cleanser.webp', 'COSRX Low pH Good Morning Gel Cleanser — embalagem', 1063, 1063),
  ('mise-en-scene-perfect-serum-original', '/products/mise-en-scene-perfect-serum-original.webp', 'Mise en Scène Perfect Serum Original — embalagem', 927, 927),
  ('kerastase-elixir-ultime-lhuile-originale', '/products/kerastase-elixir-ultime-lhuile-originale.webp', 'Kérastase Elixir Ultime L''Huile Originale — embalagem', 1125, 1125),
  ('loreal-professionnel-absolut-repair-shampoo', '/products/loreal-professionnel-absolut-repair-shampoo.webp', 'L''Oréal Professionnel Absolut Repair Shampoo — embalagem', 1200, 1200),
  ('wella-professionals-ultimate-repair-shampoo', '/products/wella-professionals-ultimate-repair-shampoo.webp', 'Wella Professionals Ultimate Repair Shampoo — embalagem', 1152, 1152),
  ('olaplex-no3-hair-perfector', '/products/olaplex-no3-hair-perfector.webp', 'Olaplex Nº 3 Hair Perfector — embalagem', 688, 688),
  ('k18-leave-in-molecular-repair-hair-mask', '/products/k18-leave-in-molecular-repair-hair-mask.webp', 'K18 Leave-In Molecular Repair Hair Mask — embalagem', 904, 904),
  ('redken-acidic-bonding-concentrate-shampoo', '/products/redken-acidic-bonding-concentrate-shampoo.webp', 'Redken Acidic Bonding Concentrate Shampoo — embalagem', 1200, 1200),
  ('moroccanoil-treatment-original', '/products/moroccanoil-treatment-original.webp', 'Moroccanoil Treatment Original — embalagem', 1200, 1200),
  ('shiseido-fino-premium-touch-hair-mask', '/products/shiseido-fino-premium-touch-hair-mask.webp', 'Shiseido Fino Premium Touch Hair Mask — embalagem', 1200, 1200),
  ('tsubaki-premium-repair-hair-mask', '/products/tsubaki-premium-repair-hair-mask.webp', 'Tsubaki Premium Repair Hair Mask — embalagem', 321, 321),
  ('unove-deep-damage-treatment-ex', '/products/unove-deep-damage-treatment-ex.webp', 'UNOVE Deep Damage Treatment EX — embalagem', 1080, 1080),
  ('medicube-pdrn-pink-collagen-capsule-cream', '/products/medicube-pdrn-pink-collagen-capsule-cream.webp', 'Medicube PDRN Pink Collagen Capsule Cream — embalagem', 655, 655),
  ('medicube-zero-pore-blackhead-mud-mask', '/products/medicube-zero-pore-blackhead-mud-mask.webp', 'Medicube Zero Pore Blackhead Mud Mask — embalagem', 1200, 1200),
  ('medicube-deep-vita-c-capsule-cream', '/products/medicube-deep-vita-c-capsule-cream.webp', 'Medicube Deep Vita C Capsule Cream — embalagem', 709, 709),
  ('medicube-triple-collagen-serum', '/products/medicube-triple-collagen-serum.webp', 'Medicube Triple Collagen Serum — embalagem', 1109, 1109),
  ('medicube-pdrn-pink-collagen-exosome-shot-7500', '/products/medicube-pdrn-pink-collagen-exosome-shot-7500.webp', 'Medicube PDRN Pink Collagen Exosome Shot 7500 — embalagem', 648, 648),
  ('anua-niacinamide-10-txa-4-dark-spot-correcting-serum', '/products/anua-niacinamide-10-txa-4-dark-spot-correcting-serum.webp', 'Anua Niacinamide 10% + TXA 4% Dark Spot Correcting Serum — embalagem', 955, 955),
  ('victorias-secret-bare-vanilla-fragrance-mist', '/products/victorias-secret-bare-vanilla-fragrance-mist.webp', 'Victoria''s Secret Bare Vanilla Fragrance Mist — embalagem', 1035, 1035),
  ('victorias-secret-pure-seduction-fragrance-mist', '/products/victorias-secret-pure-seduction-fragrance-mist.webp', 'Victoria''s Secret Pure Seduction Fragrance Mist — embalagem', 1200, 1200),
  ('victorias-secret-love-spell-fragrance-mist', '/products/victorias-secret-love-spell-fragrance-mist.webp', 'Victoria''s Secret Love Spell Fragrance Mist — embalagem', 1200, 1200),
  ('victorias-secret-velvet-petals-fragrance-mist', '/products/victorias-secret-velvet-petals-fragrance-mist.webp', 'Victoria''s Secret Velvet Petals Fragrance Mist — embalagem', 563, 563),
  ('victorias-secret-coconut-passion-fragrance-mist', '/products/victorias-secret-coconut-passion-fragrance-mist.webp', 'Victoria''s Secret Coconut Passion Fragrance Mist — embalagem', 1119, 1119),
  ('victorias-secret-aqua-kiss-fragrance-mist', '/products/victorias-secret-aqua-kiss-fragrance-mist.webp', 'Victoria''s Secret Aqua Kiss Fragrance Mist — embalagem', 1037, 1037),
  ('victorias-secret-amber-romance-fragrance-mist', '/products/victorias-secret-amber-romance-fragrance-mist.webp', 'Victoria''s Secret Amber Romance Fragrance Mist — embalagem', 807, 807),
  ('victorias-secret-midnight-bloom-fragrance-mist', '/products/victorias-secret-midnight-bloom-fragrance-mist.webp', 'Victoria''s Secret Midnight Bloom Fragrance Mist — embalagem', 1200, 1200),
  ('victorias-secret-bombshell-fragrance-mist', '/products/victorias-secret-bombshell-fragrance-mist.webp', 'Victoria''s Secret Bombshell Fragrance Mist — embalagem', 916, 916),
  ('victorias-secret-tease-fragrance-mist', '/products/victorias-secret-tease-fragrance-mist.webp', 'Victoria''s Secret Tease Fragrance Mist — embalagem', 786, 786)
)
insert into public.product_images (product_id, url, alt, width, height, sort_order, is_primary)
select p.id, i.url, coalesce(nullif(p.name, ''), i.alt) || ' — embalagem', i.w, i.h, 0, true
  from imgs i join public.products p on p.slug = i.slug
 where not exists (select 1 from public.product_images x where x.product_id = p.id);

update public.products set media_pending = false
 where media_pending and slug in ('celimax-the-vita-a-retinal-shot', 'medicube-zero-pore-pad', 'medicube-pdrn-pink-peptide-serum', 'cosrx-advanced-snail-96-mucin-power-essence', 'anua-heartleaf-77-soothing-toner', 'laneige-lip-sleeping-mask', 'biodance-bio-collagen-real-deep-mask', 'skin1004-madagascar-centella-light-cleansing-oil', 'medicube-collagen-jelly-cream', 'medicube-collagen-night-wrapping-mask', 'dr-althea-147-barrier-cream', 'torriden-dive-in-low-molecular-hyaluronic-acid-serum', 'round-lab-1025-dokdo-toner', 'numbuzin-no9-nad-bio-lifting-sil-essence', 'skin1004-madagascar-centella-hyalu-cica-water-fit-sun-serum', 'lilyeve-grow-turn-exosome-brush-ampoule', 'beauty-of-joseon-revive-eye-serum-ginseng-retinal', 'beauty-of-joseon-relief-sun-rice-probiotics', 'tirtir-mask-fit-red-cushion', 'cosrx-low-ph-good-morning-gel-cleanser', 'mise-en-scene-perfect-serum-original', 'kerastase-elixir-ultime-lhuile-originale', 'loreal-professionnel-absolut-repair-shampoo', 'wella-professionals-ultimate-repair-shampoo', 'olaplex-no3-hair-perfector', 'k18-leave-in-molecular-repair-hair-mask', 'redken-acidic-bonding-concentrate-shampoo', 'moroccanoil-treatment-original', 'shiseido-fino-premium-touch-hair-mask', 'tsubaki-premium-repair-hair-mask', 'unove-deep-damage-treatment-ex', 'medicube-pdrn-pink-collagen-capsule-cream', 'medicube-zero-pore-blackhead-mud-mask', 'medicube-deep-vita-c-capsule-cream', 'medicube-triple-collagen-serum', 'medicube-pdrn-pink-collagen-exosome-shot-7500', 'anua-niacinamide-10-txa-4-dark-spot-correcting-serum', 'victorias-secret-bare-vanilla-fragrance-mist', 'victorias-secret-pure-seduction-fragrance-mist', 'victorias-secret-love-spell-fragrance-mist', 'victorias-secret-velvet-petals-fragrance-mist', 'victorias-secret-coconut-passion-fragrance-mist', 'victorias-secret-aqua-kiss-fragrance-mist', 'victorias-secret-amber-romance-fragrance-mist', 'victorias-secret-midnight-bloom-fragrance-mist', 'victorias-secret-bombshell-fragrance-mist', 'victorias-secret-tease-fragrance-mist')
   and exists (select 1 from public.product_images x where x.product_id = products.id);

-- ---------------------------------------------------------------------------
-- Dashboard: "Sob consulta" counted apart from "Esgotados"
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  select jsonb_build_object(
    'products_total', (select count(*) from public.products where status <> 'archived'),
    'products_published', (select count(*) from public.products where status = 'published'),
    'products_draft', (select count(*) from public.products where status = 'draft'),
    'products_available', (select count(*) from public.products where status = 'published' and is_available),
    'products_coming_soon', (select count(*) from public.products where status <> 'archived' and availability = 'coming_soon'),
    'products_unavailable', (select count(*) from public.products where status = 'published' and availability = 'out_of_stock'),
    'products_on_request', (select count(*) from public.products where status = 'published' and availability = 'on_request'),
    'products_low_stock', (select count(*) from public.products where status <> 'archived' and track_inventory
                             and coalesce(stock_quantity, 0) - reserved_quantity <= low_stock_threshold),
    'products_without_price', (select count(*) from public.products where status = 'published' and availability = 'in_stock' and price_cents is null),
    'products_media_pending', (select count(*) from public.products p where status <> 'archived'
                                 and (media_pending or not exists (select 1 from public.product_images i where i.product_id = p.id))),
    'products_content_unverified', (select count(*) from public.product_private pp join public.products p on p.id = pp.product_id
                                      where p.status <> 'archived' and not pp.content_verified),
    'products_compliance_pending', (select count(*) from public.product_private pp join public.products p on p.id = pp.product_id
                                      where p.status <> 'archived' and pp.regulatory_status <> 'verified'),
    'orders_started', (select count(*) from public.order_intents where status in ('started', 'awaiting_contact', 'negotiating')),
    'orders_started_30d', (select count(*) from public.order_intents where created_at > now() - interval '30 days'),
    'orders_confirmed', (select count(*) from public.order_intents where status = 'confirmed'),
    'orders_completed', (select count(*) from public.order_intents where status = 'completed'),
    'sales_completed_cents', (select coalesce(sum(subtotal_cents - discount_cents), 0) from public.order_intents where status = 'completed'),
    'sales_completed_30d_cents', (select coalesce(sum(subtotal_cents - discount_cents), 0) from public.order_intents
                                    where status = 'completed' and completed_at > now() - interval '30 days'),
    'top_cart_products', coalesce((
      select jsonb_agg(t) from (
        select p.id, p.name, count(*)::integer as adds
          from public.cart_events e join public.products p on p.id = e.product_id
         where e.created_at > now() - interval '90 days'
         group by p.id, p.name order by adds desc limit 5) t), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;
