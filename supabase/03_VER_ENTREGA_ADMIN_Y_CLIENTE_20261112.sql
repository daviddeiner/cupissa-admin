-- CUPISSA | Mostrar comprobantes de entrega en ADMIN y PERFIL.
-- EJECUTAR EN SUPABASE SQL EDITOR tras publicar los ZIP.
-- NO altera pedidos ni archivos de Storage; no desactiva RLS.
BEGIN;
CREATE OR REPLACE FUNCTION public.cupissa_domicilios_cliente_autorizado(p_pedido_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
  v_correo text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT lower(btrim(u.email)) INTO v_correo
  FROM auth.users u WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL;
  IF nullif(v_correo,'') IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.pedidos_web p
    WHERE p.id::text=p_pedido_id
      AND upper(btrim(coalesce(p.estado,'')))='ENTREGADO'
      AND EXISTS (
        SELECT 1 FROM public.clientes_web c
        WHERE lower(btrim(c.correo))=v_correo
          AND (
            -- Asociación explícita con la ficha del cliente.
            (to_jsonb(p)->>'cliente_web_id')=c.id::text
            OR (to_jsonb(p)->>'cliente_id')=c.id::text
            OR (
              nullif(to_jsonb(c)->>'cliente_id','') IS NOT NULL
              AND (to_jsonb(p)->>'cliente_id')=(to_jsonb(c)->>'cliente_id')
            )
            -- Pedidos antiguos pueden tener el email directamente.
            OR lower(btrim(coalesce(
                to_jsonb(p)->>'correo', to_jsonb(p)->>'email',
                to_jsonb(p)->>'cliente_correo',to_jsonb(p)->>'cliente_email',''
              )))=v_correo
            -- Para teléfonos antiguos, exigir un propietario inequívoco
            -- entre perfiles clientes_web y correo verificado de Auth.
            OR (
               nullif(regexp_replace(coalesce(to_jsonb(c)->>'telefono',''),'[^0-9]','','g'),'') IS NOT NULL
               AND right(regexp_replace(coalesce(to_jsonb(p)->>'telefono',to_jsonb(p)->>'contacto',''),'[^0-9]','','g'),10)
                   =right(regexp_replace(coalesce(to_jsonb(c)->>'telefono',''),'[^0-9]','','g'),10)
               AND length(right(regexp_replace(coalesce(to_jsonb(c)->>'telefono',''),'[^0-9]','','g'),10))=10
               AND NOT EXISTS (
                 SELECT 1 FROM public.clientes_web another
                 WHERE another.id <> c.id
                   AND right(regexp_replace(coalesce(to_jsonb(another)->>'telefono',''),'[^0-9]','','g'),10)
                       =right(regexp_replace(coalesce(to_jsonb(c)->>'telefono',''),'[^0-9]','','g'),10)
               )
            )
          )
      )
  );
END; $$;
REVOKE ALL ON FUNCTION public.cupissa_domicilios_cliente_autorizado(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cupissa_domicilios_cliente_autorizado(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cupissa_domicilios_entregas_cliente()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('pedido_id', d.pedido_id, 'entregado_en',d.entregado_en)),'[]'::jsonb)
 FROM public.cupissa_domicilios d
 WHERE d.entregado_en IS NOT NULL AND d.foto_path IS NOT NULL AND d.firma_path IS NOT NULL
   AND public.cupissa_domicilios_cliente_autorizado(d.pedido_id);
$$;
REVOKE ALL ON FUNCTION public.cupissa_domicilios_entregas_cliente() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cupissa_domicilios_entregas_cliente() TO authenticated;

CREATE OR REPLACE FUNCTION public.cupissa_domicilios_entregas_admin()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN EXISTS (
   SELECT 1 FROM auth.users u
   WHERE u.id=auth.uid() AND lower(btrim(u.email))='contacto@cupissa.com'
     AND u.email_confirmed_at IS NOT NULL
 ) THEN (
   SELECT coalesce(jsonb_agg(jsonb_build_object('pedido_id',d.pedido_id,'entregado_en',d.entregado_en)),'[]'::jsonb)
   FROM public.cupissa_domicilios d
   WHERE d.entregado_en IS NOT NULL AND d.foto_path IS NOT NULL AND d.firma_path IS NOT NULL
 ) ELSE '[]'::jsonb END;
$$;
REVOKE ALL ON FUNCTION public.cupissa_domicilios_entregas_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cupissa_domicilios_entregas_admin() TO authenticated;
COMMIT;
