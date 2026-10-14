-- MIVORA — online payments through Mercado Pago Checkout Pro (owner's request 2026-10-14).
-- The buyer pays on Mercado Pago's page (Pix, card, boleto); the store never sees card data.
-- Payment results are written only by the site server (service_role) after it re-reads the payment
-- from the Mercado Pago API; an approved payment of the full amount confirms the order and reserves stock.
-- Online payment starts disabled. Re-runnable.

alter table public.store_settings
  add column if not exists online_payment_enabled boolean not null default false,
  add column if not exists online_payment_max_installments integer not null default 12
    check (online_payment_max_installments between 1 and 12);

alter table public.order_intents
  add column if not exists payment_method text not null default 'whatsapp' check (payment_method in ('whatsapp', 'mercadopago')),
  add column if not exists payment_status text not null default 'none'
    check (payment_status in ('none', 'pending', 'in_process', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back')),
  add column if not exists payment_id text check (payment_id is null or length(payment_id) <= 40),
  add column if not exists payment_type text check (payment_type is null or length(payment_type) <= 40),
  add column if not exists payment_detail text check (payment_detail is null or length(payment_detail) <= 120),
  add column if not exists amount_due_cents integer check (amount_due_cents is null or amount_due_cents > 0),
  add column if not exists amount_paid_cents integer check (amount_paid_cents is null or amount_paid_cents >= 0),
  add column if not exists paid_at timestamptz,
  add column if not exists payment_updated_at timestamptz,
  add column if not exists payment_preference_id text check (payment_preference_id is null or length(payment_preference_id) <= 80),
  add column if not exists payment_checkout_url text check (payment_checkout_url is null or payment_checkout_url ~ '^https?://'),
  add column if not exists payment_expires_at timestamptz;
create index if not exists order_intents_payment_idx on public.order_intents (payment_method, payment_status);

-- create_order_intent gains p_payment_method ('whatsapp' | 'mercadopago').
drop function if exists public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb, jsonb);
create or replace function public.create_order_intent(
  p_items jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_notes text default null,
  p_delivery_zone_id uuid default null,
  p_coupon_code text default null,
  p_shipping jsonb default null,
  p_customer jsonb default null,
  p_payment_method text default 'whatsapp'
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
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'empty_cart'; end if;
  if jsonb_array_length(p_items) > 60 then raise exception 'too_many_items'; end if;

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

  insert into public.order_intents (status, source, payment_method, customer_id, customer_name, customer_phone, customer_notes, delivery_zone_id, delivery_method,
                                    shipping_cep, shipping_city, shipping_uf, shipping_service, shipping_estimate)
  values ('started', 'site', case when v_online then 'mercadopago' else 'whatsapp' end,
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
revoke all on function public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb, jsonb, text) from public;
grant execute on function public.create_order_intent(jsonb, text, text, text, uuid, text, jsonb, jsonb, text) to anon, authenticated;

-- Server only: remembers the Mercado Pago checkout created for an order (reused while it is valid).
create or replace function public.set_order_checkout(p_order_id uuid, p_preference_id text, p_checkout_url text, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.order_intents
     set payment_preference_id = left(p_preference_id, 80), payment_checkout_url = p_checkout_url, payment_expires_at = p_expires_at
   where id = p_order_id and payment_method = 'mercadopago';
  if not found then raise exception 'order_not_found'; end if;
end $$;
revoke all on function public.set_order_checkout(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.set_order_checkout(uuid, text, text, timestamptz) to service_role;

-- Server only: applies a payment read from the Mercado Pago API. Idempotent; a later failed attempt
-- never undoes an approved payment. Approved with the full amount → order confirmed + stock reserved.
create or replace function public.apply_payment_update(
  p_order_id uuid, p_payment_id text, p_status text, p_status_detail text, p_payment_type text, p_amount_cents integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.order_intents;
  v_status text := lower(coalesce(p_status, ''));
  v_line record;
  v_note text;
  v_reserved boolean := false;
  v_from public.order_status;
begin
  -- Mercado Pago statuses → store statuses
  v_status := case v_status
    when 'approved' then 'approved'
    when 'authorized' then 'in_process'
    when 'in_process' then 'in_process'
    when 'in_mediation' then 'in_process'
    when 'pending' then 'pending'
    when 'rejected' then 'rejected'
    when 'cancelled' then 'cancelled'
    when 'refunded' then 'refunded'
    when 'charged_back' then 'charged_back'
    else null end;
  if v_status is null then raise exception 'invalid_payment_status'; end if;
  if coalesce(p_payment_id, '') !~ '^[0-9A-Za-z_-]{1,40}$' then raise exception 'invalid_payment_id'; end if;

  select * into v_order from public.order_intents where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.payment_method <> 'mercadopago' then raise exception 'not_online_order'; end if;

  -- nothing new
  if v_order.payment_id = p_payment_id and v_order.payment_status = v_status then
    return jsonb_build_object('changed', false, 'status', v_order.status, 'payment_status', v_order.payment_status);
  end if;
  -- another attempt failing or pending after the order was paid does not change it
  if v_order.payment_status = 'approved' and v_order.payment_id is distinct from p_payment_id and v_status <> 'approved' then
    return jsonb_build_object('changed', false, 'status', v_order.status, 'payment_status', v_order.payment_status);
  end if;
  -- an approved payment only moves forward (refund / chargeback)
  if v_order.payment_status = 'approved' and v_order.payment_id = p_payment_id and v_status not in ('refunded', 'charged_back') then
    return jsonb_build_object('changed', false, 'status', v_order.status, 'payment_status', v_order.payment_status);
  end if;

  update public.order_intents
     set payment_id = p_payment_id,
         payment_status = v_status,
         payment_detail = nullif(left(p_status_detail, 120), ''),
         payment_type = coalesce(nullif(left(p_payment_type, 40), ''), payment_type),
         amount_paid_cents = case when v_status = 'approved' then greatest(coalesce(p_amount_cents, 0), 0) else amount_paid_cents end,
         paid_at = case when v_status = 'approved' then coalesce(paid_at, now()) else paid_at end,
         payment_updated_at = now()
   where id = p_order_id
  returning * into v_order;

  if v_status = 'approved' then
    if coalesce(p_amount_cents, 0) < coalesce(v_order.amount_due_cents, 0) then
      v_note := 'Pagamento aprovado no Mercado Pago com valor menor que o total do pedido. Confira antes de enviar.';
    elsif v_order.status in ('started', 'awaiting_contact', 'negotiating') then
      v_from := v_order.status;
      begin
        if v_order.inventory_state = 'none' then
          for v_line in select * from public._order_stock_lines(p_order_id) loop
            perform public._inventory_apply(v_line.product_id, v_line.variant_id, 'reservation', v_line.quantity, 'Reserva do pedido ' || v_order.code || ' (pago online)', p_order_id);
          end loop;
          v_reserved := true;
        end if;
        update public.order_intents
           set status = 'confirmed', confirmed_at = now(),
               inventory_state = case when v_reserved then 'reserved'::public.order_inventory_state else inventory_state end
         where id = p_order_id
        returning * into v_order;
        insert into public.order_status_history (order_id, from_status, to_status, note)
        values (p_order_id, v_from, 'confirmed', 'Pagamento aprovado no Mercado Pago (' || p_payment_id || '). Pedido confirmado automaticamente.');
        return jsonb_build_object('changed', true, 'status', v_order.status, 'payment_status', v_order.payment_status);
      exception when others then
        v_note := 'Pagamento aprovado no Mercado Pago, mas não foi possível reservar o estoque (' || sqlerrm || '). Confira o pedido.';
      end;
    elsif v_order.status = 'cancelled' then
      v_note := 'Pagamento aprovado no Mercado Pago (' || p_payment_id || ') para um pedido cancelado. Revise e, se for o caso, devolva o valor.';
    else
      v_note := 'Pagamento aprovado no Mercado Pago (' || p_payment_id || ').';
    end if;
  else
    v_note := case v_status
      when 'pending' then 'Pagamento aguardando conclusão no Mercado Pago'
      when 'in_process' then 'Pagamento em análise no Mercado Pago'
      when 'rejected' then 'Pagamento recusado no Mercado Pago'
      when 'cancelled' then 'Pagamento cancelado ou expirado no Mercado Pago'
      when 'refunded' then 'Pagamento devolvido ao cliente no Mercado Pago. Revise o pedido'
      when 'charged_back' then 'Pagamento contestado pelo cliente (chargeback). Revise o pedido'
    end || ' (' || p_payment_id || ').';
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, note)
  values (p_order_id, v_order.status, v_order.status, v_note);
  return jsonb_build_object('changed', true, 'status', v_order.status, 'payment_status', v_order.payment_status);
end $$;
revoke all on function public.apply_payment_update(uuid, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.apply_payment_update(uuid, text, text, text, text, integer) to service_role;

-- Public order receipt for the buyer (the order id is a random UUID). No contact data or address.
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
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name_snapshot, 'quantity', i.quantity, 'line_total_cents', i.line_total_cents) order by i.sort_order)
                         from public.order_intent_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from public.order_intents o
  where o.id = p_order_id
$$;
revoke all on function public.get_order_receipt(uuid) from public;
grant execute on function public.get_order_receipt(uuid) to anon, authenticated;

-- Privacy policy: online payments
update public.pages
   set body = body || E'\n\n## Pagamentos online\n\nQuando você escolhe pagar pelo site, o pagamento é processado pelo Mercado Pago, em ambiente seguro do próprio Mercado Pago. A MIVORA não recebe nem armazena os dados do seu cartão. Para processar o pagamento e prevenir fraudes, compartilhamos com o Mercado Pago seu nome, e-mail, telefone, CEP e os itens do pedido. Recebemos de volta apenas a situação do pagamento (aprovado, pendente ou recusado) e a forma de pagamento utilizada.'
 where slug = 'politica-de-privacidade' and position('## Pagamentos online' in body) = 0;
