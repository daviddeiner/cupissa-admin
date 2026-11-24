-- Ejecutar una vez en SQL Editor. No modifica políticas existentes.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create or replace function public.cupissa_costura_promover()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  update public.pedidos_web set estado='EN FABRICACIÓN'
  where estado='AGENDADO' and fecha_entrega::date <= (now() at time zone 'America/Bogota')::date + 3;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function public.cupissa_costura_promover() from public,anon,authenticated;
-- También aplica al crear/reagendar un pedido dentro del plazo.
create or replace function public.cupissa_costura_fecha_trigger()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.estado='AGENDADO' and new.fecha_entrega::date <= (now() at time zone 'America/Bogota')::date + 3 then
    new.estado := 'EN FABRICACIÓN';
  end if;
  return new;
end; $$;
drop trigger if exists cupissa_costura_fecha on public.pedidos_web;
create trigger cupissa_costura_fecha before insert or update of fecha_entrega,estado on public.pedidos_web for each row execute function public.cupissa_costura_fecha_trigger();
-- Lista privada de operarios: añadir únicamente usuarios de Authentication autorizados.
create table if not exists public.cupissa_costura_usuarios (usuario_id uuid primary key references auth.users(id) on delete cascade);
alter table public.cupissa_costura_usuarios enable row level security;
revoke all on public.cupissa_costura_usuarios from public,anon,authenticated;
create or replace function public.cupissa_costura_autorizado()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and (lower(trim(u.email))='contacto@cupissa.com' or exists(select 1 from public.cupissa_costura_usuarios c where c.usuario_id=u.id)));
$$;
revoke all on function public.cupissa_costura_autorizado() from public,anon;
grant execute on function public.cupissa_costura_autorizado() to authenticated;
create or replace function public.cupissa_costura_pedidos(p_offset integer default 0,p_fecha date default null)
returns setof jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.cupissa_costura_autorizado() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 return query select jsonb_build_object('id',p.id,'estado',p.estado,'fecha_entrega',p.fecha_entrega,'numero_pedido',coalesce(to_jsonb(p)->>'numero_pedido',to_jsonb(p)->>'codigo'),'cliente_nombre',coalesce(nullif(to_jsonb(p)->>'cliente_nombre',''),nullif(concat_ws(' ',c.nombres,c.apellidos),'')),'telefono',coalesce(nullif(to_jsonb(p)->>'contacto',''),nullif(to_jsonb(p)->>'telefono',''),to_jsonb(c)->>'telefono'),'ubicacion',coalesce(nullif(to_jsonb(p)->>'ubicacion',''),nullif(concat_ws(', ',nullif(to_jsonb(p)->>'direccion',''),nullif(to_jsonb(p)->>'barrio',''),nullif(to_jsonb(p)->>'ciudad','')),''),to_jsonb(c)->>'direccion'),'total',to_jsonb(p)->'total','envio',coalesce(nullif(to_jsonb(p)->'envio','null'::jsonb),nullif(to_jsonb(p)->'domicilio_envio','null'::jsonb),to_jsonb(p)->'domicilio'),'anticipo',to_jsonb(p)->'anticipo','productos',to_jsonb(p)->'productos','imagenes',to_jsonb(p)->'imagenes','nota',to_jsonb(p)->>'nota','indicaciones',to_jsonb(p)->>'indicaciones','tipo_pedido',coalesce(to_jsonb(p)->>'tipo_pedido',to_jsonb(p)->>'tipo_servicio'))
 from public.pedidos_web p left join lateral (select cw.* from public.clientes_web cw where cw.id::text in (to_jsonb(p)->>'cliente_web_id',to_jsonb(p)->>'cliente_id') or to_jsonb(cw)->>'cliente_id' in (to_jsonb(p)->>'cliente_web_id',to_jsonb(p)->>'cliente_id') order by cw.id limit 1) c on true
 where p.estado in ('AGENDADO','EN FABRICACIÓN') and (p_fecha is null or p.fecha_entrega::date=p_fecha)
 order by p.fecha_entrega asc nulls last,p.id offset greatest(coalesce(p_offset,0),0) limit 100;
end; $$;
revoke all on function public.cupissa_costura_pedidos(integer,date) from public,anon;
grant execute on function public.cupissa_costura_pedidos(integer,date) to authenticated;
create or replace function public.cupissa_costura_fabricado(p_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.cupissa_costura_autorizado() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 update public.pedidos_web set estado='EN DEPARTAMENTO DE DESPACHO' where id::text=p_id and estado in ('AGENDADO','EN FABRICACIÓN');
 return found;
end; $$;
revoke all on function public.cupissa_costura_fabricado(text) from public,anon;
grant execute on function public.cupissa_costura_fabricado(text) to authenticated;
-- Medianoche Colombia = 05:00 UTC; revisión cada minuto para recuperación automática.
select cron.schedule('cupissa-costura-promover','* * * * *','select public.cupissa_costura_promover();');
select public.cupissa_costura_promover();
commit;
-- Opcional, para autorizar un operario previamente creado y confirmado en Authentication:
-- insert into public.cupissa_costura_usuarios(usuario_id) select id from auth.users where lower(email)='correo-del-operario' on conflict do nothing;
-- Para revocar acceso: delete from public.cupissa_costura_usuarios where usuario_id=(select id from auth.users where lower(email)='correo-del-operario');
