-- MIVORA — the shipping calculator lists at most N carrier services (the fastest plus the cheapest).
-- 0 shows every service returned by Melhor Envio. Re-runnable.
alter table public.store_settings
  add column if not exists shipping_max_carrier_options integer not null default 4
    check (shipping_max_carrier_options between 0 and 20);
