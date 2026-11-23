-- CUPISSA: RECOGIDAS DE ALQUILER. Ejecutar en Supabase SQL Editor.
-- Estado interno exclusivamente. NUNCA cambia pedidos_web.estado.
BEGIN;
CREATE TABLE IF NOT EXISTS public.cupissa_recogidas_alquiler (
  pedido_id text PRIMARY KEY,
  domiciliario_id uuid REFERENCES public.cupissa_domiciliarios(id),
  asignado_en timestamptz,
  recogido_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recogida_fechas_validas CHECK (recogido_en IS NULL OR domiciliario_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS cupissa_recogidas_repartidor_idx ON public.cupissa_recogidas_alquiler (domiciliario_id, recogido_en);
ALTER TABLE public.cupissa_recogidas_alquiler ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cupissa_recogidas_alquiler FROM anon;
GRANT SELECT ON public.cupissa_recogidas_alquiler TO authenticated;
DROP POLICY IF EXISTS cupissa_recogidas_consulta_interna ON public.cupissa_recogidas_alquiler;
CREATE POLICY cupissa_recogidas_consulta_interna ON public.cupissa_recogidas_alquiler
FOR SELECT TO authenticated USING (public.cupissa_domicilios_es_admin() OR domiciliario_id = auth.uid());
-- Toda escritura se hace mediante la Edge Function autenticada (service role).
COMMIT;
