-- MIVORA — authorization, Row Level Security, RPCs and auditing

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users a
     where a.user_id = auth.uid() and a.is_active
  )
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users a
     where a.user_id = auth.uid() and a.is_active and a.role = 'owner'
  )
$$;

-- Grant admin rights to an existing Auth user. Callable only with the service
-- role or from the SQL editor (postgres), never from the browser.
create or replace function public.grant_admin_by_email(p_email text, p_role public.admin_role default 'owner')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'user_not_found' using hint = 'Crie o usuário em Authentication > Users primeiro.';
  end if;
  insert into public.admin_users (user_id, role) values (v_id, p_role)
  on conflict (user_id) do update set role = excluded.role, is_active = true;
  return v_id;
end $$;
revoke all on function public.grant_admin_by_email(text, public.admin_role) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.admin_users enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_private enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.kits enable row level security;
alter table public.kit_items enable row level security;
alter table public.order_intents enable row level security;
alter table public.order_intent_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.cart_events enable row level security;
alter table public.store_settings enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.banners enable row level security;
alter table public.ritual_steps enable row level security;
alter table public.faqs enable row level security;
alter table public.pages enable row level security;
alter table public.product_suggestions enable row level security;
alter table public.audit_log enable row level security;

-- Public (anon + authenticated) read access to published storefront data
create policy "public read brands" on public.brands for select to anon, authenticated
  using (is_published or public.is_admin());
create policy "public read categories" on public.categories for select to anon, authenticated
  using (is_published or public.is_admin());
create policy "public read products" on public.products for select to anon, authenticated
  using (status = 'published' or public.is_admin());
create policy "public read product_categories" on public.product_categories for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and (p.status = 'published' or public.is_admin())));
create policy "public read product_images" on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and (p.status = 'published' or public.is_admin())));
create policy "public read product_variants" on public.product_variants for select to anon, authenticated
  using ((is_active and exists (select 1 from public.products p where p.id = product_id and p.status = 'published')) or public.is_admin());
create policy "public read kits" on public.kits for select to anon, authenticated
  using (status = 'published' or public.is_admin());
create policy "public read kit_items" on public.kit_items for select to anon, authenticated
  using (exists (select 1 from public.kits k where k.id = kit_id and (k.status = 'published' or public.is_admin())));
create policy "public read store_settings" on public.store_settings for select to anon, authenticated using (true);
create policy "public read delivery_zones" on public.delivery_zones for select to anon, authenticated
  using (is_active or public.is_admin());
create policy "public read banners" on public.banners for select to anon, authenticated
  using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or public.is_admin());
create policy "public read ritual_steps" on public.ritual_steps for select to anon, authenticated using (true);
create policy "public read faqs" on public.faqs for select to anon, authenticated
  using (is_published or public.is_admin());
create policy "public read pages" on public.pages for select to anon, authenticated
  using (is_published or public.is_admin());

-- Admin write access (every table). Hiding buttons is never the only barrier.
do $$
declare t text;
begin
  foreach t in array array[
    'brands','categories','products','product_private','product_categories','product_images',
    'product_variants','kits','kit_items','store_settings','delivery_zones','banners',
    'ritual_steps','faqs','pages','product_suggestions'
  ] loop
    execute format('create policy "admin insert %1$s" on public.%1$I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "admin update %1$s" on public.%1$I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "admin delete %1$s" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Admin-only reads for private data
create policy "admin read product_private" on public.product_private for select to authenticated using (public.is_admin());
create policy "admin read suggestions" on public.product_suggestions for select to authenticated using (public.is_admin());
create policy "admin read inventory" on public.inventory_movements for select to authenticated using (public.is_admin());
create policy "admin read orders" on public.order_intents for select to authenticated using (public.is_admin());
create policy "admin update orders" on public.order_intents for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin read order items" on public.order_intent_items for select to authenticated using (public.is_admin());
create policy "admin read order history" on public.order_status_history for select to authenticated using (public.is_admin());
create policy "admin read cart events" on public.cart_events for select to authenticated using (public.is_admin());
create policy "admin read audit" on public.audit_log for select to authenticated using (public.is_admin());
create policy "admin read admins" on public.admin_users for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "owner manage admins" on public.admin_users for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Inventory, orders and audit are written only through SECURITY DEFINER
-- functions below; no direct insert/delete policies exist for them.

-- ---------------------------------------------------------------------------
-- Auditing
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  v_changed text[];
  v_id text;
begin
  if tg_op = 'UPDATE' then
    select array_agg(k) into v_changed
      from jsonb_object_keys(v_new) k
     where k not in ('updated_at', 'search_text') and v_new -> k is distinct from v_old -> k;
    if v_changed is null then
      return new;
    end if;
  end if;
  v_id := coalesce(v_new, v_old) ->> coalesce(tg_argv[0], 'id');
  insert into public.audit_log (actor_id, action, entity, entity_id, changed_fields, details)
  values (
    auth.uid(), lower(tg_op), tg_table_name, v_id, v_changed,
    case when tg_op = 'DELETE' then jsonb_build_object('name', v_old ->> 'name', 'title', v_old ->> 'title')
         when tg_op = 'INSERT' then jsonb_build_object('name', v_new ->> 'name', 'title', v_new ->> 'title')
         else null end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'brands','categories','products','product_images','product_variants','kits',
    'store_settings','delivery_zones','banners','ritual_steps','faqs','product_suggestions','order_intents'
  ] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function public.audit_row_change()', t);
  end loop;
end $$;
create trigger product_private_audit after insert or update or delete on public.product_private
  for each row execute function public.audit_row_change('product_id');
create trigger admin_users_audit after insert or update or delete on public.admin_users
  for each row execute function public.audit_row_change('user_id');
create trigger pages_audit after insert or update or delete on public.pages
  for each row execute function public.audit_row_change('slug');

-- ---------------------------------------------------------------------------
-- Inventory primitives (internal)
-- ---------------------------------------------------------------------------
-- Applies one inventory operation to a product or variant row and records it.
-- p_kind: in | out | adjustment | reservation | release | sale | sale_reserved | return
create or replace function public._inventory_apply(
  p_product_id uuid, p_variant_id uuid, p_kind text, p_quantity integer,
  p_reason text, p_order_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_stock integer;
  v_reserved integer;
  v_tracked boolean;
  v_new_stock integer;
  v_new_reserved integer;
  v_type public.inventory_movement_type;
  v_delta integer;
begin
  if p_quantity is null or p_quantity = 0 then
    raise exception 'invalid_quantity';
  end if;

  if p_variant_id is not null then
    select stock_quantity, reserved_quantity, track_inventory into v_stock, v_reserved, v_tracked
      from public.product_variants where id = p_variant_id for update;
  else
    select stock_quantity, reserved_quantity, track_inventory into v_stock, v_reserved, v_tracked
      from public.products where id = p_product_id for update;
  end if;
  if not found then raise exception 'item_not_found'; end if;

  v_stock := coalesce(v_stock, 0);
  v_new_stock := v_stock;
  v_new_reserved := v_reserved;

  case p_kind
    when 'in' then v_new_stock := v_stock + abs(p_quantity); v_type := 'in'; v_delta := abs(p_quantity);
    when 'out' then v_new_stock := v_stock - abs(p_quantity); v_type := 'out'; v_delta := -abs(p_quantity);
    when 'adjustment' then v_new_stock := v_stock + p_quantity; v_type := 'adjustment'; v_delta := p_quantity;
    when 'reservation' then v_new_reserved := v_reserved + abs(p_quantity); v_type := 'reservation'; v_delta := abs(p_quantity);
    when 'release' then v_new_reserved := greatest(v_reserved - abs(p_quantity), 0); v_type := 'release'; v_delta := -abs(p_quantity);
    when 'sale' then v_new_stock := v_stock - abs(p_quantity); v_type := 'sale'; v_delta := -abs(p_quantity);
    when 'sale_reserved' then
      v_new_stock := v_stock - abs(p_quantity);
      v_new_reserved := greatest(v_reserved - abs(p_quantity), 0);
      v_type := 'sale'; v_delta := -abs(p_quantity);
    when 'return' then v_new_stock := v_stock + abs(p_quantity); v_type := 'return'; v_delta := abs(p_quantity);
    else raise exception 'invalid_movement_type';
  end case;

  if v_new_stock < 0 then raise exception 'insufficient_stock'; end if;
  if v_new_reserved > v_new_stock then raise exception 'insufficient_stock'; end if;

  if p_variant_id is not null then
    update public.product_variants
       set stock_quantity = v_new_stock, reserved_quantity = v_new_reserved,
           track_inventory = true
     where id = p_variant_id;
  else
    update public.products
       set stock_quantity = v_new_stock, reserved_quantity = v_new_reserved,
           track_inventory = true
     where id = p_product_id;
  end if;

  insert into public.inventory_movements
    (product_id, variant_id, movement_type, quantity, stock_after, reserved_after, reason, order_id, created_by)
  values (p_product_id, p_variant_id, v_type, v_delta, v_new_stock, v_new_reserved, p_reason, p_order_id, auth.uid());
end $$;
revoke all on function public._inventory_apply(uuid, uuid, text, integer, text, uuid) from public, anon, authenticated;

-- Manual stock entry / exit / adjustment from the admin panel
create or replace function public.admin_adjust_stock(
  p_product_id uuid, p_variant_id uuid, p_kind text, p_quantity integer, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if p_kind not in ('in', 'out', 'adjustment') then raise exception 'invalid_movement_type'; end if;
  if p_variant_id is not null and not exists (
    select 1 from public.product_variants v where v.id = p_variant_id and v.product_id = p_product_id
  ) then
    raise exception 'item_not_found';
  end if;
  perform public._inventory_apply(p_product_id, p_variant_id, p_kind, p_quantity, nullif(trim(p_reason), ''), null);
end $$;
revoke all on function public.admin_adjust_stock(uuid, uuid, text, integer, text) from public, anon;
grant execute on function public.admin_adjust_stock(uuid, uuid, text, integer, text) to authenticated;

-- Expands an order into tracked stock lines (kits → component products).
create or replace function public._order_stock_lines(p_order_id uuid)
returns table (product_id uuid, variant_id uuid, quantity integer)
language sql stable security definer set search_path = '' as $$
  with lines as (
    select i.product_id, i.variant_id, i.quantity
      from public.order_intent_items i
     where i.order_id = p_order_id and i.kit_id is null and i.product_id is not null
    union all
    select ki.product_id, null::uuid, i.quantity * ki.quantity
      from public.order_intent_items i
      join public.kit_items ki on ki.kit_id = i.kit_id
     where i.order_id = p_order_id and i.kit_id is not null
  )
  select l.product_id, l.variant_id, sum(l.quantity)::integer
    from lines l
    left join public.products p on p.id = l.product_id
    left join public.product_variants v on v.id = l.variant_id
   where (l.variant_id is not null and v.track_inventory)
      or (l.variant_id is null and p.track_inventory)
   group by l.product_id, l.variant_id
$$;
revoke all on function public._order_stock_lines(uuid) from public, anon, authenticated;

-- Status changes drive inventory: confirmed → reserve; completed → definitive
-- sale; cancelled / reopened → release or return. Opening a WhatsApp chat
-- never moves stock.
create or replace function public.admin_set_order_status(
  p_order_id uuid, p_status public.order_status, p_note text default null
) returns public.order_intents language plpgsql security definer set search_path = '' as $$
declare
  v_order public.order_intents;
  v_line record;
  v_state public.order_inventory_state;
  v_from public.order_status;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  select * into v_order from public.order_intents where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status = p_status then
    return v_order;
  end if;
  v_from := v_order.status;
  v_state := v_order.inventory_state;

  if p_status = 'confirmed' then
    if v_state = 'committed' then
      for v_line in select * from public._order_stock_lines(p_order_id) loop
        perform public._inventory_apply(v_line.product_id, v_line.variant_id, 'return', v_line.quantity, 'Pedido reaberto ' || v_order.code, p_order_id);
      end loop;
      v_state := 'none';
    end if;
    if v_state = 'none' then
      for v_line in select * from public._order_stock_lines(p_order_id) loop
        perform public._inventory_apply(v_line.product_id, v_line.variant_id, 'reservation', v_line.quantity, 'Reserva do pedido ' || v_order.code, p_order_id);
      end loop;
      v_state := 'reserved';
    end if;
  elsif p_status = 'completed' then
    if v_state <> 'committed' then
      for v_line in select * from public._order_stock_lines(p_order_id) loop
        perform public._inventory_apply(v_line.product_id, v_line.variant_id,
          case when v_state = 'reserved' then 'sale_reserved' else 'sale' end,
          v_line.quantity, 'Venda confirmada ' || v_order.code, p_order_id);
      end loop;
      v_state := 'committed';
    end if;
  else
    -- started / awaiting_contact / negotiating / cancelled
    if v_state = 'reserved' then
      for v_line in select * from public._order_stock_lines(p_order_id) loop
        perform public._inventory_apply(v_line.product_id, v_line.variant_id, 'release', v_line.quantity, 'Liberação do pedido ' || v_order.code, p_order_id);
      end loop;
    elsif v_state = 'committed' then
      for v_line in select * from public._order_stock_lines(p_order_id) loop
        perform public._inventory_apply(v_line.product_id, v_line.variant_id, 'return', v_line.quantity, 'Estorno do pedido ' || v_order.code, p_order_id);
      end loop;
    end if;
    v_state := 'none';
  end if;

  update public.order_intents set
    status = p_status,
    inventory_state = v_state,
    confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
  values (p_order_id, v_from, p_status, nullif(trim(p_note), ''), auth.uid());

  return v_order;
end $$;
revoke all on function public.admin_set_order_status(uuid, public.order_status, text) from public, anon;
grant execute on function public.admin_set_order_status(uuid, public.order_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Public checkout: register an order intent with server-side prices
-- ---------------------------------------------------------------------------
-- p_items: [{ "product_id": uuid, "variant_id": uuid|null, "kit_id": uuid|null, "quantity": int }]
-- Prices, names and availability are always read from the database; the client
-- only sends identifiers and quantities.
create or replace function public.create_order_intent(
  p_items jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_notes text default null,
  p_delivery_zone_id uuid default null
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
  v_available integer;
  v_sort integer := 0;
  v_recent integer;
  v_fee integer;
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
      'name', v_name, 'brand', v_brand, 'quantity', v_qty,
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

  update public.order_intents
     set item_count = v_count, subtotal_cents = v_subtotal, has_unpriced_items = v_unpriced, delivery_fee_cents = v_fee
   where id = v_order.id
  returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, note)
  values (v_order.id, null, 'started', 'Pedido iniciado pelo site');

  return jsonb_build_object(
    'id', v_order.id,
    'code', v_order.code,
    'subtotal_cents', v_subtotal,
    'has_unpriced_items', v_unpriced,
    'item_count', v_count,
    'delivery', case when v_zone.id is null then null else jsonb_build_object(
      'name', v_zone.name, 'method', v_zone.method, 'fee_cents', v_fee, 'estimate', v_zone.estimate) end,
    'items', v_lines
  );
end $$;
revoke all on function public.create_order_intent(jsonb, text, text, text, uuid) from public;
grant execute on function public.create_order_intent(jsonb, text, text, text, uuid) to anon, authenticated;

-- Anonymous add-to-cart counter
create or replace function public.track_cart_add(p_product_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.cart_events (product_id)
  select id from public.products where id = p_product_id and status = 'published';
end $$;
revoke all on function public.track_cart_add(uuid) from public;
grant execute on function public.track_cart_add(uuid) to anon, authenticated;

-- Best sellers from manually confirmed/completed orders only
create or replace function public.best_selling_products(p_limit integer default 12)
returns table (product_id uuid, units integer)
language sql stable security definer set search_path = '' as $$
  select i.product_id, sum(i.quantity)::integer as units
    from public.order_intent_items i
    join public.order_intents o on o.id = i.order_id
    join public.products p on p.id = i.product_id
   where o.status in ('confirmed', 'completed') and p.status = 'published'
   group by i.product_id
   order by units desc
   limit least(greatest(p_limit, 1), 48)
$$;
revoke all on function public.best_selling_products(integer) from public;
grant execute on function public.best_selling_products(integer) to anon, authenticated;

-- Dashboard aggregates
create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  select jsonb_build_object(
    'products_total', (select count(*) from public.products where status <> 'archived'),
    'products_published', (select count(*) from public.products where status = 'published'),
    'products_draft', (select count(*) from public.products where status = 'draft'),
    'products_unavailable', (select count(*) from public.products where status = 'published' and not is_available),
    'products_low_stock', (select count(*) from public.products where status <> 'archived' and track_inventory
                             and coalesce(stock_quantity, 0) - reserved_quantity <= low_stock_threshold),
    'products_without_price', (select count(*) from public.products where status = 'published' and price_cents is null),
    'products_media_pending', (select count(*) from public.products p where status <> 'archived'
                                 and (media_pending or not exists (select 1 from public.product_images i where i.product_id = p.id))),
    'products_content_unverified', (select count(*) from public.product_private pp join public.products p on p.id = pp.product_id
                                      where p.status <> 'archived' and not pp.content_verified),
    'orders_started', (select count(*) from public.order_intents where status in ('started', 'awaiting_contact', 'negotiating')),
    'orders_started_30d', (select count(*) from public.order_intents where created_at > now() - interval '30 days'),
    'orders_confirmed', (select count(*) from public.order_intents where status = 'confirmed'),
    'orders_completed', (select count(*) from public.order_intents where status = 'completed'),
    'sales_completed_cents', (select coalesce(sum(subtotal_cents), 0) from public.order_intents where status = 'completed'),
    'sales_completed_30d_cents', (select coalesce(sum(subtotal_cents), 0) from public.order_intents
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

-- Internal helpers must not be callable through the API
revoke all on function public.audit_row_change() from public, anon, authenticated;
revoke all on function public.products_before_write() from public, anon, authenticated;
