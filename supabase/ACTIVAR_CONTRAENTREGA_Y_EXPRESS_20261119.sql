-- Ejecutar UNA VEZ en Supabase > SQL Editor antes de publicar los tres sitios.
-- Mantiene inactivos los dos beneficios para todos los productos existentes.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS pago_contraentrega boolean NOT NULL DEFAULT false;

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS produccion_express boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.productos.pago_contraentrega IS
  'Permite pagar al recibir cuando el pedido incluye menos de 6 unidades y no alcanza el mínimo mayorista.';
COMMENT ON COLUMN public.productos.produccion_express IS
  'Permite solicitar producción express con recargo de 10000 COP y dos días hábiles menos.';
