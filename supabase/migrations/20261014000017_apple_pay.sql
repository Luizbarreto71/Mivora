-- MIVORA — Apple Pay through Mercado Pago (Checkout Transparente / Orders API), owner's request 2026-10-14.
-- Ships switched off. Needs the account enabled by Mercado Pago's commercial team, an Apple Developer
-- merchant ID with the domain verified, and the certificates registered at Mercado Pago.
-- Only public identifiers live here (store_settings is readable by visitors); the access token stays
-- in the server environment. The buyer's CPF, required by Mercado Pago for this payment, is sent to
-- Mercado Pago and never stored by the store. Re-runnable.

alter table public.store_settings
  add column if not exists apple_pay_enabled boolean not null default false,
  -- Merchant ID registered at Apple Developer, e.g. merchant.br.com.mivoracosmeticos
  add column if not exists apple_pay_merchant_id text
    check (apple_pay_merchant_id is null or apple_pay_merchant_id ~ '^merchant\.[A-Za-z0-9][A-Za-z0-9.-]{1,120}$'),
  -- certificate_id of the merchant identity certificate generated through Mercado Pago
  add column if not exists apple_pay_certificate_id text
    check (apple_pay_certificate_id is null or apple_pay_certificate_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  -- X-Product-ID header informed by Mercado Pago for the Apple Pay integration
  add column if not exists apple_pay_product_id text
    check (apple_pay_product_id is null or apple_pay_product_id ~ '^[A-Za-z0-9_.-]{1,120}$'),
  -- Mercado Pago public key (meant to be public; used in the Apple Pay session and tokenization calls).
  -- The exact public-key format keeps an access token (secret, also APP_USR-…) from being saved here by mistake.
  add column if not exists mercadopago_public_key text
    check (mercadopago_public_key is null or mercadopago_public_key ~ '^(APP_USR|TEST)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  -- content of Apple's domain verification file, served at /.well-known/apple-developer-merchantid-domain-association(.txt)
  add column if not exists apple_pay_domain_association text
    check (apple_pay_domain_association is null or (length(apple_pay_domain_association) <= 20000 and apple_pay_domain_association !~ '[<>]'));

-- Privacy policy: CPF for Apple Pay
update public.pages
   set body = body || E'\n\n## Apple Pay\n\nQuando você paga com Apple Pay, o pagamento é processado pelo Mercado Pago e autorizado no seu aparelho (Face ID ou Touch ID). Para esse tipo de pagamento, o Mercado Pago exige o seu CPF: ele é enviado ao Mercado Pago junto com o pagamento e não fica salvo na MIVORA. A loja não recebe os dados do seu cartão.'
 where slug = 'politica-de-privacidade' and position('## Apple Pay' in body) = 0;
