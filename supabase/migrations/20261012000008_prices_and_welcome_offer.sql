-- MIVORA — catalogue prices (Seoul Beauty catalogue minus R$ 20) and welcome offer.
-- Re-runnable. Prices are the catalogue's cash price ("Av") minus R$ 20,00, as
-- requested by the owner on 2026-10-12. Only price fields are changed: status,
-- availability, stock and photos are left untouched.

-- ---------------------------------------------------------------------------
-- Prices
-- ---------------------------------------------------------------------------
with prices(slug, cents) as (values
  ('skin1004-madagascar-centella-ampoule-foam', 12999),
  ('skin1004-madagascar-centella-light-cleansing-oil', 13999),
  ('skin1004-madagascar-centella-ampoule', 17999),
  ('skin1004-madagascar-centella-tone-brightening-capsule-ampoule', 17999),
  ('medicube-zero-pore-pad', 17999),
  ('dr-althea-345-relief-cream', 17999),
  ('celimax-the-vita-a-retinal-shot', 16499),
  ('numbuzin-no9-volumetox-eye-cream', 14999),
  ('celimax-pore-dark-spot-brightening-cream', 12999),
  ('medicube-pdrn-pink-peptide-serum', 15999),
  ('medicube-pdrn-pink-collagen-gel-mask', 2499)
)
update public.products p
   set price_cents = prices.cents,
       -- a previous price is only kept when it is still higher than the new price
       compare_at_price_cents = case when p.compare_at_price_cents > prices.cents then p.compare_at_price_cents end
  from prices
 where p.slug = prices.slug;
-- skin1004-madagascar-centella-ampoule-foam: catálogo p.2 R$ 149,99 → R$ 129,99
-- skin1004-madagascar-centella-light-cleansing-oil: catálogo p.3 R$ 159,99 → R$ 139,99
-- skin1004-madagascar-centella-ampoule: catálogo p.4 R$ 199,99 (100 ml) → R$ 179,99
-- skin1004-madagascar-centella-tone-brightening-capsule-ampoule: catálogo p.5 R$ 199,99 → R$ 179,99
-- medicube-zero-pore-pad: catálogo p.7 R$ 199,99 → R$ 179,99
-- dr-althea-345-relief-cream: catálogo p.9 R$ 199,99 → R$ 179,99
-- celimax-the-vita-a-retinal-shot: catálogo p.10 R$ 184,99 → R$ 164,99
-- numbuzin-no9-volumetox-eye-cream: catálogo p.12 R$ 169,99 → R$ 149,99
-- celimax-pore-dark-spot-brightening-cream: catálogo p.14 R$ 149,99 → R$ 129,99
-- medicube-pdrn-pink-peptide-serum: catálogo p.16 R$ 179,99 → R$ 159,99
-- medicube-pdrn-pink-collagen-gel-mask: catálogo p.19 R$ 44,99 (unidade) → R$ 24,99

-- The gel mask is priced per sheet in the catalogue: make the unit explicit
update public.products set volume = '1 unidade'
 where slug = 'medicube-pdrn-pink-collagen-gel-mask' and volume is null;

-- The supplier catalogue shows the Numbuzin photo as "No.9 NAD+ Retinol Volumetox Eye Cream"
update public.product_private
   set internal_notes = 'Foto conferida com o catálogo do fornecedor (No.9 NAD+ Retinol Volumetox Eye Cream). Confirmar volume.'
 where product_id = (select id from public.products where slug = 'numbuzin-no9-volumetox-eye-cream')
   and internal_notes like 'Verificar se a foto enviada%';

-- ---------------------------------------------------------------------------
-- Welcome offer (first purchase)
-- ---------------------------------------------------------------------------
alter table public.store_settings
  add column if not exists welcome_offer_enabled boolean not null default true,
  add column if not exists welcome_offer_percent integer not null default 10,
  add column if not exists welcome_offer_code text not null default 'BEMVINDA10';
do $$ begin
  alter table public.store_settings add constraint store_settings_welcome_percent check (welcome_offer_percent between 1 and 50);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.store_settings add constraint store_settings_welcome_code check (welcome_offer_code ~ '^[A-Z0-9]{3,20}$');
exception when duplicate_object then null; end $$;

alter table public.order_intents
  add column if not exists coupon_code text,
  add column if not exists discount_cents integer not null default 0;
do $$ begin
  alter table public.order_intents add constraint order_intents_discount_valid check (discount_cents >= 0 and discount_cents <= subtotal_cents);
exception when duplicate_object then null; end $$;

-- create_order_intent gains an optional coupon; the old 5-argument version is removed
-- so the API has a single, unambiguous signature.
drop function if exists public.create_order_intent(jsonb, text, text, text, uuid);
create or replace function public.create_order_intent(
  p_items jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_notes text default null,
  p_delivery_zone_id uuid default null,
  p_coupon_code text default null
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

  insert into public.order_intents (status, source, customer_name, customer_phone, customer_notes, delivery_zone_id, delivery_method)
  values ('started', 'site',
          nullif(left(trim(p_customer_name), 120), ''),
          nullif(left(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+() -]', '', 'g'), 30), ''),
          nullif(left(trim(p_customer_notes), 1000), ''),
          v_zone.id, coalesce(v_zone.method, 'to_arrange'))
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
    'delivery', case when v_zone.id is null then null else jsonb_build_object(
      'name', v_zone.name, 'method', v_zone.method, 'fee_cents', v_fee, 'estimate', v_zone.estimate) end,
    'items', v_lines
  );
end $$;
revoke all on function public.create_order_intent(jsonb, text, text, text, uuid, text) from public;
grant execute on function public.create_order_intent(jsonb, text, text, text, uuid, text) to anon, authenticated;

-- Confirmed revenue is net of discounts
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
    'products_unavailable', (select count(*) from public.products where status = 'published' and availability in ('out_of_stock', 'on_request')),
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
