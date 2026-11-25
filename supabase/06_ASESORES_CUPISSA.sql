BEGIN;
-- Usa columnas nuevas para no reemplazar identificadores existentes de asesores.
CREATE TABLE IF NOT EXISTS public.asesores (asesor_uid uuid REFERENCES auth.users(id) ON DELETE RESTRICT);
ALTER TABLE public.asesores ADD COLUMN IF NOT EXISTS asesor_uid uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.asesores ADD COLUMN IF NOT EXISTS nombre_asesor text;
-- Compatibilidad con la columna heredada nombre, si existe.
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asesores' AND column_name='nombre') THEN ALTER TABLE public.asesores ALTER COLUMN nombre DROP NOT NULL; END IF; END $$;
ALTER TABLE public.asesores ADD COLUMN IF NOT EXISTS telefono_asesor text;
ALTER TABLE public.asesores ADD COLUMN IF NOT EXISTS activo_asesor boolean NOT NULL DEFAULT true;
ALTER TABLE public.asesores ADD COLUMN IF NOT EXISTS creado_asesor timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS cupissa_asesor_uid_unique ON public.asesores(asesor_uid);
CREATE UNIQUE INDEX IF NOT EXISTS cupissa_asesor_phone_unique ON public.asesores(telefono_asesor);
ALTER TABLE public.asesores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_web ADD COLUMN IF NOT EXISTS asesor_uid uuid REFERENCES public.asesores(asesor_uid) ON DELETE RESTRICT;
ALTER TABLE public.pedidos_web ADD COLUMN IF NOT EXISTS asesor_solicitud uuid;
ALTER TABLE public.pedidos_web ADD COLUMN IF NOT EXISTS asesor_creado_por uuid;
CREATE UNIQUE INDEX IF NOT EXISTS cupissa_asesor_solicitud_unique ON public.pedidos_web(asesor_solicitud);
ALTER TABLE public.pedidos_web ADD COLUMN IF NOT EXISTS asesor_deposito numeric NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS cupissa_asesor_pedido_fecha ON public.pedidos_web(asesor_uid,fecha_entrega);
CREATE OR REPLACE FUNCTION public.cupissa_es_admin_seguro() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND lower(trim(u.email))='contacto@cupissa.com' AND u.email_confirmed_at IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.cupissa_es_admin_seguro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cupissa_es_admin_seguro() TO authenticated;
DROP POLICY IF EXISTS cupissa_asesores_solo_admin ON public.asesores;
CREATE POLICY cupissa_asesores_solo_admin ON public.asesores AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.cupissa_es_admin_seguro())) WITH CHECK ((SELECT public.cupissa_es_admin_seguro()));
DROP POLICY IF EXISTS cupissa_asesores_sin_anon ON public.asesores;
CREATE POLICY cupissa_asesores_sin_anon ON public.asesores AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE OR REPLACE FUNCTION public.cupissa_asesor_identidad() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT CASE WHEN public.cupissa_es_admin_seguro() THEN jsonb_build_object('admin',true,'nombre','Administrador CUPISSA') ELSE (SELECT jsonb_build_object('admin',false,'nombre',a.nombre_asesor) FROM public.asesores a WHERE a.asesor_uid=auth.uid() AND a.activo_asesor) END;
$$;
CREATE OR REPLACE FUNCTION public.cupissa_es_cuenta_asesor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT EXISTS(SELECT 1 FROM public.asesores WHERE asesor_uid=auth.uid()) OR coalesce(auth.jwt()->'app_metadata'->>'cupissa_asesor','false')='true';
$$;
CREATE OR REPLACE FUNCTION public.cupissa_admin_asesores() RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN IF NOT public.cupissa_es_admin_seguro() THEN RAISE EXCEPTION 'No autorizado'; END IF;
RETURN QUERY SELECT jsonb_build_object('asesor_uid',a.asesor_uid,'nombre_asesor',a.nombre_asesor,'activo',a.activo_asesor) FROM public.asesores a WHERE a.asesor_uid IS NOT NULL ORDER BY a.nombre_asesor; END; $$;
-- Niega acceso directo a los módulos internos a cuentas de asesor, incluso si existe una política permisiva anterior.
DO $$ DECLARE t text; rls_previo boolean; BEGIN FOREACH t IN ARRAY ARRAY['asesores','productos','clientes','clientes_web','creditos','cuotas_credito','pagos_credito','pedidos_web','pedidos_web_productos','configuracion_destacados_web','configuracion_pedidos_web','cupissa_stock_alquiler','cupissa_revision_cupos','domiciliarios','domicilios','cupissa_domiciliarios','cupissa_domicilios','cupissa_costura_usuarios'] LOOP
IF to_regclass('public.'||t) IS NOT NULL THEN
SELECT relrowsecurity INTO rls_previo FROM pg_class WHERE oid=to_regclass('public.'||t);
-- Conserva el comportamiento previo si la tabla aún no usaba RLS.
IF NOT rls_previo THEN
 EXECUTE format('CREATE POLICY cupissa_asesor_compatibilidad_previa ON public.%I FOR ALL TO public USING (true) WITH CHECK (true)',t);
END IF;
EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
EXECUTE format('DROP POLICY IF EXISTS cupissa_asesor_sin_acceso_directo ON public.%I',t);
EXECUTE format('CREATE POLICY cupissa_asesor_sin_acceso_directo ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT public.cupissa_es_cuenta_asesor())) WITH CHECK (NOT (SELECT public.cupissa_es_cuenta_asesor()))',t);
END IF; END LOOP; END $$;
CREATE OR REPLACE FUNCTION public.cupissa_asesor_catalogo(p_q text,p_tipo text,p_offset integer DEFAULT 0) RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN IF public.cupissa_asesor_identidad() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
RETURN QUERY SELECT jsonb_build_object('id',p.id,'nombre',p.nombre,'referencia',to_jsonb(p)->'referencia','precio_detal',p.precio_detal,'precio_alquiler',p.precio_alquiler,'valor_deposito',p.valor_deposito,'alquiler',p.alquiler,'venta',p.venta,'tallas',to_jsonb(p)->'tallas','colores',to_jsonb(p)->'colores','accesorios',to_jsonb(p)->'accesorios','fotos',to_jsonb(p)->'fotos') FROM public.productos p WHERE (p_tipo='ALQUILER' AND p.alquiler IS TRUE OR p_tipo='VENTA' AND p.venta IS DISTINCT FROM false) AND (coalesce(p_q,'')='' OR p.nombre ILIKE '%'||p_q||'%') ORDER BY p.id OFFSET greatest(0,p_offset) LIMIT 100; END; $$;
CREATE OR REPLACE FUNCTION public.cupissa_asesor_cliente(p_correo text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c jsonb; BEGIN IF public.cupissa_asesor_identidad() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
IF p_correo IS NULL OR p_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'Correo inválido'; END IF;
IF (SELECT count(*) FROM public.clientes_web WHERE lower(trim(correo))=lower(trim(p_correo)))>1 THEN RAISE EXCEPTION 'Correo duplicado: contacta al administrador'; END IF;
SELECT jsonb_build_object('nombres',nombres,'apellidos',apellidos,'cedula',cedula,'telefono',telefono,'direccion',direccion,'barrio',barrio,'ciudad',ciudad) INTO c FROM public.clientes_web WHERE lower(trim(correo))=lower(trim(p_correo)); RETURN c; END; $$;
CREATE OR REPLACE FUNCTION public.cupissa_asesor_fechas(p_mes date) RETURNS TABLE(fecha date,cupos integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE lim integer; ini date; BEGIN IF public.cupissa_asesor_identidad() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
SELECT max_pedidos_diarios INTO lim FROM public.configuracion_pedidos_web WHERE id=1; IF lim IS NULL OR lim<1 THEN RAISE EXCEPTION 'Límite diario no configurado'; END IF;
ini=date_trunc('month',p_mes)::date;
RETURN QUERY SELECT d::date,(lim-count(o.id))::integer FROM generate_series(ini::timestamp,(ini+interval '1 month - 1 day')::timestamp,interval '1 day') d LEFT JOIN public.pedidos_web o ON o.fecha_entrega::date=d::date AND o.asesor_uid IS NOT NULL AND upper(coalesce(o.estado::text,''))<>'CANCELADO' WHERE d::date >= (now() AT TIME ZONE 'America/Bogota')::date+2 GROUP BY d HAVING count(o.id)<lim ORDER BY d; END; $$;
-- Variantes como en admin; alquiler no aumenta por talla o color.
CREATE OR REPLACE FUNCTION public.cupissa_asesor_incremento(p_lista jsonb,p_nombre text) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
SELECT coalesce((SELECT greatest(0,coalesce(nullif(x->>'incremento','')::numeric,nullif(x->>'adicional','')::numeric,0)) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lista)='array' THEN p_lista ELSE '[]'::jsonb END) x WHERE lower(trim(x->>'nombre'))=lower(trim(p_nombre)) LIMIT 1),0); $$;
CREATE OR REPLACE FUNCTION public.cupissa_asesor_guardar(p_cliente jsonb,p_fecha date,p_tipo text,p_productos jsonb,p_envio numeric,p_anticipo numeric,p_solicitud uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ident jsonb; uid uuid; admin boolean; lim integer; n integer; c public.clientes_web%ROWTYPE; c_input public.clientes_web%ROWTYPE; o public.pedidos_web%ROWTYPE; o_input public.pedidos_web%ROWTYPE; p public.productos%ROWTYPE; item jsonb; acc jsonb; items jsonb:='[]'; k text; email text; qty integer; base numeric; dep numeric; dep_total numeric:=0; manual numeric; inc numeric; acc_total numeric; unit numeric; total numeric:=0; name text; BEGIN
ident=public.cupissa_asesor_identidad(); IF ident IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF; admin=(ident->>'admin')::boolean; uid=CASE WHEN admin THEN NULL ELSE auth.uid() END;
IF p_solicitud IS NULL THEN RAISE EXCEPTION 'Solicitud inválida'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('cupissa-asesor-solicitud:'||p_solicitud::text,0));
SELECT * INTO o FROM public.pedidos_web WHERE asesor_solicitud=p_solicitud;
IF FOUND THEN IF o.asesor_creado_por IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Solicitud inválida'; END IF; RETURN jsonb_build_object('id',o.id,'total',o.total,'deposito',o.asesor_deposito); END IF;
IF p_tipo IS NULL OR p_tipo NOT IN ('VENTA','ALQUILER') OR p_fecha IS NULL THEN RAISE EXCEPTION 'Modalidad o fecha inválida'; END IF;
IF NOT admin THEN
 IF p_fecha<(now() AT TIME ZONE 'America/Bogota')::date+2 THEN RAISE EXCEPTION 'Debes agendar con dos días de anticipación'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('cupissa-asesores-fecha:'||p_fecha::text,0));
 SELECT max_pedidos_diarios INTO lim FROM public.configuracion_pedidos_web WHERE id=1; IF lim IS NULL OR lim<1 THEN RAISE EXCEPTION 'Límite diario no configurado'; END IF;
 SELECT count(*) INTO n FROM public.pedidos_web WHERE fecha_entrega::date=p_fecha AND asesor_uid IS NOT NULL AND upper(coalesce(estado::text,''))<>'CANCELADO'; IF n>=lim THEN RAISE EXCEPTION 'Fecha ocupada: selecciona otra'; END IF;
END IF;
IF p_envio IS NULL OR p_anticipo IS NULL OR p_envio<0 OR p_anticipo<0 OR p_envio>1000000000 OR p_anticipo>1000000000 THEN RAISE EXCEPTION 'Valores inválidos'; END IF;
IF jsonb_typeof(p_productos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_productos) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Agrega entre 1 y 100 líneas de productos'; END IF;
FOR item IN SELECT value FROM jsonb_array_elements(p_productos) LOOP
 qty=(item->>'cantidad')::integer; base=(item->>'precio_base')::numeric; manual=coalesce((item->>'incremento_manual')::numeric,0); dep=0; inc=0; acc_total=0; name=trim(item->>'nombre');
 IF qty IS NULL OR qty NOT BETWEEN 1 AND 100000 OR base IS NULL OR base<0 OR base>1000000000 OR manual<0 OR manual>1000000000 THEN RAISE EXCEPTION 'Precio o cantidad inválida'; END IF;
 IF nullif(item->>'producto_id','') IS NOT NULL THEN
 SELECT * INTO p FROM public.productos WHERE id::text=item->>'producto_id'; IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
 IF p_tipo='ALQUILER' THEN IF p.alquiler IS DISTINCT FROM true THEN RAISE EXCEPTION 'Producto no disponible para alquiler'; END IF; dep=coalesce(nullif(p.valor_deposito::text,'')::numeric,0);
 ELSE IF p.venta IS FALSE THEN RAISE EXCEPTION 'Producto no disponible para venta'; END IF; inc=public.cupissa_asesor_incremento(to_jsonb(p)->'tallas',item->>'talla')+public.cupissa_asesor_incremento(to_jsonb(p)->'colores',item->>'color'); END IF; name=p.nombre;
 ELSIF p_tipo='ALQUILER' THEN dep=coalesce((item->>'deposito_unitario')::numeric,0); END IF;
 IF name IS NULL OR name='' OR dep<0 OR dep>base THEN RAISE EXCEPTION 'Nombre o depósito incluido inválido'; END IF;
 FOR acc IN SELECT value FROM jsonb_array_elements(coalesce(item->'accesorios','[]'::jsonb)) LOOP
 IF coalesce((acc->>'incremento')::numeric,0)<0 OR coalesce((acc->>'incremento')::numeric,0)>1000000000 THEN RAISE EXCEPTION 'Incremento inválido'; END IF; acc_total=acc_total+coalesce((acc->>'incremento')::numeric,0); END LOOP;
 unit=base+manual+inc+acc_total; total=total+unit*qty; dep_total=dep_total+dep*qty;
 items=items||jsonb_build_array(jsonb_build_object('producto_id',item->'producto_id','nombre',name,'precio',unit,'precio_base',base,'cantidad',qty,'incremento_manual',manual,'incremento_variantes',inc,'deposito_unitario',dep,'modalidad',p_tipo,'talla',item->>'talla','color',item->>'color','referencia',item->>'referencia','datos_personalizacion',item->>'referencia','imagen_url',item->>'imagen_url','accesorios',coalesce(item->'accesorios','[]'::jsonb),'accesorio',(SELECT string_agg(x->>'nombre',', ') FROM jsonb_array_elements(coalesce(item->'accesorios','[]'::jsonb)) x))); 
END LOOP;
IF total>1000000000 OR p_anticipo>total+p_envio THEN RAISE EXCEPTION 'Total o anticipo inválido'; END IF;
FOREACH k IN ARRAY ARRAY['correo','nombres','apellidos','telefono','direccion','barrio','ciudad'] LOOP IF coalesce(trim(p_cliente->>k),'')='' THEN RAISE EXCEPTION 'Campo obligatorio: %',k; END IF; END LOOP;
email=lower(trim(p_cliente->>'correo')); IF email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'Correo inválido'; END IF;
-- Serializa altas de clientes por correo y por teléfono entre asesores.
PERFORM pg_advisory_xact_lock(hashtextextended('cupissa-asesor-clientes',0));
IF (SELECT count(*) FROM public.clientes_web WHERE lower(trim(correo))=email)>1 THEN RAISE EXCEPTION 'Correo duplicado: contacta al administrador'; END IF;
SELECT * INTO c FROM public.clientes_web WHERE lower(trim(correo))=email FOR UPDATE;
IF length(regexp_replace(p_cliente->>'telefono','[^0-9]','','g'))<7 THEN RAISE EXCEPTION 'Teléfono inválido'; END IF;
IF EXISTS(SELECT 1 FROM public.clientes_web x WHERE right(regexp_replace(coalesce(x.telefono::text,''),'[^0-9]','','g'),10)=right(regexp_replace(p_cliente->>'telefono','[^0-9]','','g'),10) AND (c.id IS NULL OR x.id<>c.id)) THEN RAISE EXCEPTION 'El teléfono pertenece a otro cliente'; END IF;
c_input=jsonb_populate_record(NULL::public.clientes_web,jsonb_build_object('nombres',trim(p_cliente->>'nombres'),'apellidos',trim(p_cliente->>'apellidos'),'cedula',nullif(trim(p_cliente->>'cedula'),''),'telefono',trim(p_cliente->>'telefono'),'correo',email,'direccion',trim(p_cliente->>'direccion'),'barrio',trim(p_cliente->>'barrio'),'ciudad',trim(p_cliente->>'ciudad')));
IF c.id IS NULL THEN INSERT INTO public.clientes_web(nombres,apellidos,cedula,telefono,correo,direccion,barrio,ciudad) VALUES(c_input.nombres,c_input.apellidos,c_input.cedula,c_input.telefono,c_input.correo,c_input.direccion,c_input.barrio,c_input.ciudad) RETURNING * INTO c;
ELSE UPDATE public.clientes_web SET nombres=c_input.nombres,apellidos=c_input.apellidos,cedula=c_input.cedula,telefono=c_input.telefono,direccion=c_input.direccion,barrio=c_input.barrio,ciudad=c_input.ciudad WHERE id=c.id RETURNING * INTO c; END IF;
o_input=jsonb_populate_record(NULL::public.pedidos_web,jsonb_build_object('cliente_id',c.id,'tipo_pedido',p_tipo,'fecha_entrega',p_fecha,'cliente_nombre',concat_ws(' ',c.nombres,c.apellidos),'telefono',c.telefono,'direccion',c.direccion,'barrio',c.barrio,'ciudad',c.ciudad,'total',total,'envio',p_envio,'anticipo',p_anticipo,'productos',items,'estado','AGENDADO'));
INSERT INTO public.pedidos_web(cliente_id,tipo_pedido,fecha_entrega,cliente_nombre,telefono,direccion,barrio,ciudad,total,envio,anticipo,productos,estado,asesor_uid,asesor_deposito,asesor_solicitud,asesor_creado_por) VALUES(o_input.cliente_id,o_input.tipo_pedido,o_input.fecha_entrega,o_input.cliente_nombre,o_input.telefono,o_input.direccion,o_input.barrio,o_input.ciudad,o_input.total,o_input.envio,o_input.anticipo,o_input.productos,o_input.estado,uid,dep_total,p_solicitud,auth.uid()) RETURNING * INTO o;
RETURN jsonb_build_object('id',o.id,'total',total,'deposito',dep_total); END; $$;
-- Bloquea la inserción directa y permite únicamente fotos de pedido de la cuenta en su propia carpeta.
DROP POLICY IF EXISTS cupissa_asesor_fotos_propias ON storage.objects;
CREATE POLICY cupissa_asesor_fotos_propias ON storage.objects FOR INSERT TO authenticated WITH CHECK (public.cupissa_asesor_identidad() IS NOT NULL AND bucket_id='pedidos-web' AND (storage.foldername(name))[1]='asesores' AND (storage.foldername(name))[2]=auth.uid()::text);
DROP POLICY IF EXISTS cupissa_asesor_storage_restringido ON storage.objects;
CREATE POLICY cupissa_asesor_storage_restringido ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.cupissa_es_cuenta_asesor() OR (bucket_id='pedidos-web' AND (storage.foldername(name))[1]='asesores' AND (storage.foldername(name))[2]=auth.uid()::text)) WITH CHECK (NOT public.cupissa_es_cuenta_asesor() OR (bucket_id='pedidos-web' AND (storage.foldername(name))[1]='asesores' AND (storage.foldername(name))[2]=auth.uid()::text));
DO $$ DECLARE f regprocedure; BEGIN FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('cupissa_asesor_identidad','cupissa_es_cuenta_asesor','cupissa_admin_asesores','cupissa_asesor_catalogo','cupissa_asesor_cliente','cupissa_asesor_fechas','cupissa_asesor_guardar','cupissa_asesor_incremento') LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f||' FROM PUBLIC, anon'; EXECUTE 'GRANT EXECUTE ON FUNCTION '||f||' TO authenticated'; END LOOP; END $$;
COMMIT;
