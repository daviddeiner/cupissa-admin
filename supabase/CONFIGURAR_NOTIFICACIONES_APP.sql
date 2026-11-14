-- CUPISSA APP | Notificaciones push. Ejecutar UNA VEZ en SQL Editor.
-- No modifica datos existentes en pedidos_web ni en clientes_web.

create table if not exists public.cupissa_push_settings (
  id int primary key default 1 check (id=1),
  vapid_public text not null,
  vapid_private text not null,
  created_at timestamptz default now()
);
create table if not exists public.cupissa_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null,
  subscription jsonb not null,
  active boolean not null default true,
  updated_at timestamptz default now()
);
create index if not exists cupissa_push_subscriptions_user_idx
  on public.cupissa_push_subscriptions(user_id) where active;

create table if not exists public.cupissa_push_outbox (
  id bigint generated always as identity primary key,
  pedido_id text not null,
  estado text not null,
  creado_en timestamptz not null default now(),
  procesado_en timestamptz,
  intentos int not null default 0,
  error text
);
create index if not exists cupissa_push_outbox_pending_idx
  on public.cupissa_push_outbox(id) where procesado_en is null;

create table if not exists public.cupissa_push_campaigns (
  id bigint generated always as identity primary key,
  titulo text not null,
  mensaje text not null,
  enlace text not null,
  enviado_por text,
  enviado_en timestamptz default now(),
  destinatarios int not null default 0,
  exitos int not null default 0
);

alter table public.cupissa_push_settings enable row level security;
alter table public.cupissa_push_subscriptions enable row level security;
alter table public.cupissa_push_outbox enable row level security;
alter table public.cupissa_push_campaigns enable row level security;
revoke all on public.cupissa_push_settings,public.cupissa_push_subscriptions,
  public.cupissa_push_outbox,public.cupissa_push_campaigns from public,anon,authenticated;
grant all on public.cupissa_push_settings,public.cupissa_push_subscriptions,
  public.cupissa_push_outbox,public.cupissa_push_campaigns to service_role;
grant usage,select on sequence public.cupissa_push_outbox_id_seq,public.cupissa_push_campaigns_id_seq to service_role;

-- Cada cambio de estado agrega una única tarea. Nunca se envía desde el navegador.
create or replace function public.cupissa_push_order_status_event()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.estado is distinct from new.estado then
    insert into public.cupissa_push_outbox(pedido_id,estado)
      values (new.id::text,coalesce(new.estado,'ACTUALIZADO'));
  end if;
  return new;
end;
$$;
drop trigger if exists cupissa_push_order_status_change on public.pedidos_web;
create trigger cupissa_push_order_status_change
after update of estado on public.pedidos_web
for each row execute function public.cupissa_push_order_status_event();

-- Para descargar y despachar tareas pendientes, cron llama a la misma Edge
-- con la credencial service_role ya guardada en Vault para CUPISSA.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create or replace function public.cupissa_ejecutar_push_pendientes()
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_key text; v_id bigint;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets
    where name='cupissa_delivery_service_role' limit 1;
  if v_key is null then raise exception 'Falta cupissa_delivery_service_role en Vault'; end if;
  select net.http_post(
    url:='https://lkdxtesgwqoizobxaawp.supabase.co/functions/v1/cupissa-push',
    headers:=jsonb_build_object('content-type','application/json','apikey',v_key,'Authorization','Bearer '||v_key),
    body:='{"action":"process"}'::jsonb,
    timeout_milliseconds:=15000
  ) into v_id;
  return v_id;
end;
$$;
revoke all on function public.cupissa_ejecutar_push_pendientes() from public,anon,authenticated;
select cron.schedule('cupissa-push-pedidos','* * * * *',
  'select public.cupissa_ejecutar_push_pendientes()');

-- Comprobación de tareas pendientes:
-- select id,pedido_id,estado,intentos,error from public.cupissa_push_outbox
-- where procesado_en is null order by id desc limit 30;
