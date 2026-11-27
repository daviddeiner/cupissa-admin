BEGIN;
ALTER TABLE public.asesores ADD COLUMN IF NOT EXISTS rol_asesor text NOT NULL DEFAULT 'asesor' CHECK (rol_asesor IN ('asesor','admin'));
CREATE OR REPLACE FUNCTION public.cupissa_asesor_identidad() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT CASE WHEN public.cupissa_es_admin_seguro() THEN jsonb_build_object('admin',true,'asesor',false,'nombre','Administrador CUPISSA') ELSE (SELECT jsonb_build_object('admin',a.rol_asesor='admin','asesor',true,'nombre',a.nombre_asesor) FROM public.asesores a WHERE a.asesor_uid=auth.uid() AND a.activo_asesor) END;
$$;
CREATE OR REPLACE FUNCTION public.cupissa_admin_asesores() RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN IF NOT public.cupissa_es_admin_seguro() THEN RAISE EXCEPTION 'No autorizado'; END IF;
RETURN QUERY SELECT jsonb_build_object('asesor_uid',a.asesor_uid,'nombre_asesor',a.nombre_asesor,'activo',a.activo_asesor,'rol',a.rol_asesor) FROM public.asesores a WHERE a.asesor_uid IS NOT NULL ORDER BY a.nombre_asesor; END; $$;
CREATE OR REPLACE FUNCTION public.cupissa_admin_asesor_rol(p_uid uuid,p_rol text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN IF NOT public.cupissa_es_admin_seguro() THEN RAISE EXCEPTION 'No autorizado'; END IF;
IF p_rol IS NULL OR p_rol NOT IN ('asesor','admin') THEN RAISE EXCEPTION 'Rol inválido'; END IF;
UPDATE public.asesores SET rol_asesor=p_rol WHERE asesor_uid=p_uid; IF NOT FOUND THEN RAISE EXCEPTION 'Asesor no encontrado'; END IF; END; $$;
CREATE OR REPLACE FUNCTION public.cupissa_asesor_mis_pedidos(p_mes date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ini date; resultado jsonb;
BEGIN IF public.cupissa_asesor_identidad() IS NULL OR NOT EXISTS (SELECT 1 FROM public.asesores WHERE asesor_uid=auth.uid() AND activo_asesor) THEN RAISE EXCEPTION 'No autorizado'; END IF;
IF p_mes IS NULL THEN RAISE EXCEPTION 'Mes inválido'; END IF;
ini=date_trunc('month',p_mes)::date;
WITH pedidos AS (SELECT o.id,o.fecha_entrega,o.cliente_nombre,o.estado,o.total,o.tipo_pedido,coalesce(to_jsonb(o)->>'numero_pedido',to_jsonb(o)->>'codigo',o.id::text) AS codigo,
CASE WHEN upper(trim(coalesce(o.estado::text,'')))='CANCELADO' THEN 0 ELSE greatest(0,coalesce(o.total,0)-CASE WHEN o.tipo_pedido::text='ALQUILER' THEN coalesce(o.asesor_deposito,0) ELSE 0 END) END AS base
FROM public.pedidos_web o WHERE o.asesor_uid=auth.uid() AND o.fecha_entrega::date>=ini AND o.fecha_entrega::date<(ini+interval '1 month')::date)
SELECT jsonb_build_object('pedidos',coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.fecha_entrega DESC,p.id),'[]'::jsonb),'base',coalesce(sum(p.base),0),'comision',coalesce(sum(p.base),0)*0.20) INTO resultado FROM pedidos p;
RETURN resultado; END; $$;
REVOKE ALL ON FUNCTION public.cupissa_asesor_mis_pedidos(date),public.cupissa_admin_asesor_rol(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cupissa_asesor_mis_pedidos(date),public.cupissa_admin_asesor_rol(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.cupissa_asesor_guardar(p_cliente jsonb,p_fecha date,p_tipo text,p_productos jsonb,p_envio numeric,p_anticipo numeric,p_solicitud uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ident jsonb; uid uuid; admin boolean; lim integer; n integer; c public.clientes_web%ROWTYPE; c_input public.clientes_web%ROWTYPE; o public.pedidos_web%ROWTYPE; o_input public.pedidos_web%ROWTYPE; p public.productos%ROWTYPE; item jsonb; acc jsonb; items jsonb:='[]'; k text; email text; qty integer; base numeric; dep numeric; dep_total numeric:=0; manual numeric; inc numeric; acc_total numeric; unit numeric; total numeric:=0; name text; BEGIN
ident=public.cupissa_asesor_identidad(); IF ident IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF; admin=(ident->>'admin')::boolean; uid=CASE WHEN (ident->>'asesor')::boolean THEN auth.uid() ELSE NULL END;
IF p_solicitud IS NULL THEN RAISE EXCEPTION 'Solicitud inválida'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('cupissa-asesor-solicitud:'||p_solicitud::text,0));
SELECT * INTO o FROM public.pedidos_web WHERE asesor_solicitud=p_solicitud;
IF FOUND THEN IF o.asesor_creado_por IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Solicitud inválida'; END IF; RETURN jsonb_build_object('id',o.id,'total',o.total,'deposito',o.asesor_deposito); END IF;
IF p_tipo IS NULL OR p_tipo NOT IN ('VENTA','ALQUILER') OR p_fecha IS NULL THEN RAISE EXCEPTION 'Modalidad o fecha inválida'; END IF;
IF NOT admin THEN
 IF p_fecha<(now() AT TIME ZONE 'America/Bogota')::date+2 THEN RAISE EXCEPTION 'Debes agendar con dos días de anticipación'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('cupissa-asesores-fecha:'||p_fecha::text,0));
 SELECT max_pedidos_diarios INTO lim FROM public.configuracion_pedidos_web WHERE id=1; IF lim IS NULL OR lim<1 THEN RAISE EXCEPTION 'Límite diario no configurado'; END IF;
 SELECT count(*) INTO n FROM public.pedidos_web WHERE fecha_entrega::date=p_fecha AND upper(coalesce(estado::text,''))<>'CANCELADO'; IF n>=lim THEN RAISE EXCEPTION 'Fecha ocupada: selecciona otra'; END IF;
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

COMMIT;
