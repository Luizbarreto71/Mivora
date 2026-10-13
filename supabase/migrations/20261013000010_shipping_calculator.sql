-- MIVORA — shipping calculator (CEP lookup, delivery zones by CEP/city, carrier quotes).
-- Re-runnable. Carrier quotes come from Melhor Envio when the server has MELHOR_ENVIO_TOKEN;
-- every amount shown to customers is an estimate confirmed on WhatsApp.

-- ---------------------------------------------------------------------------
-- Validation helpers
-- ---------------------------------------------------------------------------
create or replace function public.valid_cep_ranges(p_ranges text[])
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select coalesce(bool_and(r ~ '^[0-9]{8}-[0-9]{8}$' and split_part(r, '-', 1) <= split_part(r, '-', 2)), true)
    from unnest(p_ranges) r
$$;

create or replace function public.valid_zone_cities(p_cities text[])
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select coalesce(bool_and(length(c) between 2 and 80 and c ~ '^[^/]+(/[A-Z]{2})?$'), true)
    from unnest(p_cities) c
$$;

-- ---------------------------------------------------------------------------
-- Delivery zones: optional coverage by CEP ranges ("29000000-29099999") and cities ("Vitória/ES")
-- ---------------------------------------------------------------------------
alter table public.delivery_zones
  add column if not exists cep_ranges text[] not null default '{}',
  add column if not exists cities text[] not null default '{}';
do $$ begin
  alter table public.delivery_zones add constraint delivery_zones_cep_ranges_valid check (public.valid_cep_ranges(cep_ranges));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.delivery_zones add constraint delivery_zones_cities_valid check (public.valid_zone_cities(cities));
exception when duplicate_object then null; end $$;

-- Mirrors zoneCovers() in src/lib/shipping/zones.ts
create or replace function public.delivery_zone_covers(p_zone_id uuid, p_cep text, p_city text, p_uf text)
returns boolean language sql stable set search_path = '' as $$
  select case
    when z.id is null then false
    when cardinality(z.cep_ranges) = 0 and cardinality(z.cities) = 0 then true
    else exists (
           select 1 from unnest(z.cep_ranges) r
            where p_cep between split_part(r, '-', 1) and split_part(r, '-', 2))
      or exists (
           select 1 from unnest(z.cities) c
            where public.normalize_search(trim(split_part(c, '/', 1))) = public.normalize_search(trim(coalesce(p_city, '')))
              and (split_part(c, '/', 2) = '' or split_part(c, '/', 2) = upper(coalesce(p_uf, ''))))
  end
  from (select 1) as one
  left join public.delivery_zones z on z.id = p_zone_id
$$;

-- ---------------------------------------------------------------------------
-- Products: optional shipping weight and dimensions (store defaults apply when empty)
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists weight_g integer check (weight_g is null or weight_g between 1 and 30000),
  add column if not exists height_cm integer check (height_cm is null or height_cm between 1 and 100),
  add column if not exists width_cm integer check (width_cm is null or width_cm between 1 and 100),
  add column if not exists length_cm integer check (length_cm is null or length_cm between 1 and 100);

-- ---------------------------------------------------------------------------
-- Store settings for the calculator
-- ---------------------------------------------------------------------------
alter table public.store_settings
  add column if not exists shipping_calculator_enabled boolean not null default true,
  add column if not exists shipping_origin_cep text check (shipping_origin_cep is null or shipping_origin_cep ~ '^[0-9]{8}$'),
  add column if not exists carrier_quotes_enabled boolean not null default false,
  add column if not exists shipping_handling_days integer not null default 1 check (shipping_handling_days between 0 and 30),
  add column if not exists shipping_markup_percent numeric(5, 2) not null default 0 check (shipping_markup_percent between 0 and 100),
  add column if not exists shipping_extra_cents integer not null default 0 check (shipping_extra_cents between 0 and 100000),
  add column if not exists shipping_default_weight_g integer not null default 300 check (shipping_default_weight_g between 1 and 30000),
  add column if not exists shipping_default_height_cm integer not null default 6 check (shipping_default_height_cm between 1 and 100),
  add column if not exists shipping_default_width_cm integer not null default 11 check (shipping_default_width_cm between 1 and 100),
  add column if not exists shipping_default_length_cm integer not null default 16 check (shipping_default_length_cm between 1 and 100);

-- ---------------------------------------------------------------------------
-- Orders: destination and chosen service
-- ---------------------------------------------------------------------------
alter table public.order_intents
  add column if not exists shipping_cep text check (shipping_cep is null or shipping_cep ~ '^[0-9]{8}$'),
  add column if not exists shipping_city text check (shipping_city is null or length(shipping_city) <= 80),
  add column if not exists shipping_uf text check (shipping_uf is null or shipping_uf ~ '^[A-Z]{2}$'),
  add column if not exists shipping_service text check (shipping_service is null or length(shipping_service) <= 80),
  add column if not exists shipping_estimate text check (shipping_estimate is null or length(shipping_estimate) <= 80);

-- create_order_intent gains p_shipping; the 6-argument version is removed so the API keeps a
-- single, unambiguous signature.
drop function if exists public.create_order_intent(jsonb, text, text, text, uuid, text);
create or replace function public.create_order_intent(
  p_items jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_notes text default null,
  p_delivery_zone_id uuid default null,
  p_coupon_code text default null,
  p_shipping jsonb default null
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
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'empty_cart'; end if;
  if jsonb_array_length(p_items) > 60 then raise exception 'too_many_items'; end if;

  -- coarse global flood protection
  select count(*) into v_recent from public.order_intents where created_at > now() - interval '1 minute';
  if v_recent >= 60 then raise exception 'rate_limited'; end if;

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

  insert into public.order_intents (status, source, customer_name, customer_phone, customer_notes, delivery_zone_id, delivery_method,
                                    shipping_cep, shipping_city, shipping_uf, shipping_service, shipping_estimate)
  values ('started', 'site',
          nullif(left(trim(p_customer_name), 120), ''),
          nullif(left(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+() -]', '', 'g'), 30), ''),
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
    v_phone := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
    if length(v_phone) >= 8 and exists (
      select 1 from public.order_intents o
       where o.id <> v_order.id and o.status in ('confirmed', 'completed')
         and right(regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g'), 8) = right(v_phone, 8)
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
revoke all on function public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb) from public;
grant execute on function public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies: tell customers how the CEP is used (only appended once, editable afterwards)
-- ---------------------------------------------------------------------------
update public.pages
   set body = body || E'\n\n## Cálculo de frete\n\nAo calcular o frete, o CEP informado é usado para identificar a cidade de entrega (consulta aos serviços públicos ViaCEP ou BrasilAPI) e, quando disponível, para cotar o envio com transportadoras por meio do Melhor Envio. O CEP só fica registrado quando você finaliza um pedido.'
 where slug = 'politica-de-privacidade' and position('Cálculo de frete' in body) = 0;

update public.pages
   set body = body || E'\n\n## Calculadora de frete\n\nOs valores e prazos exibidos na calculadora são estimativas baseadas no CEP informado. O valor final da entrega é confirmado pelo nosso atendimento antes do pagamento.'
 where slug = 'politica-de-envio' and position('Calculadora de frete' in body) = 0;
