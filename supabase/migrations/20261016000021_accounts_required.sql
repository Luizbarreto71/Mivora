-- MIVORA — accounts required to buy (2026-10-17): sign-in with e-mail and password (Supabase Auth), Google or Apple,
-- confirmed e-mail before any purchase, personal data with optional birth date and gender. Re-runnable.

-- ---------------------------------------------------------------------------
-- Customers: optional birth date and gender (never required to buy)
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists birth_date date,
  add column if not exists gender text;
alter table public.customers drop constraint if exists customers_birth_date_check;
alter table public.customers add constraint customers_birth_date_check check (birth_date is null or birth_date between date '1900-01-01' and current_date);
alter table public.customers drop constraint if exists customers_gender_check;
alter table public.customers add constraint customers_gender_check check (gender is null or gender in ('feminino', 'masculino', 'nao_binario', 'outro', 'prefiro_nao_informar'));

-- ---------------------------------------------------------------------------
-- The account's data: what it saved, or what it typed when signing up (kept in the sign-up metadata until the
-- e-mail is confirmed), so the checkout asks only for what is missing
-- ---------------------------------------------------------------------------
create or replace function public.get_my_account()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed boolean;
  v_meta jsonb;
  v_app jsonb;
  v_c public.customers;
  v_birth date;
begin
  if v_uid is null then return null; end if;
  select u.email, u.email_confirmed_at is not null, coalesce(u.raw_user_meta_data, '{}'::jsonb), coalesce(u.raw_app_meta_data, '{}'::jsonb)
    into v_email, v_confirmed, v_meta, v_app
    from auth.users u where u.id = v_uid;
  if not found then return null; end if;
  select * into v_c from public.customers where user_id = v_uid;
  begin
    v_birth := nullif(v_meta ->> 'birth_date', '')::date;
  exception when others then
    v_birth := null;
  end;
  return jsonb_build_object(
    'email', v_email,
    'email_verified', v_confirmed,
    'provider', coalesce(v_app ->> 'provider', 'email'),
    'provider_name', nullif(trim(coalesce(v_meta ->> 'full_name', v_meta ->> 'name', '')), ''),
    'saved', v_c.id is not null,
    -- once the account saved its data, that is what counts; before, what was typed at sign-up pre-fills the forms
    'first_name', case when v_c.id is not null then v_c.first_name else nullif(left(trim(coalesce(v_meta ->> 'first_name', '')), 60), '') end,
    'last_name', case when v_c.id is not null then v_c.last_name else nullif(left(trim(coalesce(v_meta ->> 'last_name', '')), 80), '') end,
    'name', v_c.name,
    'phone', case when v_c.id is not null then v_c.phone else nullif(regexp_replace(coalesce(v_meta ->> 'phone', ''), '[^0-9]', '', 'g'), '') end,
    'cpf', case when v_c.id is not null then v_c.cpf when public.is_valid_cpf(v_meta ->> 'cpf') then regexp_replace(v_meta ->> 'cpf', '[^0-9]', '', 'g') end,
    'birth_date', case when v_c.id is not null then v_c.birth_date else v_birth end,
    'gender', case when v_c.id is not null then v_c.gender when v_meta ->> 'gender' in ('feminino', 'masculino', 'nao_binario', 'outro', 'prefiro_nao_informar') then v_meta ->> 'gender' end,
    'marketing', coalesce(v_c.marketing_consent, false)
  );
end $$;
revoke all on function public.get_my_account() from public, anon;
grant execute on function public.get_my_account() to authenticated;

-- Saves the account's data. Birth date and gender change only when p_profile is true (the account page sends them;
-- the checkout does not, so it never erases them).
drop function if exists public.save_my_account(text, text, text, text, boolean);
create or replace function public.save_my_account(
  p_first_name text, p_last_name text, p_phone text, p_cpf text, p_marketing boolean default null,
  p_birth_date date default null, p_gender text default null, p_profile boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select u.email, u.email_confirmed_at is not null into v_email, v_confirmed from auth.users u where u.id = v_uid;
  if v_email is null or not v_confirmed then raise exception 'email_not_verified'; end if;
  if nullif(trim(coalesce(p_first_name, '')), '') is null or nullif(trim(coalesce(p_last_name, '')), '') is null then raise exception 'invalid_name'; end if;
  if p_profile and p_gender is not null and p_gender not in ('feminino', 'masculino', 'nao_binario', 'outro', 'prefiro_nao_informar') then raise exception 'invalid_gender'; end if;
  if p_profile and p_birth_date is not null and (p_birth_date < date '1900-01-01' or p_birth_date > current_date) then raise exception 'invalid_birth_date'; end if;
  perform public.upsert_customer(null, v_email, p_phone, p_marketing, 'conta', p_first_name, p_last_name, p_cpf, v_uid);
  if p_profile then
    update public.customers set birth_date = p_birth_date, gender = p_gender, updated_at = now() where user_id = v_uid;
  end if;
  return public.get_my_account();
end $$;
revoke all on function public.save_my_account(text, text, text, text, boolean, date, text, boolean) from public, anon;
grant execute on function public.save_my_account(text, text, text, text, boolean, date, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Orders: only signed-in accounts with a confirmed e-mail; the customer e-mail is the account's
-- ---------------------------------------------------------------------------
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
  v_account_email text;
begin
  -- every purchase belongs to a signed-in account with a confirmed e-mail (enforced here, not only in the pages)
  if auth.uid() is null then raise exception 'login_required'; end if;
  select u.email into v_account_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_account_email is null then raise exception 'email_not_confirmed'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'empty_cart'; end if;
  if jsonb_array_length(p_items) > 60 then raise exception 'too_many_items'; end if;

  -- the same checkout attempt (double click, retry after a network error) never creates a second order
  if p_request_id is not null then
    -- concurrent calls with the same id wait here, then find the order the first one created
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 18));
    select * into v_existing from public.order_intents where client_request_id = p_request_id;
    if found and v_existing.user_id is distinct from auth.uid() then raise exception 'invalid_request'; end if;
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

  -- the customer record is the account's: its e-mail always comes from the session, never from the request
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then raise exception 'customer_required'; end if;
  v_customer_id := public.upsert_customer(
    p_customer ->> 'name', v_account_email, p_customer ->> 'phone',
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
revoke all on function public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb, jsonb, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up of an address that was never confirmed (server only, service role)
-- ---------------------------------------------------------------------------
-- Supabase Auth keeps the password of the first sign-up while the e-mail is unconfirmed: whoever typed another
-- person's address first would know the password once its owner confirms it. The server looks the pending account up
-- here so that the newest sign-up defines the password and the data instead (only the inbox owner can confirm).
create or replace function public.pending_email_signup(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
   where lower(u.email) = lower(trim(p_email))
     and u.email_confirmed_at is null
     and coalesce(u.raw_app_meta_data ->> 'provider', 'email') = 'email'
   limit 1
$$;
revoke all on function public.pending_email_signup(text) from public, anon, authenticated;
grant execute on function public.pending_email_signup(text) to service_role;

-- ---------------------------------------------------------------------------
-- Privacy policy: accounts are required to buy
-- ---------------------------------------------------------------------------
update public.pages
   set body = replace(body,
         'Você pode comprar como visitante ou entrar com sua conta Google ou Apple.',
         'Para comprar, é preciso ter uma conta: com e-mail e senha (com o e-mail confirmado) ou entrando com Google ou Apple. Data de nascimento e gênero são opcionais e só são usados para personalizar o atendimento.')
 where slug = 'politica-de-privacidade';

-- FAQ: only while it still has one of the earlier answers (an answer edited in the admin is kept)
update public.faqs
   set answer = 'Sim. Para finalizar a compra, entre com e-mail e senha (com o e-mail confirmado) ou com sua conta Google ou Apple. O carrinho fica salvo enquanto você entra ou cria a conta, e nela você acompanha pedidos, endereços e dados.'
 where question = 'Preciso criar uma conta?'
   and answer in ('Para finalizar a compra, pedimos um cadastro rápido: nome, WhatsApp e e-mail. Não é preciso criar senha, e seus dados ficam lembrados neste dispositivo para as próximas compras.',
                  'Não. Você pode comprar sem cadastro. Seu carrinho e seus favoritos ficam salvos neste dispositivo.');
