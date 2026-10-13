-- MIVORA — premium home (owner's mockup, 2026-10-13): campaign banners per section, top bar and
-- benefits copy, real testimonials (hidden until the store adds them) and newsletter sign-ups.
-- Re-runnable.

-- ---------------------------------------------------------------------------
-- Banners: new home sections, background colour and a featured product
-- ---------------------------------------------------------------------------
alter table public.banners drop constraint if exists banners_placement_check;
alter table public.banners add constraint banners_placement_check
  check (placement in ('hero', 'editorial', 'routines', 'coming_soon'));
alter table public.banners
  add column if not exists background_color text check (background_color is null or background_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists product_id uuid references public.products (id) on delete set null;

-- Hero slide of the mockup: real photo of the Medicube PDRN Pink Peptide Serum on rosé
insert into public.banners (placement, eyebrow, title, subtitle, cta_label, cta_href, product_id, background_color, sort_order)
select 'hero', 'Beleza que cuida de você', 'Sua pele, seu ritual.',
       'Skincare coreano e cosméticos importados para uma pele mais saudável, bonita e radiante.',
       'Explorar produtos', '/produtos', p.id, '#F6E4E1', 0
  from public.products p
 where p.slug = 'medicube-pdrn-pink-peptide-serum'
   and not exists (select 1 from public.banners b where b.placement = 'hero' and b.product_id = p.id);

-- The light-device photo keeps a brand message without repeating the first title
update public.banners
   set title = 'Seu momento de autocuidado', eyebrow = 'Skincare coreano e beleza internacional'
 where placement = 'hero' and image_desktop_url = '/banners/home-ritual-aparelho-luz.webp' and title = 'Sua pele, seu ritual.';

-- Background colours sampled from each photo's edge, so the photo dissolves into the banner
update public.banners b
   set background_color = v.color
  from (values
    ('/banners/home-ritual-aparelho-luz.webp', '#FCE4E2'),
    ('/banners/home-medicube-collagen-night-wrapping-mask.webp', '#F8D6D9'),
    ('/banners/home-medicube-zero-pore-pad.webp', '#F2F2F0'),
    ('/banners/home-medicube-collagen-jelly-cream.webp', '#F5F3F1')
  ) as v(url, color)
 where b.image_desktop_url = v.url and b.background_color is null;

insert into public.banners (placement, title, subtitle, cta_label, cta_href, background_color, sort_order)
select 'routines', 'Rotinas de Skincare', 'Monte o seu ritual e cuide da sua pele em todas as etapas.', 'Ver rotinas', '/ritual', '#F3ECE4', 0
 where not exists (select 1 from public.banners where placement = 'routines');

insert into public.banners (placement, title, subtitle, cta_label, cta_href, background_color, sort_order)
select 'coming_soon', 'Em breve na MIVORA', 'Novos produtos, novas possibilidades.', 'Quero saber mais', '/produtos?disponibilidade=em-breve', '#F7E1E1', 0
 where not exists (select 1 from public.banners where placement = 'coming_soon');

-- ---------------------------------------------------------------------------
-- "Cuidados para cada necessidade": five featured needs, named as in the mockup
-- ---------------------------------------------------------------------------
update public.categories set name = 'Poros e textura' where slug = 'poros-e-oleosidade' and name = 'Poros e oleosidade';
update public.categories set name = 'Anti-idade' where slug = 'firmeza-e-linhas-finas' and name = 'Firmeza e linhas finas';
alter table public.categories add column if not exists show_on_home boolean not null default false;
update public.categories set show_on_home = true
 where kind = 'concern' and slug in ('hidratacao', 'luminosidade', 'poros-e-oleosidade', 'firmeza-e-linhas-finas', 'pele-sensivel')
   and not exists (select 1 from public.categories where show_on_home);
-- refresh the search document of the products in renamed categories (category names are searchable)
update public.products p set updated_at = p.updated_at
 where exists (select 1 from public.product_categories pc join public.categories c on c.id = pc.category_id
                where pc.product_id = p.id and c.slug in ('poros-e-oleosidade', 'firmeza-e-linhas-finas'));

-- ---------------------------------------------------------------------------
-- Store settings: top bar messages, benefits strip and newsletter switch
-- ---------------------------------------------------------------------------
create or replace function public.valid_short_texts(p_texts text[], p_max integer)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select coalesce(bool_and(length(t) between 1 and p_max), true) from unnest(p_texts) t
$$;

alter table public.store_settings
  add column if not exists top_bar_messages text[] not null
    default array['Skincare coreano e cosméticos importados', 'Frete e prazo calculados pelo CEP', 'Atendimento via WhatsApp'],
  add column if not exists home_benefits jsonb not null
    default '[{"title": "Produtos originais", "text": "Qualidade e procedência"},
              {"title": "Atendimento especializado", "text": "Suporte via WhatsApp"},
              {"title": "Entrega para sua região", "text": "Frete e prazo calculados pelo CEP"}]'::jsonb,
  add column if not exists newsletter_enabled boolean not null default true;
do $$ begin
  alter table public.store_settings add constraint store_settings_top_bar_valid
    check (cardinality(top_bar_messages) <= 4 and public.valid_short_texts(top_bar_messages, 90));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.store_settings add constraint store_settings_benefits_valid
    check (jsonb_typeof(home_benefits) = 'array' and jsonb_array_length(home_benefits) <= 3);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Testimonials: only real, authorised testimonials; the home section stays hidden while empty
-- ---------------------------------------------------------------------------
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (length(trim(author_name)) between 2 and 60),
  author_detail text check (author_detail is null or length(author_detail) <= 60),
  body text not null check (length(trim(body)) between 10 and 400),
  rating smallint check (rating is null or rating between 1 and 5),
  product_id uuid references public.products (id) on delete set null,
  consent_confirmed boolean not null default false,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint testimonials_publish_requires_consent check (not is_published or consent_confirmed)
);
alter table public.testimonials enable row level security;
drop trigger if exists testimonials_updated_at on public.testimonials;
create trigger testimonials_updated_at before update on public.testimonials for each row execute function public.set_updated_at();
drop trigger if exists testimonials_audit on public.testimonials;
create trigger testimonials_audit after insert or update or delete on public.testimonials for each row execute function public.audit_row_change();
drop policy if exists "public read testimonials" on public.testimonials;
create policy "public read testimonials" on public.testimonials for select to anon, authenticated using (is_published or public.is_admin());
drop policy if exists "admin insert testimonials" on public.testimonials;
create policy "admin insert testimonials" on public.testimonials for insert to authenticated with check (public.is_admin());
drop policy if exists "admin update testimonials" on public.testimonials;
create policy "admin update testimonials" on public.testimonials for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin delete testimonials" on public.testimonials;
create policy "admin delete testimonials" on public.testimonials for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Newsletter: e-mail + consent date; written only through subscribe_newsletter()
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  source text not null default 'site' check (length(source) <= 40),
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.newsletter_subscribers enable row level security;
drop policy if exists "admin read newsletter" on public.newsletter_subscribers;
create policy "admin read newsletter" on public.newsletter_subscribers for select to authenticated using (public.is_admin());
drop policy if exists "admin delete newsletter" on public.newsletter_subscribers;
create policy "admin delete newsletter" on public.newsletter_subscribers for delete to authenticated using (public.is_admin());

create or replace function public.subscribe_newsletter(p_email text, p_consent boolean default false, p_source text default 'site')
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_recent integer;
begin
  if not coalesce(p_consent, false) then raise exception 'consent_required'; end if;
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_email'; end if;
  if not exists (select 1 from public.store_settings where id = 1 and newsletter_enabled) then raise exception 'newsletter_disabled'; end if;
  -- coarse flood protection
  select count(*) into v_recent from public.newsletter_subscribers where created_at > now() - interval '1 minute';
  if v_recent >= 30 then raise exception 'rate_limited'; end if;
  insert into public.newsletter_subscribers (email, source)
  values (v_email, left(coalesce(nullif(trim(p_source), ''), 'site'), 40))
  on conflict (email) do nothing;
  -- same answer for new and existing e-mails (no enumeration)
  return 'ok';
end $$;
revoke all on function public.subscribe_newsletter(text, boolean, text) from public;
grant execute on function public.subscribe_newsletter(text, boolean, text) to anon, authenticated;

update public.pages
   set body = body || E'\n\n## Newsletter\n\nSe você se inscrever para receber novidades e lançamentos, guardamos apenas o seu e-mail e a data da inscrição, usados somente para comunicações da MIVORA. Você pode pedir o cancelamento a qualquer momento pelos nossos canais de atendimento, e o e-mail é excluído da lista.'
 where slug = 'politica-de-privacidade' and position('## Newsletter' in body) = 0;
