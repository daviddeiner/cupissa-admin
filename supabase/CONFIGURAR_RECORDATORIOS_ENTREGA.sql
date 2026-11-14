-- CUPISSA | Ejecutar UNA VEZ en Supabase > SQL Editor.
-- Requiere desplegar antes la Edge Function cupissa-recordatorio-entrega.
-- Con service_role JWT puedes mantener Verify JWT activado.
-- NO se editan pedidos_web, clientes, créditos ni las Edge Functions existentes.
-- IMPORTANTE: guarda tu clave antigua service_role JWT en Supabase Vault como
-- 'cupissa_delivery_service_role' (es la misma que SUPABASE_SERVICE_ROLE_KEY de Edge Secrets).
-- Ejemplo, ejecutar SOLO UNA VEZ reemplazando el texto:
-- select vault.create_secret('PEGA_AQUI_TU_SERVICE_ROLE_JWT','cupissa_delivery_service_role');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.cupissa_avisos_entrega (
  id bigint generated always as identity primary key,
  pedido_id text not null,
  fecha_entrega date not null,
  correo text not null,
  estado text not null default 'procesando' check (estado in ('procesando','enviado','fallido')),
  reservado_en timestamptz not null default now(),
  enviado_en timestamptz,
  detalle_error text,
  constraint cupissa_avisos_entrega_unico unique (pedido_id, fecha_entrega)
);
create index if not exists cupissa_avisos_entrega_fecha_idx on public.cupissa_avisos_entrega(fecha_entrega,estado);
alter table public.cupissa_avisos_entrega enable row level security;
revoke all on public.cupissa_avisos_entrega from public,anon,authenticated;
revoke all on sequence public.cupissa_avisos_entrega_id_seq from public,anon,authenticated;
grant select,insert,update,delete on public.cupissa_avisos_entrega to service_role;
grant usage,select on sequence public.cupissa_avisos_entrega_id_seq to service_role;

-- Reserva atómica con reintento de fallidos o procesos interrumpidos hace >20 min.
create or replace function public.cupissa_reservar_aviso_entrega(
  p_pedido_id text,p_fecha_entrega date,p_correo text
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id bigint;
begin
  insert into public.cupissa_avisos_entrega(pedido_id,fecha_entrega,correo)
  values (p_pedido_id,p_fecha_entrega,p_correo)
  on conflict (pedido_id,fecha_entrega) do update
    set estado='procesando',reservado_en=now(),correo=excluded.correo,detalle_error=null
    where cupissa_avisos_entrega.estado='fallido'
      or (cupissa_avisos_entrega.estado='procesando'
          and cupissa_avisos_entrega.reservado_en<now()-interval '20 minutes')
  returning id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.cupissa_reservar_aviso_entrega(text,date,text) from public,anon,authenticated;
grant execute on function public.cupissa_reservar_aviso_entrega(text,date,text) to service_role;

-- Envía una solicitud privada a la Edge Function. La función comprueba hora y estado.
create or replace function public.cupissa_disparar_avisos_entrega(p_ahora boolean default false)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_key text; v_request bigint;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets
   where name='cupissa_delivery_service_role' limit 1;
  if v_key is null or length(v_key)<30 then
    raise exception 'Falta el secreto cupissa_delivery_service_role en Supabase Vault';
  end if;
  select net.http_post(
    url:='https://lkdxtesgwqoizobxaawp.supabase.co/functions/v1/cupissa-recordatorio-entrega',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key),
    body:=jsonb_build_object('mode',case when p_ahora then 'now' else 'scheduled' end),
    timeout_milliseconds:=15000
  ) into v_request;
  return v_request;
end;
$$;
revoke all on function public.cupissa_disparar_avisos_entrega(boolean) from public,anon,authenticated;
grant execute on function public.cupissa_disparar_avisos_entrega(boolean) to service_role;

-- pg_cron funciona en UTC: 12:00 UTC = 7:00 a. m. de Colombia.
select cron.schedule('cupissa-recordatorio-entrega-7am','0 12 * * *',
  'select public.cupissa_disparar_avisos_entrega(false)');

-- Para enviar HOY sin esperar a las 7:00 a. m., ejecutar POR SEPARADO:
-- select public.cupissa_disparar_avisos_entrega(true) as solicitud_en_cola;

-- Ver resultados de entregas por día (solo SQL Editor):
-- select * from public.cupissa_avisos_entrega order by reservado_en desc limit 100;
