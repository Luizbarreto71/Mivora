-- How a product photo fills the square frame: 'contain' for packshots on white (the product keeps its margins),
-- 'cover' for ambience and texture photos that fill the whole frame.
alter table public.product_images add column if not exists fit text not null default 'contain';
do $$ begin
  alter table public.product_images add constraint product_images_fit_check check (fit in ('contain', 'cover'));
exception when duplicate_object then null; end $$;
