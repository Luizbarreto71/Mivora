-- "Mais vendido" label on the product photo: a fact the admin registers on the product, like "Novidade".
alter table public.products add column if not exists is_best_seller boolean not null default false;
