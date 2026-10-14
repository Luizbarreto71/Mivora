-- MIVORA — mandatory customer registration before buying (lead capture), owner's request 2026-10-13.
-- No password: name, WhatsApp and e-mail are required to finish an order; marketing is opt-in.
-- Customers are written only through SECURITY DEFINER functions; visitors never read them. Re-runnable.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  email text not null unique check (email = lower(email) and length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone text not null check (phone ~ '^[0-9]{10,11}$'),
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  source text not null default 'site' check (length(source) <= 40),
  cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  city text check (city is null or length(city) <= 80),
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  orders_count integer not null default 0,
  last_order_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_created_at_idx on public.customers (created_at desc);
alter table public.customers enable row level security;
drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
drop policy if exists "admin read customers" on public.customers;
create policy "admin read customers" on public.customers for select to authenticated using (public.is_admin());
drop policy if exists "admin update customers" on public.customers;
create policy "admin update customers" on public.customers for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin delete customers" on public.customers;
create policy "admin delete customers" on public.customers for delete to authenticated using (public.is_admin());

alter table public.order_intents add column if not exists customer_id uuid references public.customers (id) on delete set null;
create index if not exists order_intents_customer_idx on public.order_intents (customer_id);

-- Internal: validates and creates/updates a customer by e-mail. p_marketing null keeps the previous choice.
create or replace function public.upsert_customer(p_name text, p_email text, p_phone text, p_marketing boolean, p_source text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_name text := nullif(left(regexp_replace(trim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'), 120), '');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_id uuid;
  v_recent integer;
begin
  if v_name is null or length(v_name) < 2 then raise exception 'invalid_name'; end if;
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_email'; end if;
  -- Brazilian number with area code (10 or 11 digits), optionally prefixed by the country code
  if v_phone ~ '^55[0-9]{10,11}$' then v_phone := substr(v_phone, 3); end if;
  if v_phone !~ '^[0-9]{10,11}$' then raise exception 'invalid_phone'; end if;
  -- coarse flood protection
  select count(*) into v_recent from public.customers where updated_at > now() - interval '1 minute';
  if v_recent >= 60 then raise exception 'rate_limited'; end if;

  insert into public.customers (name, email, phone, marketing_consent, marketing_consent_at, source)
  values (v_name, v_email, v_phone, coalesce(p_marketing, false), case when p_marketing then now() end,
          left(coalesce(nullif(trim(p_source), ''), 'site'), 40))
  on conflict (email) do nothing
  returning id into v_id;
  if v_id is null then
    update public.customers c
       set name = v_name,
           phone = v_phone,
           marketing_consent = coalesce(p_marketing, c.marketing_consent),
           marketing_consent_at = case when p_marketing is true and not c.marketing_consent then now()
                                       when p_marketing is false then null
                                       else c.marketing_consent_at end,
           updated_at = now()
     where c.email = v_email
    returning c.id into v_id;
  end if;
  if p_marketing is true then
    insert into public.newsletter_subscribers (email, source) values (v_email, 'cadastro') on conflict (email) do nothing;
  end if;
  return v_id;
end $$;
revoke all on function public.upsert_customer(text, text, text, boolean, text) from public, anon, authenticated;

-- Public: the registration form (checkout or "Minha conta"). Same answer for new and existing e-mails.
create or replace function public.register_customer(p_name text, p_email text, p_phone text, p_marketing boolean default false, p_source text default 'site')
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform public.upsert_customer(p_name, p_email, p_phone, coalesce(p_marketing, false), p_source);
  return 'ok';
end $$;
revoke all on function public.register_customer(text, text, text, boolean, text) from public;
grant execute on function public.register_customer(text, text, text, boolean, text) to anon, authenticated;

-- create_order_intent now requires p_customer {name, email, phone, marketing?} and links the order to it.
drop function if exists public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb);
create or replace function public.create_order_intent(
  p_items jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_notes text default null,
  p_delivery_zone_id uuid default null,
  p_coupon_code text default null,
  p_shipping jsonb default null,
  p_customer jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_qty integer;
  v_product record;
  v_variant public.product_variants;
  v_variant_id uuid;
  v_kit public.kits;
  v_order public.order_intents;
  v_zone public.delivery_zones;
  v_lines jsonb := '[]'::jsonb;
  v_subtotal integer := 0;
  v_unpriced boolean := false;
  v_count integer := 0;
  v_unit integer;
  v_name text;
  v_brand text;
  v_code text;
  v_available integer;
  v_sort integer := 0;
  v_recent integer;
  v_fee integer;
  v_settings public.store_settings;
  v_coupon text;
  v_discount integer := 0;
  v_phone text;
  v_ship_cep text;
  v_ship_city text;
  v_ship_uf text;
  v_ship_service text;
  v_ship_estimate text;
  v_ship_fee integer;
  v_carrier boolean := false;
  v_customer_id uuid;
  v_customer_name text;
  v_customer_phone text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'empty_cart'; end if;
  if jsonb_array_length(p_items) > 60 then raise exception 'too_many_items'; end if;

  -- coarse global flood protection
  select count(*) into v_recent from public.order_intents where created_at > now() - interval '1 minute';
  if v_recent >= 60 then raise exception 'rate_limited'; end if;

  -- mandatory registration (lead capture): every order belongs to a registered customer
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then raise exception 'customer_required'; end if;
  v_customer_id := public.upsert_customer(
    p_customer ->> 'name', p_customer ->> 'email', p_customer ->> 'phone',
    case when p_customer ? 'marketing' then (p_customer ->> 'marketing')::boolean end, 'checkout');
  select c.name, c.phone into v_customer_name, v_customer_phone from public.customers c where c.id = v_customer_id;

  if p_delivery_zone_id is not null then
    select * into v_zone from public.delivery_zones where id = p_delivery_zone_id and is_active;
    if not found then raise exception 'invalid_delivery_zone'; end if;
  end if;

  -- destination informed by the shipping calculator (and, for carriers, the quoted service)
  if p_shipping is not null then
    if jsonb_typeof(p_shipping) <> 'object' then raise exception 'invalid_shipping'; end if;
    v_ship_cep := nullif(regexp_replace(coalesce(p_shipping ->> 'cep', ''), '[^0-9]', '', 'g'), '');
    if v_ship_cep is not null and length(v_ship_cep) <> 8 then raise exception 'invalid_cep'; end if;
    v_ship_city := nullif(left(trim(p_shipping ->> 'city'), 80), '');
    v_ship_uf := nullif(upper(left(trim(p_shipping ->> 'uf'), 2)), '');
    if p_delivery_zone_id is null and nullif(trim(p_shipping ->> 'service'), '') is not null then
      if v_ship_cep is null then raise exception 'invalid_cep'; end if;
      v_carrier := true;
      v_ship_service := left(trim(p_shipping ->> 'service'), 80);
      v_ship_estimate := nullif(left(trim(p_shipping ->> 'estimate'), 80), '');
      if coalesce(p_shipping ->> 'fee_cents', '') !~ '^[0-9]{1,6}$' then raise exception 'invalid_shipping'; end if;
      v_ship_fee := (p_shipping ->> 'fee_cents')::integer;
    end if;
  end if;
  -- a zone restricted to CEP ranges or cities must cover the destination
  if v_zone.id is not null and v_ship_cep is not null
     and not public.delivery_zone_covers(v_zone.id, v_ship_cep, v_ship_city, v_ship_uf) then
    raise exception 'delivery_zone_unavailable';
  end if;

  -- the delivery destination also completes the customer's record
  if v_ship_cep is not null then
    update public.customers set cep = v_ship_cep, city = coalesce(v_ship_city, city), uf = coalesce(v_ship_uf, uf) where id = v_customer_id;
  end if;

  insert into public.order_intents (status, source, customer_id, customer_name, customer_phone, customer_notes, delivery_zone_id, delivery_method,
                                    shipping_cep, shipping_city, shipping_uf, shipping_service, shipping_estimate)
  values ('started', 'site',
          v_customer_id,
          v_customer_name,
          v_customer_phone,
          nullif(left(trim(p_customer_notes), 1000), ''),
          v_zone.id,
          case when v_carrier then 'shipping'::public.delivery_method else coalesce(v_zone.method, 'to_arrange') end,
          v_ship_cep, v_ship_city, v_ship_uf,
          case when v_carrier then v_ship_service else v_zone.name end,
          case when v_carrier then v_ship_estimate else v_zone.estimate end)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'invalid_quantity'; end if;

    if nullif(v_item ->> 'kit_id', '') is not null then
      select * into v_kit from public.kits where id = (v_item ->> 'kit_id')::uuid and status = 'published';
      if not found then raise exception 'item_unavailable'; end if;
      -- every component must be purchasable in the requested amount
      if exists (
        select 1 from public.kit_items ki join public.products p on p.id = ki.product_id
         where ki.kit_id = v_kit.id
           and (p.status <> 'published' or not p.is_available
                or (p.track_inventory and coalesce(p.stock_quantity, 0) - p.reserved_quantity < ki.quantity * v_qty))
      ) or not exists (select 1 from public.kit_items ki where ki.kit_id = v_kit.id) then
        raise exception 'item_unavailable:%', v_kit.name;
      end if;
      v_unit := v_kit.price_cents;
      v_name := 'Kit ' || v_kit.name;
      v_brand := null;
      v_code := null;
      insert into public.order_intent_items (order_id, kit_id, name_snapshot, brand_snapshot, unit_price_cents, quantity, line_total_cents, sort_order)
      values (v_order.id, v_kit.id, v_name, v_brand, v_unit, v_qty, v_unit * v_qty, v_sort);
    else
      select p.*, b.name as brand_name into v_product
        from public.products p join public.brands b on b.id = p.brand_id
       where p.id = (v_item ->> 'product_id')::uuid and p.status = 'published';
      if not found then raise exception 'item_unavailable'; end if;

      v_unit := v_product.price_cents;
      v_name := v_product.name;
      v_brand := v_product.brand_name;
      v_code := v_product.code;
      v_variant_id := nullif(v_item ->> 'variant_id', '')::uuid;

      if v_variant_id is not null then
        select * into v_variant from public.product_variants
         where id = v_variant_id and product_id = v_product.id and is_active;
        if not found then raise exception 'item_unavailable:%', v_product.name; end if;
        if v_product.availability <> 'in_stock' then raise exception 'item_unavailable:%', v_product.name; end if;
        if v_variant.track_inventory then
          v_available := coalesce(v_variant.stock_quantity, 0) - v_variant.reserved_quantity;
          if v_available < v_qty then raise exception 'insufficient_stock:%', v_product.name; end if;
        elsif not v_product.is_available then
          raise exception 'item_unavailable:%', v_product.name;
        end if;
        v_unit := coalesce(v_variant.price_cents, v_product.price_cents);
        v_name := v_product.name || ' — ' || v_variant.name;
      else
        if not v_product.is_available then raise exception 'item_unavailable:%', v_product.name; end if;
        if v_product.track_inventory then
          v_available := coalesce(v_product.stock_quantity, 0) - v_product.reserved_quantity;
          if v_available < v_qty then raise exception 'insufficient_stock:%', v_product.name; end if;
        end if;
      end if;

      insert into public.order_intent_items (order_id, product_id, variant_id, name_snapshot, brand_snapshot, unit_price_cents, quantity, line_total_cents, sort_order)
      values (v_order.id, v_product.id, v_variant_id, v_name, v_brand, v_unit, v_qty, v_unit * v_qty, v_sort);
    end if;

    if v_unit is null then
      v_unpriced := true;
    else
      v_subtotal := v_subtotal + v_unit * v_qty;
    end if;
    v_count := v_count + v_qty;
    v_lines := v_lines || jsonb_build_object(
      'name', v_name, 'brand', v_brand, 'code', v_code, 'quantity', v_qty,
      'unit_price_cents', v_unit, 'line_total_cents', case when v_unit is null then null else v_unit * v_qty end);
    v_sort := v_sort + 1;
  end loop;

  -- store-wide minimum order (only enforceable when every item has a price)
  if not v_unpriced and v_subtotal < coalesce((select s.minimum_order_cents from public.store_settings s where s.id = 1), 0) then
    raise exception 'below_minimum_order';
  end if;

  -- delivery fee estimate (always subject to confirmation by the store)
  if v_zone.id is not null then
    v_fee := case
      when v_zone.free_over_cents is not null and not v_unpriced and v_subtotal >= v_zone.free_over_cents then 0
      else v_zone.fee_cents end;
    if v_zone.min_order_cents is not null and not v_unpriced and v_subtotal < v_zone.min_order_cents then
      raise exception 'below_minimum_order';
    end if;
  end if;

  if v_carrier then v_fee := v_ship_fee; end if;

  -- welcome offer: first-purchase coupon, applied to priced items only
  if nullif(trim(p_coupon_code), '') is not null then
    select * into v_settings from public.store_settings where id = 1;
    if not coalesce(v_settings.welcome_offer_enabled, false)
       or upper(trim(p_coupon_code)) <> upper(coalesce(v_settings.welcome_offer_code, '')) then
      raise exception 'coupon_invalid';
    end if;
    -- best-effort first-purchase check by phone (the store confirms on WhatsApp)
    v_phone := v_customer_phone;
    if exists (
      select 1 from public.order_intents o
       where o.id <> v_order.id and o.status in ('confirmed', 'completed')
         and (o.customer_id = v_customer_id
              or right(regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g'), 8) = right(v_phone, 8))
    ) then
      raise exception 'coupon_not_first_purchase';
    end if;
    v_coupon := upper(trim(p_coupon_code));
    v_discount := floor(v_subtotal * v_settings.welcome_offer_percent / 100.0)::integer;
  end if;

  update public.order_intents
     set item_count = v_count, subtotal_cents = v_subtotal, has_unpriced_items = v_unpriced, delivery_fee_cents = v_fee,
         coupon_code = v_coupon, discount_cents = v_discount
   where id = v_order.id
  returning * into v_order;

  update public.customers set orders_count = orders_count + 1, last_order_at = now() where id = v_customer_id;

  insert into public.order_status_history (order_id, from_status, to_status, note)
  values (v_order.id, null, 'started', 'Pedido iniciado pelo site');

  return jsonb_build_object(
    'id', v_order.id,
    'code', v_order.code,
    'subtotal_cents', v_subtotal,
    'discount_cents', v_discount,
    'coupon_code', v_coupon,
    'discount_percent', case when v_coupon is null then null else v_settings.welcome_offer_percent end,
    'has_unpriced_items', v_unpriced,
    'item_count', v_count,
    'delivery', case
      when v_carrier then jsonb_build_object('name', v_ship_service, 'method', 'shipping', 'fee_cents', v_fee, 'estimate', v_ship_estimate)
      when v_zone.id is null then null
      else jsonb_build_object('name', v_zone.name, 'method', v_zone.method, 'fee_cents', v_fee, 'estimate', v_zone.estimate) end,
    'destination', case when v_ship_cep is null then null
      else jsonb_build_object('cep', v_ship_cep, 'city', v_ship_city, 'uf', v_ship_uf) end,
    'items', v_lines
  );
end $$;
revoke all on function public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb, jsonb) from public;
grant execute on function public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb, jsonb) to anon, authenticated;

-- Texts customers read (only while still identical to the original wording)
update public.faqs
   set answer = 'Para finalizar a compra, pedimos um cadastro rápido: nome, WhatsApp e e-mail. Não é preciso criar senha, e seus dados ficam lembrados neste dispositivo para as próximas compras.'
 where question = 'Preciso criar uma conta?'
   and answer = 'Não. Você pode comprar sem cadastro. Seu carrinho e seus favoritos ficam salvos neste dispositivo.';

update public.pages
   set body = body || E'\n\n## Cadastro de clientes\n\nPara finalizar um pedido, pedimos nome, WhatsApp e e-mail. Usamos esses dados para registrar e atender o seu pedido e para falar com você sobre ele. O envio de novidades e ofertas só acontece se você marcar essa opção no cadastro, e você pode pedir para sair a qualquer momento pelos nossos canais de atendimento. Você também pode solicitar a correção ou a exclusão do seu cadastro.'
 where slug = 'politica-de-privacidade' and position('## Cadastro de clientes' in body) = 0;
