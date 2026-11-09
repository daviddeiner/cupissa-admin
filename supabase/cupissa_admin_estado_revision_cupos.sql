-- CUPISSA | Consulta de revisión de cupo para el panel administrador.
-- Requisito: ejecutar primero regla_creditos_15_minutos.sql.
-- No modifica los cupos ni dispara evaluaciones: únicamente consulta el historial.
CREATE OR REPLACE FUNCTION public.cupissa_admin_estado_revision_cupos(p_cliente_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revision record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_cupissa_admin() THEN
    RAISE EXCEPTION 'No autorizado para consultar revisiones de cupo.';
  END IF;

  SELECT r.id, r.credito_id, r.evento_tipo, r.fecha_evento, r.ejecutar_desde,
         r.procesado_en, r.variacion, r.cupo_anterior, r.cupo_nuevo, r.resultado, r.detalle
    INTO v_revision
    FROM public.cupissa_revision_cupos r
    WHERE r.cliente_id = p_cliente_id
    ORDER BY r.fecha_evento DESC, r.id DESC
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('existe', false);
  END IF;

  RETURN jsonb_build_object(
    'existe', true,
    'evento_tipo', v_revision.evento_tipo,
    'fecha_evento', v_revision.fecha_evento,
    'ejecutar_desde', v_revision.ejecutar_desde,
    'procesado_en', v_revision.procesado_en,
    'variacion', v_revision.variacion,
    'cupo_anterior', v_revision.cupo_anterior,
    'cupo_nuevo', v_revision.cupo_nuevo,
    'resultado', v_revision.resultado,
    'detalle', v_revision.detalle
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cupissa_admin_estado_revision_cupos(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cupissa_admin_estado_revision_cupos(text) TO authenticated;
