-- Ejecutar primero, una sola vez en Supabase SQL Editor.
begin;
alter table public.productos add column if not exists black_friday_pct integer not null default 0;
alter table public.productos drop constraint if exists productos_black_friday_pct_check;
alter table public.productos add constraint productos_black_friday_pct_check check (black_friday_pct between 0 and 99);
create index if not exists productos_black_friday_publicados_idx on public.productos(id) where black_friday_pct > 0 and oculto = false;
commit;
notify pgrst, 'reload schema';
