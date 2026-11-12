-- CUPISSA ADMIN | Permisos exclusivos para administrador y borrado seguro de pedidos
-- SQL Editor -> New query -> Run (revisar primero el correo autorizado)
-- No deshabilita RLS ni proporciona permisos de administrador a clientes.
BEGIN;

CREATE OR REPLACE FUNCTION public.cupissa_es_admin_seguro()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = (SELECT auth.uid())
      AND lower(trim(u.email)) = 'contacto@cupissa.com'
      AND u.email_confirmed_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.cupissa_es_admin_seguro() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cupissa_es_admin_seguro() TO authenticated;

-- Solo sobre las tablas del administrador que ya existen en public.
-- Se conservan todas las políticas previas; no se eliminan ni se reemplazan.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'productos','clientes','clientes_web','creditos','cuotas_credito',
    'pagos_credito','pedidos_web','pedidos_web_productos',
    'configuracion_destacados_web','configuracion_pedidos_web',
    'cupissa_stock_alquiler','cupissa_revision_cupos'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I',t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t
        AND policyname='cupissa_admin_operaciones_seguras'
    ) THEN
      EXECUTE format(
        'CREATE POLICY cupissa_admin_operaciones_seguras ON public.%I FOR ALL TO authenticated USING ((SELECT public.cupissa_es_admin_seguro())) WITH CHECK ((SELECT public.cupissa_es_admin_seguro()))',t);
    END IF;
  END LOOP;
END $$;

-- Evita fallos por claves foráneas de líneas de pedido: se eliminan primero.
-- La operación es transaccional: ante error no borra parcialmente un pedido.
CREATE OR REPLACE FUNCTION public.cupissa_admin_eliminar_pedido_web(p_pedido_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id text;
  v_child_column text;
BEGIN
  IF NOT (SELECT public.cupissa_es_admin_seguro()) THEN
    RAISE EXCEPTION 'No tienes autorización para eliminar pedidos.' USING ERRCODE='42501';
  END IF;
  IF p_pedido_id IS NULL OR length(trim(p_pedido_id)) = 0 THEN
    RAISE EXCEPTION 'Identificador de pedido inválido.';
  END IF;
  SELECT id::text INTO v_order_id
  FROM public.pedidos_web
  WHERE id::text = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe o ya fue eliminado.';
  END IF;

  -- Solo elimina las líneas directamente vinculadas, cuando existe esa relación.
  IF to_regclass('public.pedidos_web_productos') IS NOT NULL THEN
    SELECT a.attname INTO v_child_column
      FROM pg_constraint fk
      JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=ANY(fk.conkey)
      WHERE fk.contype='f'
        AND fk.conrelid='public.pedidos_web_productos'::regclass
        AND fk.confrelid='public.pedidos_web'::regclass
        AND array_length(fk.conkey,1)=1
      LIMIT 1;
    IF v_child_column IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.pedidos_web_productos WHERE %I::text=$1',v_child_column)
      USING v_order_id;
    END IF;
  END IF;

  DELETE FROM public.pedidos_web WHERE id::text=v_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo confirmar la eliminación.';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.cupissa_admin_eliminar_pedido_web(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cupissa_admin_eliminar_pedido_web(text) TO authenticated;

COMMIT;

-- Comprobar sin alterar datos:
SELECT to_regprocedure('public.cupissa_admin_eliminar_pedido_web(text)') AS funcion_borrado,
       to_regprocedure('public.cupissa_es_admin_seguro()') AS comprobacion_admin;
