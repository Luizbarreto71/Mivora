-- MIVORA — skin analysis pop-up on every page load (owner's request, 2026-10-16).
-- Interval 0 = the pop-up opens each time the site is loaded or reloaded; 1 to 90 = days before it returns
-- after being closed. Re-runnable.
alter table public.store_settings drop constraint if exists store_settings_skin_popup_interval_check;
alter table public.store_settings add constraint store_settings_skin_popup_interval_check check (skin_popup_interval_days between 0 and 90);
alter table public.store_settings alter column skin_popup_interval_days set default 0;
update public.store_settings set skin_popup_interval_days = 0 where id = 1 and skin_popup_interval_days = 7;
