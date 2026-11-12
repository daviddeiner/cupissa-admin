-- CUPISSA | INSTALACIÓN DOMICILIOS (ejecutar una sola vez en SQL Editor)
-- No elimina ni reemplaza las tablas existentes.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cupissa_domiciliarios (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombres text NOT NULL,
  apellidos text NOT NULL,
  telefono text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cupissa_domicilios (
  pedido_id text PRIMARY KEY,
  domiciliario_id uuid NOT NULL REFERENCES public.cupissa_domiciliarios(id),
  asignado_en timestamptz NOT NULL DEFAULT now(),
  foto_path text,
  firma_path text,
  entregado_en timestamptz,
  CONSTRAINT entrega_ambas_pruebas CHECK (
    (foto_path IS NULL AND firma_path IS NULL AND entregado_en IS NULL)
    OR (foto_path IS NOT NULL AND firma_path IS NOT NULL AND entregado_en IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS cupissa_domicilios_repartidor_idx ON public.cupissa_domicilios(domiciliario_id, asignado_en DESC);
CREATE INDEX IF NOT EXISTS cupissa_pedidos_estado_fecha_idx ON public.pedidos_web(estado, fecha_entrega);

-- El bucket es PRIVADO: las firmas jamás se publican mediante URLs permanentes.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cupissa-entregas', 'cupissa-entregas', false, 5242880, ARRAY['image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png'];

CREATE OR REPLACE FUNCTION public.cupissa_domicilios_es_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = (SELECT auth.uid())
      AND lower(trim(u.email)) = 'contacto@cupissa.com'
      AND u.email_confirmed_at IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION public.cupissa_domicilios_es_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cupissa_domicilios_es_admin() TO authenticated;

ALTER TABLE public.cupissa_domiciliarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupissa_domicilios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cupissa_domiciliarios, public.cupissa_domicilios FROM anon;
GRANT SELECT ON public.cupissa_domiciliarios, public.cupissa_domicilios TO authenticated;

DROP POLICY IF EXISTS cupissa_domiciliarios_admin_leer ON public.cupissa_domiciliarios;
CREATE POLICY cupissa_domiciliarios_admin_leer ON public.cupissa_domiciliarios
FOR SELECT TO authenticated USING ((SELECT public.cupissa_domicilios_es_admin()) OR id = auth.uid());
DROP POLICY IF EXISTS cupissa_domicilios_admin_leer ON public.cupissa_domicilios;
CREATE POLICY cupissa_domicilios_admin_leer ON public.cupissa_domicilios
FOR SELECT TO authenticated USING ((SELECT public.cupissa_domicilios_es_admin()) OR domiciliario_id = auth.uid());

-- Solo el administrador autenticado asigna; estado y asignación se actualizan juntos.
CREATE OR REPLACE FUNCTION public.cupissa_domicilios_asignar_admin(
  p_pedido_id text, p_domiciliario_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_estado text;
BEGIN
  IF NOT public.cupissa_domicilios_es_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cupissa_domiciliarios WHERE id = p_domiciliario_id AND activo) THEN
    RAISE EXCEPTION 'El domiciliario no existe o está inactivo';
  END IF;
  SELECT estado INTO v_estado FROM public.pedidos_web WHERE id::text=p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF upper(trim(v_estado)) <> 'EN DEPARTAMENTO DE DESPACHO' THEN
    RAISE EXCEPTION 'Solo se asignan pedidos en departamento de despacho (estado actual: %)',v_estado;
  END IF;
  IF EXISTS (SELECT 1 FROM public.cupissa_domicilios WHERE pedido_id=p_pedido_id AND entregado_en IS NOT NULL) THEN
    RAISE EXCEPTION 'Este pedido ya tiene una entrega confirmada';
  END IF;
  INSERT INTO public.cupissa_domicilios(pedido_id, domiciliario_id)
    VALUES(p_pedido_id,p_domiciliario_id)
    ON CONFLICT (pedido_id) DO UPDATE SET
      domiciliario_id=excluded.domiciliario_id, asignado_en=now();
  UPDATE public.pedidos_web SET estado='EN CAMINO' WHERE id::text=p_pedido_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.cupissa_domicilios_asignar_admin(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cupissa_domicilios_asignar_admin(text,uuid) TO authenticated;

-- El repartidor asignado confirma; el cambio de estado es ATÓMICO y exige ambas evidencias.
CREATE OR REPLACE FUNCTION public.cupissa_domicilios_confirmar_entrega(
 p_pedido_id text, p_foto_path text, p_firma_path text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_d public.cupissa_domicilios%ROWTYPE; v_prefix text; v_estado text;
BEGIN
  SELECT * INTO v_d FROM public.cupissa_domicilios WHERE pedido_id=p_pedido_id FOR UPDATE;
  IF NOT FOUND OR v_d.domiciliario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No tienes asignado este pedido' USING ERRCODE='42501';
  END IF;
  IF v_d.entregado_en IS NOT NULL THEN RAISE EXCEPTION 'Esta entrega ya fue confirmada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cupissa_domiciliarios WHERE id=auth.uid() AND activo) THEN
    RAISE EXCEPTION 'Cuenta de repartidor inactiva' USING ERRCODE='42501';
  END IF;
  v_prefix := auth.uid()::text || '/' || regexp_replace(p_pedido_id,'[^a-zA-Z0-9_-]','','g') || '/';
  IF p_foto_path IS NULL OR p_firma_path IS NULL
     OR left(p_foto_path,length(v_prefix))<>v_prefix OR left(p_firma_path,length(v_prefix))<>v_prefix
     OR p_foto_path = p_firma_path THEN
     RAISE EXCEPTION 'Las evidencias no pertenecen a esta entrega';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='cupissa-entregas' AND name=p_foto_path)
     OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='cupissa-entregas' AND name=p_firma_path) THEN
    RAISE EXCEPTION 'Falta fotografía o firma en Storage';
  END IF;
  SELECT estado INTO v_estado FROM public.pedidos_web WHERE id::text=p_pedido_id FOR UPDATE;
  IF upper(trim(coalesce(v_estado,''))) <> 'EN CAMINO' THEN
    RAISE EXCEPTION 'El pedido ya no está EN CAMINO';
  END IF;
  UPDATE public.cupissa_domicilios SET foto_path=p_foto_path, firma_path=p_firma_path,
    entregado_en=now() WHERE pedido_id=p_pedido_id;
  UPDATE public.pedidos_web SET estado='ENTREGADO' WHERE id::text=p_pedido_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.cupissa_domicilios_confirmar_entrega(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cupissa_domicilios_confirmar_entrega(text,text,text) TO authenticated;

-- Permiso de consulta por email VERIFICADO y vínculo con la ficha del cliente.
-- JSONB evita asumir que todos los esquemas antiguos tienen columna cliente_web_id/cliente_id.
CREATE OR REPLACE FUNCTION public.cupissa_domicilios_cliente_autorizado(p_pedido_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_correo text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT lower(trim(email)) INTO v_correo FROM auth.users
    WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
  IF v_correo IS NULL OR v_correo = '' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.pedidos_web p
    JOIN public.clientes_web c ON lower(trim(c.correo))=v_correo
    WHERE p.id::text=p_pedido_id AND upper(trim(p.estado))='ENTREGADO'
      AND ( (to_jsonb(p)->>'cliente_web_id') = c.id::text
         OR (to_jsonb(p)->>'cliente_id') = c.id::text
         OR ((to_jsonb(c)->>'cliente_id') IS NOT NULL
             AND (to_jsonb(p)->>'cliente_id')=(to_jsonb(c)->>'cliente_id')) )
  );
END; $$;
REVOKE ALL ON FUNCTION public.cupissa_domicilios_cliente_autorizado(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cupissa_domicilios_cliente_autorizado(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cupissa_domicilios_entregas_cliente()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('pedido_id', d.pedido_id,'entregado_en', d.entregado_en)), '[]'::jsonb)
 FROM public.cupissa_domicilios d
 WHERE d.entregado_en IS NOT NULL AND d.foto_path IS NOT NULL AND d.firma_path IS NOT NULL
   AND public.cupissa_domicilios_cliente_autorizado(d.pedido_id);
$$;
REVOKE ALL ON FUNCTION public.cupissa_domicilios_entregas_cliente() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cupissa_domicilios_entregas_cliente() TO authenticated;
COMMIT;

-- VERIFICACIÓN (después del COMMIT)
SELECT 'cupissa_domiciliarios' AS objeto,to_regclass('public.cupissa_domiciliarios')::text AS instalado
UNION ALL SELECT 'cupissa_domicilios',to_regclass('public.cupissa_domicilios')::text;
