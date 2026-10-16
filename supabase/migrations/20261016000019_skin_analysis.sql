-- MIVORA — "Análise de Pele com IA" (2026-10-16): launch pop-up and home section managed as banners,
-- feature settings, per-product recommendation profile, a daily usage cap and optional saved reports.
-- The photo itself is never stored: it is analysed in memory and discarded. Re-runnable.

-- ---------------------------------------------------------------------------
-- Campaign: two new banner placements (pop-up and home section), with highlights and a footnote
-- ---------------------------------------------------------------------------
alter table public.banners drop constraint if exists banners_placement_check;
alter table public.banners add constraint banners_placement_check
  check (placement in ('hero', 'editorial', 'routines', 'coming_soon', 'skin_popup', 'skin_home'));
alter table public.banners
  add column if not exists highlights text[] not null default '{}',
  add column if not exists footnote text;
alter table public.banners drop constraint if exists banners_highlights_check;
alter table public.banners add constraint banners_highlights_check
  check (cardinality(highlights) <= 5 and coalesce(length(footnote), 0) <= 300);

insert into public.banners (placement, eyebrow, title, subtitle, highlights, cta_label, cta_href, cta2_label, cta2_href, background_color, product_id, image_alt, sort_order)
select 'skin_popup', 'Novidade MIVORA', 'Sua pele fala. A gente te ouve.',
       'Descubra o que sua pele pode estar precisando. Envie uma foto do seu rosto e receba uma análise visual personalizada com sugestões de produtos para sua rotina de skincare.',
       array['Análise visual personalizada.', 'Recomendações de produtos da MIVORA.', 'Sua rotina de skincare em poucos passos.'],
       'Analisar minha pele', '/analise-de-pele', 'Conhecer a novidade', '/#analise-de-pele', '#F6E4E1',
       (select id from public.products where slug = 'medicube-pdrn-pink-peptide-serum'), null, 0
 where not exists (select 1 from public.banners where placement = 'skin_popup');

insert into public.banners (placement, eyebrow, title, subtitle, footnote, cta_label, cta_href, background_color, product_id, sort_order)
select 'skin_home', 'Exclusivo MIVORA', 'Sua pele é única. Sua rotina também deveria ser.',
       'Descubra quais cuidados podem fazer mais sentido para você. Faça uma análise visual da sua pele com IA e encontre produtos selecionados para as suas necessidades.',
       'Rápido, personalizado e pensado para ajudar você a escolher seus produtos.',
       'Fazer minha análise', '/analise-de-pele', '#F7E8E5',
       (select id from public.products where slug = 'skin1004-madagascar-centella-ampoule'), 0
 where not exists (select 1 from public.banners where placement = 'skin_home');

-- ---------------------------------------------------------------------------
-- Settings: switch, pop-up interval and a daily cap on analyses (AI cost control)
-- ---------------------------------------------------------------------------
alter table public.store_settings
  add column if not exists skin_analysis_enabled boolean not null default true,
  add column if not exists skin_popup_interval_days integer not null default 7,
  add column if not exists skin_analysis_daily_limit integer not null default 200;
alter table public.store_settings drop constraint if exists store_settings_skin_popup_interval_check;
alter table public.store_settings add constraint store_settings_skin_popup_interval_check check (skin_popup_interval_days between 1 and 90);
alter table public.store_settings drop constraint if exists store_settings_skin_daily_limit_check;
alter table public.store_settings add constraint store_settings_skin_daily_limit_check check (skin_analysis_daily_limit between 1 and 5000);

-- ---------------------------------------------------------------------------
-- Recommendation profile per product. Needs come from the product's "concern" categories and the routine
-- step from its product type; this table only holds what the categories cannot say.
-- ---------------------------------------------------------------------------
create table if not exists public.product_skin_profiles (
  product_id uuid primary key references public.products (id) on delete cascade,
  recommendable boolean not null default true,
  routine_step text check (routine_step in ('limpeza', 'tonico', 'tratamento', 'olhos', 'hidratante', 'mascara', 'protetor')),
  routine_time text check (routine_time in ('manha', 'noite', 'ambos')),
  precautions text check (length(precautions) <= 600),
  alternative_product_id uuid references public.products (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (alternative_product_id is null or alternative_product_id <> product_id)
);
drop trigger if exists product_skin_profiles_updated_at on public.product_skin_profiles;
create trigger product_skin_profiles_updated_at before update on public.product_skin_profiles
  for each row execute function public.set_updated_at();
alter table public.product_skin_profiles enable row level security;
drop policy if exists "public read skin profiles" on public.product_skin_profiles;
create policy "public read skin profiles" on public.product_skin_profiles for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published') or public.is_admin());
drop policy if exists "admin write skin profiles" on public.product_skin_profiles;
create policy "admin write skin profiles" on public.product_skin_profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.product_skin_profiles from anon;
grant select on public.product_skin_profiles to anon, authenticated;
grant insert, update, delete on public.product_skin_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Daily usage counter (no photo, no personal data): protects the store from runaway AI costs
-- ---------------------------------------------------------------------------
create table if not exists public.skin_analysis_usage (
  day date primary key,
  analyses integer not null default 0
);
alter table public.skin_analysis_usage enable row level security;
drop policy if exists "admin read skin usage" on public.skin_analysis_usage;
create policy "admin read skin usage" on public.skin_analysis_usage for select to authenticated using (public.is_admin());
revoke all on public.skin_analysis_usage from anon, authenticated;
grant select on public.skin_analysis_usage to authenticated;

-- Takes one slot of today's quota (Brasília date). The limit comes from the settings, never from the caller.
create or replace function public.take_skin_analysis_slot()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_used integer;
begin
  select skin_analysis_daily_limit into v_limit from public.store_settings where id = 1;
  insert into public.skin_analysis_usage (day, analyses) values (v_day, 0) on conflict (day) do nothing;
  update public.skin_analysis_usage set analyses = analyses + 1
   where day = v_day and analyses < coalesce(v_limit, 200)
  returning analyses into v_used;
  return v_used is not null;
end;
$$;
revoke all on function public.take_skin_analysis_slot() from public, anon, authenticated;
grant execute on function public.take_skin_analysis_slot() to service_role;

-- ---------------------------------------------------------------------------
-- Saved reports (optional, signed-in customers, separate consent). Text results only — never the photo.
-- Kept for 12 months or until the customer deletes them; at most 20 per account.
-- ---------------------------------------------------------------------------
create table if not exists public.skin_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  result jsonb not null check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 20000),
  created_at timestamptz not null default now()
);
create index if not exists skin_reports_user_idx on public.skin_reports (user_id, created_at desc);
alter table public.skin_reports enable row level security;
drop policy if exists "own skin reports read" on public.skin_reports;
create policy "own skin reports read" on public.skin_reports for select to authenticated using (user_id = auth.uid());
drop policy if exists "own skin reports insert" on public.skin_reports;
create policy "own skin reports insert" on public.skin_reports for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "own skin reports delete" on public.skin_reports;
create policy "own skin reports delete" on public.skin_reports for delete to authenticated using (user_id = auth.uid());
revoke all on public.skin_reports from anon, authenticated;
grant select, insert, delete on public.skin_reports to authenticated;

create or replace function public.skin_reports_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.skin_reports where user_id = new.user_id and created_at < now() - interval '12 months';
  if (select count(*) from public.skin_reports where user_id = new.user_id) >= 20 then
    raise exception 'too_many_reports';
  end if;
  return new;
end;
$$;
drop trigger if exists skin_reports_guard on public.skin_reports;
create trigger skin_reports_guard before insert on public.skin_reports
  for each row execute function public.skin_reports_guard();

-- ---------------------------------------------------------------------------
-- Privacy policy
-- ---------------------------------------------------------------------------
update public.pages
   set body = body || E'\n\n## Análise de pele com IA\n\nA análise de pele é opcional e só acontece com o seu consentimento, dado a cada análise. A foto do rosto é usada apenas para observar características visuais da pele (como aparência de ressecamento, oleosidade, textura e uniformidade) e sugerir produtos cosméticos da MIVORA. A análise é cosmética e informativa: não é diagnóstico médico e não substitui a avaliação de um dermatologista.\n\nA foto é enviada de forma protegida ao nosso servidor, que a repassa ao provedor de inteligência artificial (Anthropic) somente para gerar a análise. Ela não é publicada, não é usada para reconhecer quem você é, não é usada para treinar modelos de IA nem para publicidade, e não fica armazenada na MIVORA: é descartada assim que a análise termina, inclusive quando há erro. Por motivos de segurança, o provedor pode manter os dados recebidos por um período limitado, conforme os termos dele, sem usá-los para treinar modelos.\n\nSe você estiver conectada à sua conta, pode escolher salvar o relatório da análise (somente o texto e os produtos sugeridos, nunca a foto). Ele fica disponível em Minha conta por até 12 meses e pode ser excluído quando você quiser. Para controlar custos, contamos quantas análises são feitas por dia, sem guardar dados pessoais.'
 where slug = 'politica-de-privacidade' and position('## Análise de pele com IA' in body) = 0;
