-- CUPISSA: DIAGNÓSTICO SIN MODIFICAR DATOS. Opcional.
-- Ejecutar en Supabase SQL Editor cuando la función indique
-- COURIERS_TABLE_ERROR o AUTH_DATABASE_TRIGGER_ERROR.
SELECT to_regclass('public.cupissa_domiciliarios') AS tabla_domiciliarios,
       to_regclass('public.cupissa_domicilios') AS tabla_entregas;

-- Triggers de Authentication: NO los elimina ni los modifica.
SELECT t.tgname AS nombre_trigger,
       n.nspname AS esquema,
       c.relname AS tabla,
       p.proname AS funcion_trigger,
       pg_get_triggerdef(t.oid) AS definicion
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid
WHERE n.nspname='auth' AND c.relname='users' AND NOT t.tgisinternal
ORDER BY t.tgname;
