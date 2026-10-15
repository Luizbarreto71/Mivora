-- MIVORA — new checkout (owner's request 2026-10-14): customer accounts (Google / Apple through Supabase Auth),
-- saved addresses, full delivery address and CPF on the order, one order per checkout attempt, Pix QR codes.
-- Additive and re-runnable. Accounts never gain admin rights: admin access still requires admin_users.

-- ---------------------------------------------------------------------------
-- CPF check digits
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_cpf(p_cpf text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  s integer;
  r integer;
begin
  if length(d) <> 11 or d ~ '^(.)\1{10}$' then return false; end if;
  s := 0;
  for i in 1..9 loop s := s + substr(d, i, 1)::integer * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::integer then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(d, i, 1)::integer * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::integer;
end $$;

-- ---------------------------------------------------------------------------
-- Customers: account link and the data the checkout asks for
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists user_id uuid unique references auth.users (id) on delete set null,
  add column if not exists first_name text check (first_name is null or length(trim(first_name)) between 1 and 60),
  add column if not exists last_name text check (last_name is null or length(trim(last_name)) between 1 and 80),
  add column if not exists cpf text check (cpf is null or public.is_valid_cpf(cpf));

-- Internal: creates/updates a customer by e-mail. A record linked to an account is only changed by that account
-- (a visitor typing someone else's e-mail never overwrites the account holder's data).
drop function if exists public.upsert_customer(text, text, text, boolean, text);
create or replace function public.upsert_customer(
  p_name text, p_email text, p_phone text, p_marketing boolean, p_source text,
  p_first_name text default null, p_last_name text default null, p_cpf text default null, p_user_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_first text := nullif(left(regexp_replace(trim(coalesce(p_first_name, '')), '[[:space:]]+', ' ', 'g'), 60), '');
  v_last text := nullif(left(regexp_replace(trim(coalesce(p_last_name, '')), '[[:space:]]+', ' ', 'g'), 80), '');
  v_name text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_cpf text := nullif(regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g'), '');
  v_row public.customers;
  v_recent integer;
begin
  v_name := coalesce(nullif(trim(concat_ws(' ', v_first, v_last)), ''), nullif(left(regexp_replace(trim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'), 120), ''));
  if v_name is null or length(v_name) < 2 then raise exception 'invalid_name'; end if;
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_email'; end if;
  if v_phone ~ '^55[0-9]{10,11}$' then v_phone := substr(v_phone, 3); end if;
  if v_phone !~ '^[0-9]{10,11}$' then raise exception 'invalid_phone'; end if;
  if v_cpf is not null and not public.is_valid_cpf(v_cpf) then raise exception 'invalid_cpf'; end if;
  -- coarse flood protection
  select count(*) into v_recent from public.customers where updated_at > now() - interval '1 minute';
  if v_recent >= 60 then raise exception 'rate_limited'; end if;

  select * into v_row from public.customers where email = v_email for update;
  if not found then
    -- an account that changed its e-mail keeps a single linked record
    if p_user_id is not null then update public.customers set user_id = null where user_id = p_user_id; end if;
    insert into public.customers (name, first_name, last_name, email, phone, cpf, marketing_consent, marketing_consent_at, source, user_id)
    values (v_name, v_first, v_last, v_email, v_phone, v_cpf, coalesce(p_marketing, false), case when p_marketing then now() end,
            left(coalesce(nullif(trim(p_source), ''), 'site'), 40), p_user_id)
    returning * into v_row;
  elsif v_row.user_id is not null and v_row.user_id is distinct from p_user_id then
    -- record owned by an account: the order is linked to it, the account holder's data stays as it is
    null;
  else
    if p_user_id is not null and v_row.user_id is null then
      update public.customers set user_id = null where user_id = p_user_id and id <> v_row.id;
    end if;
    update public.customers c
       set name = v_name,
           first_name = coalesce(v_first, c.first_name),
           last_name = coalesce(v_last, c.last_name),
           phone = v_phone,
           cpf = coalesce(v_cpf, c.cpf),
           user_id = coalesce(p_user_id, c.user_id),
           marketing_consent = coalesce(p_marketing, c.marketing_consent),
           marketing_consent_at = case when p_marketing is true and not c.marketing_consent then now()
                                       when p_marketing is false then null
                                       else c.marketing_consent_at end,
           updated_at = now()
     where c.id = v_row.id
    returning * into v_row;
  end if;
  if p_marketing is true then
    insert into public.newsletter_subscribers (email, source) values (v_email, 'cadastro') on conflict (email) do nothing;
  end if;
  return v_row.id;
end $$;
revoke all on function public.upsert_customer(text, text, text, boolean, text, text, text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Saved addresses (accounts only; each account sees and edits only its own)
-- ---------------------------------------------------------------------------
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient text not null check (length(trim(recipient)) between 2 and 120),
  cep text not null check (cep ~ '^[0-9]{8}$'),
  street text not null check (length(trim(street)) between 2 and 120),
  number text not null check (length(trim(number)) between 1 and 20),
  complement text check (complement is null or length(complement) <= 80),
  reference text check (reference is null or length(reference) <= 120),
  district text not null check (length(trim(district)) between 1 and 80),
  city text not null check (length(trim(city)) between 2 and 80),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_addresses_user_idx on public.customer_addresses (user_id, created_at desc);
alter table public.customer_addresses enable row level security;
drop trigger if exists customer_addresses_updated_at on public.customer_addresses;
create trigger customer_addresses_updated_at before update on public.customer_addresses for each row execute function public.set_updated_at();
drop policy if exists "own addresses read" on public.customer_addresses;
create policy "own addresses read" on public.customer_addresses for select to authenticated using (user_id = auth.uid());
drop policy if exists "own addresses insert" on public.customer_addresses;
create policy "own addresses insert" on public.customer_addresses for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "own addresses update" on public.customer_addresses;
create policy "own addresses update" on public.customer_addresses for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own addresses delete" on public.customer_addresses;
create policy "own addresses delete" on public.customer_addresses for delete to authenticated using (user_id = auth.uid());

create or replace function public.customer_addresses_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.customer_addresses where user_id = new.user_id) >= 10 then
    raise exception 'too_many_addresses';
  end if;
  -- a single default address per account
  if new.is_default then
    update public.customer_addresses set is_default = false where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end $$;
drop trigger if exists customer_addresses_guard on public.customer_addresses;
create trigger customer_addresses_guard before insert or update on public.customer_addresses for each row execute function public.customer_addresses_guard();

-- ---------------------------------------------------------------------------
-- Orders: account, checkout attempt, CPF, full address, payment details
-- ---------------------------------------------------------------------------
alter table public.order_intents
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists client_request_id uuid unique,
  add column if not exists customer_cpf text check (customer_cpf is null or customer_cpf ~ '^[0-9]{11}$'),
  add column if not exists shipping_recipient text check (shipping_recipient is null or length(shipping_recipient) <= 120),
  add column if not exists shipping_street text check (shipping_street is null or length(shipping_street) <= 120),
  add column if not exists shipping_number text check (shipping_number is null or length(shipping_number) <= 20),
  add column if not exists shipping_complement text check (shipping_complement is null or length(shipping_complement) <= 80),
  add column if not exists shipping_reference text check (shipping_reference is null or length(shipping_reference) <= 120),
  add column if not exists shipping_district text check (shipping_district is null or length(shipping_district) <= 80),
  add column if not exists payment_installments integer check (payment_installments is null or payment_installments between 1 and 24),
  add column if not exists payment_brand text check (payment_brand is null or length(payment_brand) <= 40),
  add column if not exists payment_qr_code text check (payment_qr_code is null or length(payment_qr_code) <= 2000),
  add column if not exists payment_qr_base64 text check (payment_qr_base64 is null or length(payment_qr_base64) <= 100000),
  add column if not exists payment_ticket_url text check (payment_ticket_url is null or payment_ticket_url ~ '^https?://'),
  add column if not exists payment_qr_expires_at timestamptz;
create index if not exists order_intents_user_idx on public.order_intents (user_id, created_at desc);

-- create_order_intent gains p_request_id; the customer may carry first_name, last_name and cpf, and the
-- shipping object the full address. The order is linked to the signed-in account (auth.uid()).
drop function if exists public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb, jsonb, text);
create or replace function public.create_order_intent(
  p_items jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_notes text default null,
  p_delivery_zone_id uuid default null,
  p_coupon_code text default null,
  p_shipping jsonb default null,
  p_customer jsonb default null,
  p_payment_method text default 'whatsapp',
  p_request_id uuid default null
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
  v_online boolean := false;
  v_due integer;
  v_ref text;
  v_cpf text;
  v_ship_recipient text;
  v_ship_street text;
  v_ship_number text;
  v_ship_complement text;
  v_ship_reference text;
  v_ship_district text;
  v_existing public.order_intents;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'empty_cart'; end if;
  if jsonb_array_length(p_items) > 60 then raise exception 'too_many_items'; end if;

  -- the same checkout attempt (double click, retry after a network error) never creates a second order
  if p_request_id is not null then
    -- concurrent calls with the same id wait here, then find the order the first one created
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 18));
    select * into v_existing from public.order_intents where client_request_id = p_request_id;
    if found then
      return jsonb_build_object(
        'id', v_existing.id,
        'code', v_existing.code,
        'duplicate', true,
        'payment_method', v_existing.payment_method,
        'amount_due_cents', v_existing.amount_due_cents,
        'subtotal_cents', v_existing.subtotal_cents,
        'discount_cents', v_existing.discount_cents,
        'coupon_code', v_existing.coupon_code,
        'discount_percent', null,
        'has_unpriced_items', v_existing.has_unpriced_items,
        'item_count', v_existing.item_count,
        'delivery', case when v_existing.delivery_fee_cents is null and v_existing.shipping_service is null then null
          else jsonb_build_object('name', v_existing.shipping_service, 'method', v_existing.delivery_method, 'fee_cents', v_existing.delivery_fee_cents, 'estimate', v_existing.shipping_estimate) end,
        'destination', case when v_existing.shipping_cep is null then null
          else jsonb_build_object('cep', v_existing.shipping_cep, 'city', v_existing.shipping_city, 'uf', v_existing.shipping_uf) end,
        'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name_snapshot, 'brand', i.brand_snapshot, 'code', null, 'quantity', i.quantity,
                                                                'unit_price_cents', i.unit_price_cents, 'line_total_cents', i.line_total_cents) order by i.sort_order)
                             from public.order_intent_items i where i.order_id = v_existing.id), '[]'::jsonb)
      );
    end if;
  end if;

  -- coarse global flood protection
  select count(*) into v_recent from public.order_intents where created_at > now() - interval '1 minute';
  if v_recent >= 60 then raise exception 'rate_limited'; end if;

  -- payment: WhatsApp (store confirms and charges) or online through Mercado Pago
  if coalesce(p_payment_method, 'whatsapp') not in ('whatsapp', 'mercadopago') then raise exception 'invalid_payment_method'; end if;
  if p_payment_method = 'mercadopago' then
    if not coalesce((select s.online_payment_enabled from public.store_settings s where s.id = 1), false) then
      raise exception 'online_payment_disabled';
    end if;
    v_online := true;
  end if;

  -- mandatory registration (lead capture): every order belongs to a registered customer
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then raise exception 'customer_required'; end if;
  v_customer_id := public.upsert_customer(
    p_customer ->> 'name', p_customer ->> 'email', p_customer ->> 'phone',
    case when p_customer ? 'marketing' then (p_customer ->> 'marketing')::boolean end, 'checkout',
    p_customer ->> 'first_name', p_customer ->> 'last_name', p_customer ->> 'cpf', auth.uid());
  v_cpf := nullif(regexp_replace(coalesce(p_customer ->> 'cpf', ''), '[^0-9]', '', 'g'), '');
  v_customer_name := left(regexp_replace(trim(coalesce(nullif(trim(concat_ws(' ', p_customer ->> 'first_name', p_customer ->> 'last_name')), ''), p_customer ->> 'name', '')), '[[:space:]]+', ' ', 'g'), 120);
  v_customer_phone := regexp_replace(coalesce(p_customer ->> 'phone', ''), '[^0-9]', '', 'g');
  if v_customer_phone ~ '^55[0-9]{10,11}$' then v_customer_phone := substr(v_customer_phone, 3); end if;

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
    if v_ship_uf is not null and v_ship_uf !~ '^[A-Z]{2}$' then raise exception 'invalid_shipping'; end if;
    -- full delivery address (new checkout)
    v_ship_recipient := nullif(left(regexp_replace(trim(coalesce(p_shipping ->> 'recipient', '')), '[[:space:]]+', ' ', 'g'), 120), '');
    v_ship_street := nullif(left(trim(coalesce(p_shipping ->> 'street', '')), 120), '');
    v_ship_number := nullif(left(trim(coalesce(p_shipping ->> 'number', '')), 20), '');
    v_ship_complement := nullif(left(trim(coalesce(p_shipping ->> 'complement', '')), 80), '');
    v_ship_reference := nullif(left(trim(coalesce(p_shipping ->> 'reference', '')), 120), '');
    v_ship_district := nullif(left(trim(coalesce(p_shipping ->> 'district', '')), 80), '');
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
    update public.customers set cep = v_ship_cep, city = coalesce(v_ship_city, city), uf = coalesce(v_ship_uf, uf)
     where id = v_customer_id and (user_id is null or user_id = auth.uid());
  end if;

  insert into public.order_intents (status, source, payment_method, customer_id, customer_name, customer_phone, customer_notes, delivery_zone_id, delivery_method,
                                    shipping_cep, shipping_city, shipping_uf, shipping_service, shipping_estimate,
                                    user_id, client_request_id, customer_cpf, shipping_recipient, shipping_street, shipping_number,
                                    shipping_complement, shipping_reference, shipping_district)
  values ('started', 'site', case when v_online then 'mercadopago' else 'whatsapp' end,
          v_customer_id,
          v_customer_name,
          v_customer_phone,
          nullif(left(trim(p_customer_notes), 1000), ''),
          v_zone.id,
          case when v_carrier then 'shipping'::public.delivery_method else coalesce(v_zone.method, 'to_arrange') end,
          v_ship_cep, v_ship_city, v_ship_uf,
          case when v_carrier then v_ship_service else v_zone.name end,
          case when v_carrier then v_ship_estimate else v_zone.estimate end,
          auth.uid(), p_request_id, v_cpf, v_ship_recipient, v_ship_street, v_ship_number,
          v_ship_complement, v_ship_reference, v_ship_district)
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
      v_ref := 'kit-' || v_kit.id::text;
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
      v_ref := coalesce(nullif(v_product.code, ''), v_product.id::text);
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
      'ref', v_ref, 'name', v_name, 'brand', v_brand, 'code', v_code, 'quantity', v_qty,
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

  -- paying online requires a known total: every item priced and a delivery with a defined fee
  if v_online then
    if v_unpriced then raise exception 'online_payment_unavailable'; end if;
    if v_fee is null or (v_zone.id is not null and v_zone.method = 'to_arrange') or (v_zone.id is null and not v_carrier) then
      raise exception 'delivery_required';
    end if;
    -- a delivery needs the full address (pickup does not)
    if (v_carrier or v_zone.method = 'local_delivery')
       and (v_ship_street is null or v_ship_number is null or v_ship_district is null or v_ship_recipient is null) then
      raise exception 'address_required';
    end if;
    v_due := v_subtotal - v_discount + v_fee;
    if v_due <= 0 then raise exception 'online_payment_unavailable'; end if;
  end if;

  update public.order_intents
     set item_count = v_count, subtotal_cents = v_subtotal, has_unpriced_items = v_unpriced, delivery_fee_cents = v_fee,
         coupon_code = v_coupon, discount_cents = v_discount,
         payment_status = case when v_online then 'pending' else 'none' end, amount_due_cents = v_due
   where id = v_order.id
  returning * into v_order;

  update public.customers set orders_count = orders_count + 1, last_order_at = now() where id = v_customer_id;

  insert into public.order_status_history (order_id, from_status, to_status, note)
  values (v_order.id, null, 'started', case when v_online then 'Pedido iniciado pelo site · pagamento online (Mercado Pago)' else 'Pedido iniciado pelo site' end);

  return jsonb_build_object(
    'id', v_order.id,
    'code', v_order.code,
    'payment_method', v_order.payment_method,
    'amount_due_cents', v_due,
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
revoke all on function public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb, jsonb, text, uuid) from public;
grant execute on function public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb, jsonb, text, uuid) to anon, authenticated;

-- Server only: payment details shown to the buyer (installments, card brand, Pix QR code)
create or replace function public.set_order_payment_info(
  p_order_id uuid, p_installments integer, p_brand text, p_qr_code text, p_qr_base64 text, p_ticket_url text, p_qr_expires_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.order_intents
     set payment_installments = p_installments,
         payment_brand = nullif(left(p_brand, 40), ''),
         payment_qr_code = p_qr_code,
         payment_qr_base64 = p_qr_base64,
         payment_ticket_url = p_ticket_url,
         payment_qr_expires_at = p_qr_expires_at
   where id = p_order_id and payment_method = 'mercadopago';
  if not found then raise exception 'order_not_found'; end if;
end $$;
revoke all on function public.set_order_payment_info(uuid, integer, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.set_order_payment_info(uuid, integer, text, text, text, text, timestamptz) to service_role;

-- Public order receipt (by the random order id): adds the Pix code while it can be paid and the card details.
-- Still no contact data or street address.
create or replace function public.get_order_receipt(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id,
    'code', o.code,
    'status', o.status,
    'created_at', o.created_at,
    'first_name', split_part(coalesce(o.customer_name, ''), ' ', 1),
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'payment_type', o.payment_type,
    'payment_installments', o.payment_installments,
    'payment_brand', o.payment_brand,
    'amount_due_cents', o.amount_due_cents,
    'amount_paid_cents', o.amount_paid_cents,
    'paid_at', o.paid_at,
    'subtotal_cents', o.subtotal_cents,
    'discount_cents', o.discount_cents,
    'delivery_fee_cents', o.delivery_fee_cents,
    'delivery_method', o.delivery_method,
    'shipping_service', o.shipping_service,
    'shipping_estimate', o.shipping_estimate,
    'shipping_city', o.shipping_city,
    'shipping_uf', o.shipping_uf,
    'item_count', o.item_count,
    'checkout_url', case when o.payment_status in ('pending', 'rejected', 'cancelled') and o.status not in ('cancelled', 'completed')
                          and (o.payment_expires_at is null or o.payment_expires_at > now()) then o.payment_checkout_url end,
    'checkout_expires_at', o.payment_expires_at,
    'pix', case when o.payment_status in ('pending', 'in_process') and o.payment_qr_code is not null and o.status not in ('cancelled', 'completed')
                 and (o.payment_qr_expires_at is null or o.payment_qr_expires_at > now())
           then jsonb_build_object('qr_code', o.payment_qr_code, 'qr_base64', o.payment_qr_base64, 'ticket_url', o.payment_ticket_url, 'expires_at', o.payment_qr_expires_at) end,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name_snapshot, 'quantity', i.quantity, 'line_total_cents', i.line_total_cents) order by i.sort_order)
                         from public.order_intent_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from public.order_intents o
  where o.id = p_order_id
$$;
revoke all on function public.get_order_receipt(uuid) from public;
grant execute on function public.get_order_receipt(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Account functions (signed-in customers)
-- ---------------------------------------------------------------------------
-- The account's data: e-mail and name from the identity provider; phone and CPF only from the record this
-- account itself saved (a record created by a visitor with the same e-mail is never shown).
create or replace function public.get_my_account()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed boolean;
  v_meta jsonb;
  v_app jsonb;
  v_c public.customers;
begin
  if v_uid is null then return null; end if;
  select u.email, u.email_confirmed_at is not null, coalesce(u.raw_user_meta_data, '{}'::jsonb), coalesce(u.raw_app_meta_data, '{}'::jsonb)
    into v_email, v_confirmed, v_meta, v_app
    from auth.users u where u.id = v_uid;
  if not found then return null; end if;
  select * into v_c from public.customers where user_id = v_uid;
  return jsonb_build_object(
    'email', v_email,
    'email_verified', v_confirmed,
    'provider', coalesce(v_app ->> 'provider', 'email'),
    'provider_name', nullif(trim(coalesce(v_meta ->> 'full_name', v_meta ->> 'name', '')), ''),
    'saved', v_c.id is not null,
    'first_name', v_c.first_name,
    'last_name', v_c.last_name,
    'name', v_c.name,
    'phone', v_c.phone,
    'cpf', v_c.cpf,
    'marketing', coalesce(v_c.marketing_consent, false)
  );
end $$;
revoke all on function public.get_my_account() from public, anon;
grant execute on function public.get_my_account() to authenticated;

-- Saves the account's data (and links the customer record of this verified e-mail to the account).
create or replace function public.save_my_account(p_first_name text, p_last_name text, p_phone text, p_cpf text, p_marketing boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select u.email, u.email_confirmed_at is not null into v_email, v_confirmed from auth.users u where u.id = v_uid;
  if v_email is null or not v_confirmed then raise exception 'email_not_verified'; end if;
  if nullif(trim(coalesce(p_first_name, '')), '') is null or nullif(trim(coalesce(p_last_name, '')), '') is null then raise exception 'invalid_name'; end if;
  perform public.upsert_customer(null, v_email, p_phone, p_marketing, 'conta', p_first_name, p_last_name, p_cpf, v_uid);
  return public.get_my_account();
end $$;
revoke all on function public.save_my_account(text, text, text, text, boolean) from public, anon;
grant execute on function public.save_my_account(text, text, text, text, boolean) to authenticated;

-- Orders placed while signed in (short summary, no internal notes)
create or replace function public.get_my_orders()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'code', o.code, 'created_at', o.created_at, 'status', o.status,
           'payment_method', o.payment_method, 'payment_status', o.payment_status,
           'total_cents', coalesce(o.amount_due_cents, o.subtotal_cents - o.discount_cents + coalesce(o.delivery_fee_cents, 0)),
           'item_count', o.item_count) order by o.created_at desc), '[]'::jsonb)
    from (select * from public.order_intents where user_id = auth.uid() and auth.uid() is not null order by created_at desc limit 30) o
$$;
revoke all on function public.get_my_orders() from public, anon;
grant execute on function public.get_my_orders() to authenticated;

-- Privacy policy: accounts, CPF and address
update public.pages
   set body = body || E'\n\n## Conta, CPF e endereço\n\nVocê pode comprar como visitante ou entrar com sua conta Google ou Apple. Ao entrar, recebemos do provedor apenas seu nome e e-mail (a Apple pode fornecer um e-mail privado de encaminhamento). Na finalização pedimos CPF, telefone e o endereço de entrega, usados para emitir o pedido, processar o pagamento e entregar. Quem entra com conta pode salvar endereços para as próximas compras e excluí-los quando quiser. Não armazenamos dados de cartão.'
 where slug = 'politica-de-privacidade' and position('## Conta, CPF e endereço' in body) = 0;

-- The CPF now asked in the checkout is kept with the order for every payment method, Apple Pay included
update public.pages
   set body = replace(body, 'ele é enviado ao Mercado Pago junto com o pagamento e não fica salvo na MIVORA.', 'ele é enviado ao Mercado Pago junto com o pagamento e fica registrado no pedido, como nas demais formas de pagamento (veja “Conta, CPF e endereço”).')
 where slug = 'politica-de-privacidade';

-- Sentences from the first version of the policy that the new checkout made inaccurate (only if still unedited)
update public.pages
   set body = replace(replace(body,
         '- **Intenção de pedido:** ao tocar em "Finalizar pelo WhatsApp", registramos os produtos, quantidades, valores e um código de pedido. Nome, telefone e observações são opcionais e só são registrados se você os informar.',
         '- **Pedido:** ao confirmar o pedido, registramos os produtos, quantidades, valores e um código de pedido, além dos dados informados na finalização (nome, e-mail, telefone, CPF e endereço de entrega) e das observações, se houver.'),
         'Não coletamos dados de pagamento neste site.',
         'Não armazenamos dados de cartão: o pagamento online é processado pelo Mercado Pago.')
 where slug = 'politica-de-privacidade';
