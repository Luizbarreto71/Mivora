-- MIVORA — core relational schema
-- Money is stored as integer cents (BRL). NULL price = "preço sob consulta".

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.publish_status as enum ('draft', 'published', 'archived');
create type public.availability_status as enum ('in_stock', 'out_of_stock', 'on_request');
create type public.category_kind as enum ('product_type', 'concern');
create type public.order_status as enum ('started', 'awaiting_contact', 'negotiating', 'confirmed', 'completed', 'cancelled');
create type public.order_inventory_state as enum ('none', 'reserved', 'committed');
create type public.inventory_movement_type as enum ('in', 'out', 'adjustment', 'reservation', 'release', 'sale', 'return');
create type public.admin_role as enum ('owner', 'admin', 'editor');
create type public.delivery_method as enum ('pickup', 'local_delivery', 'shipping', 'to_arrange');
create type public.suggestion_status as enum ('idea', 'evaluating', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Case/accent-insensitive normalisation used by search (mirrors src/lib/search.ts)
create or replace function public.normalize_search(input text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select lower(translate(coalesce(input, ''),
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;

-- ---------------------------------------------------------------------------
-- Administrators
-- ---------------------------------------------------------------------------
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.admin_role not null default 'admin',
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger admin_users_updated_at before update on public.admin_users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Catalog: brands, categories, products
-- ---------------------------------------------------------------------------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  tagline text,
  description text,
  origin_country text,
  website_url text,
  logo_url text,
  image_url text,
  is_published boolean not null default true,
  sort_order integer not null default 0,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger brands_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  kind public.category_kind not null default 'product_type',
  parent_id uuid references public.categories (id) on delete set null,
  description text,
  image_url text,
  is_published boolean not null default true,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_kind_idx on public.categories (kind, sort_order);
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  brand_id uuid not null references public.brands (id) on delete restrict,
  product_line text,
  volume text,
  short_description text,
  description text,
  benefits text[] not null default '{}',
  key_ingredients text[] not null default '{}',
  ingredients_full text,
  how_to_use text,
  warnings text,
  skin_types text[] not null default '{}',
  tags text[] not null default '{}',
  -- pricing (cents). NULL = not defined yet → "Consultar preço"
  price_cents integer check (price_cents is null or price_cents >= 0),
  compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents > 0),
  -- availability & inventory
  status public.publish_status not null default 'draft',
  availability public.availability_status not null default 'in_stock',
  track_inventory boolean not null default false,
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  is_available boolean generated always as (
    case
      when availability <> 'in_stock' then false
      when track_inventory then coalesce(stock_quantity, 0) - reserved_quantity > 0
      else true
    end
  ) stored,
  -- merchandising
  is_featured boolean not null default false,
  featured_order integer not null default 0,
  is_new boolean not null default false,
  sort_order integer not null default 0,
  video_url text,
  media_pending boolean not null default false,
  -- SEO
  seo_title text,
  seo_description text,
  -- search (maintained by trigger)
  search_text text not null default '',
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_compare_gt_price check (
    compare_at_price_cents is null or price_cents is null or compare_at_price_cents > price_cents
  ),
  constraint products_tracked_requires_qty check (not track_inventory or stock_quantity is not null),
  constraint products_reserved_le_stock check (stock_quantity is null or reserved_quantity <= stock_quantity)
);
create index products_brand_idx on public.products (brand_id);
create index products_status_idx on public.products (status, is_available);
create index products_featured_idx on public.products (is_featured, featured_order) where status = 'published';
create index products_new_idx on public.products (is_new, published_at desc) where status = 'published';
create index products_price_idx on public.products (price_cents) where status = 'published';
create index products_search_trgm_idx on public.products using gin (search_text extensions.gin_trgm_ops);
create index products_skin_types_idx on public.products using gin (skin_types);
create index products_tags_idx on public.products using gin (tags);

-- Admin-only fields (cost, barcode, internal notes) live apart so they can never be
-- exposed by the public catalog policies.
create table public.product_private (
  product_id uuid primary key references public.products (id) on delete cascade,
  sku text unique,
  barcode text,
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  supplier text,
  content_verified boolean not null default false,
  internal_notes text,
  updated_at timestamptz not null default now()
);
create trigger product_private_updated_at before update on public.product_private
  for each row execute function public.set_updated_at();

create table public.product_categories (
  product_id uuid not null references public.products (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (product_id, category_id)
);
create index product_categories_category_idx on public.product_categories (category_id);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url text not null,
  storage_path text,
  alt text,
  width integer,
  height integer,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);
create unique index product_images_one_primary on public.product_images (product_id) where is_primary;

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  sku text unique,
  price_cents integer check (price_cents is null or price_cents >= 0),
  compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents > 0),
  track_inventory boolean not null default false,
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint variants_tracked_requires_qty check (not track_inventory or stock_quantity is not null),
  constraint variants_reserved_le_stock check (stock_quantity is null or reserved_quantity <= stock_quantity)
);
create index product_variants_product_idx on public.product_variants (product_id, sort_order);
create trigger product_variants_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Inventory ledger
-- ---------------------------------------------------------------------------
create table public.inventory_movements (
  id bigint generated always as identity primary key,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  movement_type public.inventory_movement_type not null,
  quantity integer not null check (quantity <> 0),
  stock_after integer,
  reserved_after integer,
  reason text,
  order_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_product_idx on public.inventory_movements (product_id, created_at desc);
create index inventory_movements_created_idx on public.inventory_movements (created_at desc);

-- ---------------------------------------------------------------------------
-- Kits
-- ---------------------------------------------------------------------------
create table public.kits (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  short_description text,
  description text,
  image_url text,
  price_cents integer check (price_cents is null or price_cents >= 0),
  compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents > 0),
  status public.publish_status not null default 'draft',
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger kits_updated_at before update on public.kits
  for each row execute function public.set_updated_at();

create table public.kit_items (
  kit_id uuid not null references public.kits (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity integer not null default 1 check (quantity between 1 and 20),
  sort_order integer not null default 0,
  primary key (kit_id, product_id)
);
create index kit_items_product_idx on public.kit_items (product_id);

-- ---------------------------------------------------------------------------
-- Order intents (WhatsApp checkout). An intent is NOT a confirmed sale.
-- ---------------------------------------------------------------------------
create sequence public.order_code_seq start 1;

create table public.order_intents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('MIV-' || lpad(nextval('public.order_code_seq')::text, 6, '0')),
  status public.order_status not null default 'started',
  inventory_state public.order_inventory_state not null default 'none',
  source text not null default 'site',
  item_count integer not null default 0,
  subtotal_cents integer not null default 0,
  has_unpriced_items boolean not null default false,
  delivery_method public.delivery_method,
  delivery_zone_id uuid,
  delivery_fee_cents integer,
  customer_name text check (customer_name is null or length(customer_name) <= 120),
  customer_phone text check (customer_phone is null or length(customer_phone) <= 30),
  customer_notes text check (customer_notes is null or length(customer_notes) <= 1000),
  admin_notes text,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_intents_created_idx on public.order_intents (created_at desc);
create index order_intents_status_idx on public.order_intents (status, created_at desc);
create trigger order_intents_updated_at before update on public.order_intents
  for each row execute function public.set_updated_at();

create table public.order_intent_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order_intents (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  kit_id uuid references public.kits (id) on delete set null,
  name_snapshot text not null,
  brand_snapshot text,
  unit_price_cents integer,
  quantity integer not null check (quantity between 1 and 99),
  line_total_cents integer,
  sort_order integer not null default 0
);
create index order_intent_items_order_idx on public.order_intent_items (order_id);
create index order_intent_items_product_idx on public.order_intent_items (product_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.order_intents (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  note text,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- Anonymous "add to cart" counter for merchandising insights (no personal data)
create table public.cart_events (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index cart_events_product_idx on public.cart_events (product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Store configuration & content
-- ---------------------------------------------------------------------------
create table public.store_settings (
  id smallint primary key default 1 check (id = 1),
  store_name text not null default 'MIVORA',
  tagline text,
  whatsapp_number text check (whatsapp_number is null or whatsapp_number ~ '^[0-9]{10,15}$'),
  whatsapp_greeting text not null default 'Olá, MIVORA!',
  business_hours text,
  contact_email text,
  contact_phone text,
  instagram_url text,
  tiktok_url text,
  facebook_url text,
  legal_name text,
  cnpj text,
  address text,
  announcement_enabled boolean not null default false,
  announcement_text text,
  announcement_href text,
  delivery_summary text,
  pickup_enabled boolean not null default false,
  pickup_details text,
  free_shipping_enabled boolean not null default false,
  free_shipping_threshold_cents integer check (free_shipping_threshold_cents is null or free_shipping_threshold_cents >= 0),
  minimum_order_cents integer check (minimum_order_cents is null or minimum_order_cents >= 0),
  show_registered_mark boolean not null default false,
  about_headline text,
  about_text text,
  whatsapp_section_title text,
  whatsapp_section_text text,
  seo_title text,
  seo_description text,
  updated_at timestamptz not null default now()
);
create trigger store_settings_updated_at before update on public.store_settings
  for each row execute function public.set_updated_at();

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  method public.delivery_method not null,
  fee_cents integer check (fee_cents is null or fee_cents >= 0),
  free_over_cents integer check (free_over_cents is null or free_over_cents >= 0),
  min_order_cents integer check (min_order_cents is null or min_order_cents >= 0),
  estimate text,
  notes text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger delivery_zones_updated_at before update on public.delivery_zones
  for each row execute function public.set_updated_at();
alter table public.order_intents
  add constraint order_intents_zone_fk foreign key (delivery_zone_id) references public.delivery_zones (id) on delete set null;

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  placement text not null default 'hero' check (placement in ('hero', 'editorial')),
  eyebrow text,
  title text not null,
  subtitle text,
  cta_label text,
  cta_href text,
  cta2_label text,
  cta2_href text,
  image_desktop_url text,
  image_mobile_url text,
  image_alt text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger banners_updated_at before update on public.banners
  for each row execute function public.set_updated_at();

create table public.ritual_steps (
  id uuid primary key default gen_random_uuid(),
  step_number integer not null,
  title text not null,
  description text,
  category_id uuid references public.categories (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ritual_steps_updated_at before update on public.ritual_steps
  for each row execute function public.set_updated_at();

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  product_id uuid references public.products (id) on delete cascade,
  show_on_home boolean not null default true,
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index faqs_product_idx on public.faqs (product_id);
create trigger faqs_updated_at before update on public.faqs
  for each row execute function public.set_updated_at();

create table public.pages (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  body text not null default '',
  needs_review boolean not null default true,
  is_published boolean not null default true,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger pages_updated_at before update on public.pages
  for each row execute function public.set_updated_at();

-- Products considered for future sale. Never shown publicly.
create table public.product_suggestions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_name text,
  notes text,
  reference_url text,
  status public.suggestion_status not null default 'idea',
  product_id uuid references public.products (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger product_suggestions_updated_at before update on public.product_suggestions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  changed_fields text[],
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- Product search document & lifecycle timestamps
-- ---------------------------------------------------------------------------
create or replace function public.products_before_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_brand text;
  v_categories text;
begin
  select b.name into v_brand from public.brands b where b.id = new.brand_id;
  select string_agg(c.name, ' ') into v_categories
    from public.product_categories pc join public.categories c on c.id = pc.category_id
   where pc.product_id = new.id;

  new.search_text := public.normalize_search(concat_ws(' ',
    new.name, v_brand, new.product_line, new.volume, new.short_description,
    array_to_string(new.key_ingredients, ' '), array_to_string(new.tags, ' '),
    array_to_string(new.benefits, ' '), array_to_string(new.skin_types, ' '), v_categories));

  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  if new.status = 'archived' and (tg_op = 'INSERT' or old.status is distinct from 'archived') then
    new.archived_at := now();
  elsif new.status <> 'archived' then
    new.archived_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger products_before_write before insert or update on public.products
  for each row execute function public.products_before_write();

-- Touch products when category links or brand/category names change so the
-- search document is recomputed by the trigger above.
create or replace function public.touch_products_from_link()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.products set updated_at = now()
   where id = coalesce(new.product_id, old.product_id);
  return null;
end $$;
create trigger product_categories_touch after insert or delete on public.product_categories
  for each row execute function public.touch_products_from_link();

create or replace function public.touch_products_from_brand()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.name is distinct from old.name then
    update public.products set updated_at = now() where brand_id = new.id;
  end if;
  return null;
end $$;
create trigger brands_touch_products after update on public.brands
  for each row execute function public.touch_products_from_brand();

create or replace function public.touch_products_from_category()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.name is distinct from old.name then
    update public.products p set updated_at = now()
      from public.product_categories pc
     where pc.product_id = p.id and pc.category_id = new.id;
  end if;
  return null;
end $$;
create trigger categories_touch_products after update on public.categories
  for each row execute function public.touch_products_from_category();
