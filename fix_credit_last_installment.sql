-- CUPISSA | Permitir cerrar correctamente la última cuota de un crédito.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- Cuando la deuda queda en cero, el proceso de pago puede dejar proximo_vencimiento en NULL
-- porque ya no existe una siguiente cuota programada.

ALTER TABLE public.creditos
  ALTER COLUMN proximo_vencimiento DROP NOT NULL;
