-- MIVORA — catalogue expansion: structure (safe to re-run)

-- ---------------------------------------------------------------------------
-- Public fields
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists coming_soon_note text;
comment on column public.products.coming_soon_note is 'Optional public note for "Em breve" products, e.g. expected arrival. Only fill with confirmed information.';

alter table public.store_settings add column if not exists coming_soon_inquiry_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- Internal sourcing & regulatory fields (admin only: product_private has no public policy)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.sourcing_status as enum ('stock_confirmed', 'planned', 'evaluating');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.regulatory_status as enum ('not_verified', 'in_progress', 'verified');
exception when duplicate_object then null; end $$;

alter table public.product_private
  add column if not exists sourcing_status public.sourcing_status not null default 'planned',
  add column if not exists regulatory_status public.regulatory_status not null default 'not_verified',
  add column if not exists regulatory_reference text,
  add column if not exists supplier_document text,
  add column if not exists batch_number text,
  add column if not exists expiry_date date,
  add column if not exists documentation_notes text,
  add column if not exists regulatory_verified_at timestamptz,
  add column if not exists regulatory_verified_by uuid references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Sales gate: a product that was not part of the confirmed initial stock can only
-- be sold after the admin records documentation/regulatory verification.
-- Enforced in the database so no UI path can bypass it.
-- ---------------------------------------------------------------------------
create or replace function public.product_sale_blocked(p_product_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not coalesce((
    select pp.sourcing_status = 'stock_confirmed' or pp.regulatory_status = 'verified'
      from public.product_private pp where pp.product_id = p_product_id
  ), false)
$$;
revoke all on function public.product_sale_blocked(uuid) from public, anon, authenticated;

create or replace function public.enforce_sale_gate_products()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and new.availability = 'in_stock'
     and (tg_op = 'INSERT' or old.status is distinct from 'published' or old.availability is distinct from 'in_stock')
     and public.product_sale_blocked(new.id) then
    raise exception 'compliance_required'
      using hint = 'Registre a verificação de documentação e regularização antes de liberar a venda.';
  end if;
  return new;
end $$;
create or replace trigger products_sale_gate after insert or update of status, availability on public.products
  for each row execute function public.enforce_sale_gate_products();

create or replace function public.enforce_sale_gate_private()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.products p
              where p.id = new.product_id and p.status = 'published' and p.availability = 'in_stock')
     and not (new.sourcing_status = 'stock_confirmed' or new.regulatory_status = 'verified') then
    raise exception 'compliance_required'
      using hint = 'Este produto está à venda: mantenha a documentação como verificada ou retire-o da venda primeiro.';
  end if;
  if new.regulatory_status = 'verified' and (tg_op = 'INSERT' or old.regulatory_status is distinct from 'verified') then
    new.regulatory_verified_at := now();
    new.regulatory_verified_by := auth.uid();
  end if;
  return new;
end $$;
create or replace trigger product_private_sale_gate before insert or update on public.product_private
  for each row execute function public.enforce_sale_gate_private();

revoke all on function public.enforce_sale_gate_products() from public, anon, authenticated;
revoke all on function public.enforce_sale_gate_private() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Manually curated related products
-- ---------------------------------------------------------------------------
create table if not exists public.product_relations (
  product_id uuid not null references public.products (id) on delete cascade,
  related_product_id uuid not null references public.products (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_id, related_product_id),
  constraint product_relations_not_self check (product_id <> related_product_id)
);
create index if not exists product_relations_related_idx on public.product_relations (related_product_id);
alter table public.product_relations enable row level security;

drop policy if exists "public read product_relations" on public.product_relations;
create policy "public read product_relations" on public.product_relations for select to anon, authenticated
  using ((exists (select 1 from public.products p where p.id = product_id and p.status = 'published')
          and exists (select 1 from public.products p where p.id = related_product_id and p.status = 'published'))
         or public.is_admin());
drop policy if exists "admin insert product_relations" on public.product_relations;
create policy "admin insert product_relations" on public.product_relations for insert to authenticated with check (public.is_admin());
drop policy if exists "admin update product_relations" on public.product_relations;
create policy "admin update product_relations" on public.product_relations for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin delete product_relations" on public.product_relations;
create policy "admin delete product_relations" on public.product_relations for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Dashboard: add commercial pipeline counters
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

-- ---------------------------------------------------------------------------
-- Public product code (shown on the product page and in WhatsApp orders)
-- ---------------------------------------------------------------------------
create sequence if not exists public.product_code_seq start 1;
alter table public.products add column if not exists code text;
with base as (
  select coalesce(max(substring(code from 3)::int), 0) as n from public.products where code ~ '^MV[0-9]+$'
), numbered as (
  select id, row_number() over (order by sort_order, created_at, slug) as rn from public.products where code is null
)
update public.products p set code = 'MV' || lpad((base.n + numbered.rn)::text, 4, '0')
  from numbered, base where p.id = numbered.id;
select setval('public.product_code_seq', greatest(1, (select coalesce(max(substring(code from 3)::int), 0) from public.products where code ~ '^MV[0-9]+$')));
alter table public.products alter column code set default ('MV' || lpad(nextval('public.product_code_seq')::text, 4, '0'));
alter table public.products alter column code set not null;
create unique index if not exists products_code_key on public.products (code);

-- create_order_intent now also returns each item's public product code
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
  v_code text;
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
