-- MIVORA — "Comunidade VIP" (2026-10-26): the admin pastes the day's perfume list, the AI researches
-- each perfume and writes a post, the admin approves the day and the posts go out one at a time to
-- the WhatsApp community's announcement group (Z-API). Everything here is admin-only. Re-runnable.

-- ---------------------------------------------------------------------------
-- Settings (one row)
-- ---------------------------------------------------------------------------
create table if not exists public.vip_settings (
  id smallint primary key default 1 check (id = 1),
  sending_enabled boolean not null default false,
  community_name text check (length(community_name) <= 120),
  -- the announcement group of the community, as Z-API names it ("1203…-group")
  announcement_group_id text check (announcement_group_id ~ '^[0-9]{6,40}(-group)?$'),
  first_post_time time not null default '10:00',
  last_post_time time not null default '21:00',
  interval_minutes integer not null default 90 check (interval_minutes between 15 and 720),
  footer text check (length(footer) <= 300),
  -- the admin's own WhatsApp, to receive a preview of a post before the community does
  preview_phone text check (preview_phone ~ '^[0-9]{10,15}$'),
  dedupe_days integer not null default 7 check (dedupe_days between 0 and 90),
  updated_at timestamptz not null default now(),
  check (first_post_time < last_post_time)
);
insert into public.vip_settings (id) values (1) on conflict (id) do nothing;
drop trigger if exists vip_settings_updated_at on public.vip_settings;
create trigger vip_settings_updated_at before update on public.vip_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Olfactory sheet per perfume, researched once on the web and reused (with its sources)
-- ---------------------------------------------------------------------------
create table if not exists public.vip_fragrances (
  id uuid primary key default gen_random_uuid(),
  lookup_key text not null unique,
  identified_as text check (length(identified_as) <= 200),
  status text not null check (status in ('confirmada', 'parcial', 'nao_encontrada')),
  concentration text check (length(concentration) <= 60),
  gender text check (length(gender) <= 40),
  family text check (length(family) <= 160),
  top_notes text[] not null default '{}',
  heart_notes text[] not null default '{}',
  base_notes text[] not null default '{}',
  general_notes text[] not null default '{}',
  profile text check (length(profile) <= 800),
  occasions text[] not null default '{}',
  remarks text check (length(remarks) <= 800),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  researched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists vip_fragrances_updated_at on public.vip_fragrances;
create trigger vip_fragrances_updated_at before update on public.vip_fragrances
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The day's list and its posts
-- ---------------------------------------------------------------------------
create table if not exists public.vip_batches (
  id uuid primary key default gen_random_uuid(),
  list_text text not null check (length(list_text) between 3 and 20000),
  status text not null default 'rascunho' check (status in ('rascunho', 'aprovado', 'cancelado')),
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists vip_batches_updated_at on public.vip_batches;
create trigger vip_batches_updated_at before update on public.vip_batches
  for each row execute function public.set_updated_at();

create table if not exists public.vip_posts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.vip_batches (id) on delete cascade,
  position integer not null,
  source_line text not null check (length(source_line) <= 2000),
  brand text check (length(brand) <= 120),
  name text not null check (length(name) <= 200),
  concentration text check (length(concentration) <= 60),
  volume_ml integer check (volume_ml between 1 and 5000),
  price_cents integer check (price_cents > 0),
  details text check (length(details) <= 500),
  dedupe_key text not null,
  product_id uuid references public.products (id) on delete set null,
  fragrance_id uuid references public.vip_fragrances (id) on delete set null,
  image_url text check (length(image_url) <= 2000),
  body text check (length(body) <= 4000),
  -- pendente: waiting for research/writing · pronto: ready to approve · revisar: needs the admin's eye
  -- erro: the AI failed · ignorado · agendado: approved, waiting for its time · enviando · enviado · falhou
  status text not null default 'pendente'
    check (status in ('pendente', 'pronto', 'revisar', 'erro', 'ignorado', 'agendado', 'enviando', 'enviado', 'falhou')),
  problems text[] not null default '{}',
  scheduled_for timestamptz,
  sent_at timestamptz,
  provider_message_id text check (length(provider_message_id) <= 200),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, position),
  check (status <> 'agendado' or scheduled_for is not null),
  check (status <> 'enviado' or (sent_at is not null and provider_message_id is not null))
);
create index if not exists vip_posts_due_idx on public.vip_posts (status, scheduled_for);
create index if not exists vip_posts_dedupe_idx on public.vip_posts (dedupe_key, status);
drop trigger if exists vip_posts_updated_at on public.vip_posts;
create trigger vip_posts_updated_at before update on public.vip_posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access: admins only (the sender uses the service role)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['vip_settings', 'vip_fragrances', 'vip_batches', 'vip_posts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin all %s" on public.%I', t, t);
    execute format('create policy "admin all %s" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Sender: takes the next due post, at most one at a time, only inside the daily window and
-- never closer than half the interval (capped at 30 min) to the previous post. A post left
-- "enviando" for 15 minutes is marked as failed: Z-API never confirmed it, so the admin checks
-- the group before trying again (never sent twice by the system).
-- ---------------------------------------------------------------------------
create or replace function public.vip_claim_next_post()
returns setof public.vip_posts
language plpgsql security definer set search_path = '' as $$
declare
  s public.vip_settings;
  local_time time := (now() at time zone 'America/Sao_Paulo')::time;
begin
  update public.vip_posts
     set status = 'falhou',
         problems = array['O envio não foi confirmado pela Z-API. Confira no grupo se o post saiu antes de tentar de novo.']
   where status = 'enviando' and updated_at < now() - interval '15 minutes';

  select * into s from public.vip_settings where id = 1;
  if s is null or not s.sending_enabled or s.announcement_group_id is null then return; end if;
  if local_time < s.first_post_time or local_time > s.last_post_time then return; end if;
  if exists (
    select 1 from public.vip_posts
     where status in ('enviando', 'enviado')
       and coalesce(sent_at, updated_at) > now() - make_interval(mins => least(s.interval_minutes / 2, 30))
  ) then return; end if;

  return query
    update public.vip_posts p
       set status = 'enviando', attempts = p.attempts + 1, problems = '{}'
     where p.id = (
       select q.id from public.vip_posts q
        where q.status = 'agendado' and q.scheduled_for <= now()
        order by q.scheduled_for, q.position
        limit 1
        for update skip locked
     )
    returning p.*;
end $$;
revoke all on function public.vip_claim_next_post() from public, anon, authenticated;
grant execute on function public.vip_claim_next_post() to service_role;

-- ---------------------------------------------------------------------------
-- Clock: every 5 minutes the database asks the site to send what is due (pg_cron + pg_net, both
-- available on Supabase). Skipped where the extensions do not exist (local tests).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule(
      'mivora-comunidade-vip',
      '*/5 * * * *',
      $job$ select net.http_post(
        url := 'https://mivoracosmeticos.com.br/api/cron/comunidade-vip',
        body := '{}'::jsonb,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 60000
      ) $job$
    );
  end if;
end $$;
