-- CUPISSA ADMIN: permite guardar notas internas por pedido web.
-- Ejecutar una sola vez en Supabase > SQL Editor.
ALTER TABLE public.pedidos_web
ADD COLUMN IF NOT EXISTS nota TEXT;
