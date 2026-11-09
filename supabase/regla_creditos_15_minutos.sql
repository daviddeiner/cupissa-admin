-- CUPISSA | Política única de revisión del cupo, 15 minutos después del evento.
-- No sustituye aplicar_pago_credito, Wompi, ni la función administrativa existente.
-- Requiere pg_cron habilitado desde Supabase Dashboard > Database > Extensions.
-- Los triggers son privados; el cliente jamás puede aumentar cupos desde el navegador.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cupissa_revision_cupos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id text NOT NULL,
  credito_id text NOT NULL,
  evento_tipo text NOT NULL,
  cuotas_ids text[] NOT NULL,
  fecha_evento timestamptz NOT NULL DEFAULT now(),
  ejecutar_desde timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  procesado_en timestamptz,
  variacion numeric,
  cupo_anterior numeric,
  cupo_nuevo numeric,
  resultado text,
  detalle text,
  CONSTRAINT cupissa_revision_unica_credito UNIQUE (credito_id)
);

ALTER TABLE public.cupissa_revision_cupos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cupissa_revision_cupos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.cupissa_revision_cupos_id_seq FROM PUBLIC, anon, authenticated;

-- Solo se admite una revisión por crédito. Las ediciones de saldo no reinician el contador.
CREATE OR REPLACE FUNCTION public.cupissa_programar_revision_cupo(p_credito_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_credito RECORD;
  v_total int;
  v_pagadas int;
  v_pendientes int;
  v_ids text[];
BEGIN
  SELECT id::text AS id, cliente_id::text AS cliente_id, deuda_actual
    INTO v_credito FROM public.creditos WHERE id::text = p_credito_id;
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.cupissa_revision_cupos WHERE credito_id = p_credito_id
  ) THEN RETURN; END IF;

  -- Solo el ÚLTIMO crédito con deuda de este cliente puede activar la regla.
  IF EXISTS (
    SELECT 1 FROM public.creditos c
     WHERE c.cliente_id::text = v_credito.cliente_id
       AND c.id::text <> p_credito_id
       AND COALESCE(c.deuda_actual, 0) > 0.009
  ) THEN RETURN; END IF;

  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE COALESCE(monto_pagado,0) >= COALESCE(valor_cuota,0)
                          AND COALESCE(valor_cuota,0)>0 AND fecha_pago IS NOT NULL)::int,
         COUNT(*) FILTER (WHERE COALESCE(monto_pagado,0) < COALESCE(valor_cuota,0))::int
    INTO v_total, v_pagadas, v_pendientes
    FROM public.cuotas_credito WHERE credito_id::text = p_credito_id;

  -- Exigir todas las cuotas verificadas y la penúltima pagada, o deuda liquidada.
  -- Si el RPC de Wompi no registra fecha_pago, NO se inventan fechas ni premios.
  IF v_total < 2 OR v_pagadas < v_total - 1 OR v_pendientes > 1 THEN RETURN; END IF;
  IF v_pendientes = 1 AND COALESCE(v_credito.deuda_actual,0) <= 0.009 THEN RETURN; END IF;
  IF v_pendientes = 0 AND COALESCE(v_credito.deuda_actual,0) > 0.009 THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.cuotas_credito
     WHERE credito_id::text=p_credito_id
       AND COALESCE(monto_pagado,0)>=COALESCE(valor_cuota,0)
       AND (fecha_pago IS NULL OR fecha_vencimiento IS NULL)
  ) THEN RETURN; END IF;

  -- Congelar las cuotas pagadas exactamente al producirse el evento.
  -- La última cuota, pagada después, JAMÁS modifica el beneficio de la penúltima.
  SELECT array_agg(id::text ORDER BY numero_cuota,id::text)
    INTO v_ids FROM public.cuotas_credito
    WHERE credito_id::text=p_credito_id
      AND COALESCE(monto_pagado,0)>=COALESCE(valor_cuota,0)
      AND COALESCE(valor_cuota,0)>0 AND fecha_pago IS NOT NULL;
  INSERT INTO public.cupissa_revision_cupos (cliente_id,credito_id,evento_tipo,cuotas_ids)
  VALUES (v_credito.cliente_id,p_credito_id,
          CASE WHEN v_pendientes=0 THEN 'DEUDA_TOTAL' ELSE 'PENULTIMA' END, v_ids)
  ON CONFLICT (credito_id) DO NOTHING;
END;
$$;

-- Al terminar de registrar las cuotas o actualizar el saldo, vuelve a evaluar.
CREATE OR REPLACE FUNCTION public.cupissa_disparar_revision_cuota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' OR
     (TG_OP='UPDATE' AND (OLD.monto_pagado IS DISTINCT FROM NEW.monto_pagado
                   OR OLD.fecha_pago IS DISTINCT FROM NEW.fecha_pago)) THEN
    PERFORM public.cupissa_programar_revision_cupo(NEW.credito_id::text);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cupissa_revision_por_cuota ON public.cuotas_credito;
CREATE TRIGGER cupissa_revision_por_cuota AFTER INSERT OR UPDATE ON public.cuotas_credito
FOR EACH ROW EXECUTE FUNCTION public.cupissa_disparar_revision_cuota();

CREATE OR REPLACE FUNCTION public.cupissa_disparar_revision_credito()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.deuda_actual IS DISTINCT FROM NEW.deuda_actual THEN
    PERFORM public.cupissa_programar_revision_cupo(NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cupissa_revision_por_credito ON public.creditos;
CREATE TRIGGER cupissa_revision_por_credito AFTER UPDATE ON public.creditos
FOR EACH ROW EXECUTE FUNCTION public.cupissa_disparar_revision_credito();

-- El job se ejecuta cada minuto, pero procesa solo eventos con 15 minutos cumplidos.
-- Bloqueos de fila evitan duplicar revisiones incluso si cron se solapa.
CREATE OR REPLACE FUNCTION public.cupissa_procesar_revision_cupos()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_job RECORD;
  v_cliente RECORD;
  v_total int;
  v_pagadas int;
  v_pendientes int;
  v_anticipadas int;
  v_tardes_5 int;
  v_tardes_1 int;
  v_delta numeric;
  v_nuevo numeric;
  v_detalle text;
  v_count integer:=0;
BEGIN
  FOR v_job IN
    SELECT * FROM public.cupissa_revision_cupos
    WHERE procesado_en IS NULL AND ejecutar_desde <= now()
    ORDER BY ejecutar_desde,id FOR UPDATE SKIP LOCKED
  LOOP
    -- En caso de nuevo crédito activo durante los 15 minutos, no anticipar el premio.
    IF EXISTS (
      SELECT 1 FROM public.creditos c
      WHERE c.cliente_id::text=v_job.cliente_id
        AND c.id::text<>v_job.credito_id AND COALESCE(c.deuda_actual,0)>0.009
    ) THEN
      UPDATE public.cupissa_revision_cupos SET ejecutar_desde=now()+interval '15 minutes',
        detalle='Esperando liquidación de otras deudas activas'
      WHERE id=v_job.id;
      CONTINUE;
    END IF;

    SELECT COUNT(*)::int,
           COUNT(*) FILTER (WHERE COALESCE(monto_pagado,0)>=COALESCE(valor_cuota,0)
                            AND COALESCE(valor_cuota,0)>0 AND fecha_pago IS NOT NULL)::int,
           COUNT(*) FILTER (WHERE COALESCE(monto_pagado,0)<COALESCE(valor_cuota,0))::int,
           COUNT(*) FILTER (WHERE COALESCE(monto_pagado,0)>=COALESCE(valor_cuota,0)
                            AND fecha_pago < fecha_vencimiento)::int,
           COUNT(*) FILTER (WHERE COALESCE(monto_pagado,0)>=COALESCE(valor_cuota,0)
                            AND fecha_pago >= fecha_vencimiento+5)::int,
           COUNT(*) FILTER (WHERE COALESCE(monto_pagado,0)>=COALESCE(valor_cuota,0)
                            AND fecha_pago > fecha_vencimiento)::int
    INTO v_total,v_pagadas,v_pendientes,v_anticipadas,v_tardes_5,v_tardes_1
    FROM public.cuotas_credito WHERE credito_id::text=v_job.credito_id
      AND id::text=ANY(v_job.cuotas_ids);

    -- Recalcular sobre el estado ya confirmado al cumplirse los 15 min.
    IF v_total <> cardinality(v_job.cuotas_ids) OR v_pagadas <> v_total OR v_pendientes>0 OR
       EXISTS (SELECT 1 FROM public.cuotas_credito
               WHERE credito_id::text=v_job.credito_id AND id::text=ANY(v_job.cuotas_ids)
                 AND (fecha_pago IS NULL OR fecha_vencimiento IS NULL)) THEN
      UPDATE public.cupissa_revision_cupos SET ejecutar_desde=now()+interval '5 minutes',
        detalle='Esperando información coherente de las cuotas pagadas'
      WHERE id=v_job.id;
      CONTINUE;
    END IF;

    -- Determinar el premio sin penalizar por un atraso inferior a 5 días inventando reglas.
    IF v_tardes_5>=2 THEN v_delta:=-50000; v_detalle:='2 o más cuotas con retraso >=5 días';
    ELSIF v_tardes_5=1 THEN v_delta:=0; v_detalle:='1 cuota con retraso >=5 días';
    ELSIF v_tardes_1>0 THEN v_delta:=0; v_detalle:='Retraso inferior a 5 días: sin incremento';
    ELSIF v_anticipadas=v_pagadas THEN v_delta:=100000; v_detalle:='Todas las cuotas pagadas por anticipado';
    ELSE v_delta:=50000; v_detalle:='Cuotas pagadas puntualmente';
    END IF;

    SELECT id,cupo_total,cupo_disponible INTO v_cliente FROM public.clientes
    WHERE id::text=v_job.cliente_id FOR UPDATE;
    IF NOT FOUND THEN
      UPDATE public.cupissa_revision_cupos SET procesado_en=now(), resultado='ERROR',
        detalle='Cliente inexistente; no se modificó el cupo' WHERE id=v_job.id;
      CONTINUE;
    END IF;

    -- No permitir cupo total negativo. El cupo disponible se iguala al nuevo total.
    v_nuevo:=GREATEST(0,COALESCE(v_cliente.cupo_total,0)+v_delta);
    UPDATE public.clientes SET cupo_total=v_nuevo,cupo_disponible=v_nuevo
    WHERE id::text=v_job.cliente_id;
    UPDATE public.cupissa_revision_cupos SET procesado_en=now(),variacion=v_delta,
      cupo_anterior=v_cliente.cupo_total,cupo_nuevo=v_nuevo,resultado='APLICADO',detalle=v_detalle
    WHERE id=v_job.id;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Invocación exclusiva del scheduler/rol administrador, nunca desde la API pública.
REVOKE ALL ON FUNCTION public.cupissa_programar_revision_cupo(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cupissa_procesar_revision_cupos() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cupissa_disparar_revision_cuota() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cupissa_disparar_revision_credito() FROM PUBLIC,anon,authenticated;
COMMIT;

-- Ejecutar en SQL Editor DESPUÉS de habilitar pg_cron.
-- Repetible y seguro: no crea trabajos duplicados.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='cupissa-revisar-cupos-cada-minuto') THEN
    PERFORM cron.schedule('cupissa-revisar-cupos-cada-minuto','* * * * *',
      'SELECT public.cupissa_procesar_revision_cupos();');
  END IF;
END $$;

-- Consultar las revisiones pendientes/aplicadas:
-- SELECT * FROM public.cupissa_revision_cupos ORDER BY id DESC LIMIT 50;
-- Consultar trabajos cron:
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname='cupissa-revisar-cupos-cada-minuto';
