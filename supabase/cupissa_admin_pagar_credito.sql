-- CUPISSA | Corrección de pago de última cuota
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Permite que los créditos liquidados no tengan próximo vencimiento.
ALTER TABLE public.creditos
  ALTER COLUMN proximo_vencimiento DROP NOT NULL;

-- Función usada por el administrador para marcar una cuota o liquidar el crédito.
CREATE OR REPLACE FUNCTION public.cupissa_admin_pagar_credito(
    p_credito_id text,
    p_cuota_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_credito public.creditos%ROWTYPE;
    v_cuota public.cuotas_credito%ROWTYPE;

    v_fecha DATE;
    v_abono NUMERIC := 0;
    v_pendiente NUMERIC;
    v_saldo_anterior NUMERIC;
    v_saldo_nuevo NUMERIC;
    v_total_pendiente NUMERIC;
    v_proximo_vencimiento DATE;
    v_cantidad INTEGER := 0;
BEGIN
    -- Solo administradores autorizados.
    IF auth.uid() IS NULL
       OR NOT public.is_cupissa_admin()
    THEN
        RAISE EXCEPTION 'No tienes autorización para registrar pagos.';
    END IF;

    -- Fecha actual de Colombia.
    v_fecha := (NOW() AT TIME ZONE 'America/Bogota')::DATE;

    -- Bloquear el crédito durante la operación.
    SELECT *
    INTO v_credito
    FROM public.creditos
    WHERE id::TEXT = p_credito_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Crédito no encontrado.';
    END IF;

    v_saldo_anterior := COALESCE(v_credito.deuda_actual, 0);

    IF v_saldo_anterior <= 0
       OR UPPER(TRIM(COALESCE(v_credito.estado, ''))) = 'PAGADO'
    THEN
        RAISE EXCEPTION 'Esta deuda ya está completamente pagada.';
    END IF;

    -- Bloquear las cuotas de este crédito.
    PERFORM 1
    FROM public.cuotas_credito
    WHERE credito_id::TEXT = p_credito_id
    FOR UPDATE;

    SELECT
        COUNT(*),
        COALESCE(
            SUM(
                GREATEST(
                    0,
                    COALESCE(valor_cuota, 0) - COALESCE(monto_pagado, 0)
                )
            ),
            0
        )
    INTO v_cantidad, v_total_pendiente
    FROM public.cuotas_credito
    WHERE credito_id::TEXT = p_credito_id;

    IF v_cantidad = 0 THEN
        RAISE EXCEPTION 'Este crédito no tiene cuotas registradas. No se modificó la deuda.';
    END IF;

    -- Comprobar que las cuotas y el saldo coinciden.
    IF ABS(v_total_pendiente - v_saldo_anterior) > 0.009 THEN
        RAISE EXCEPTION
            'El saldo del crédito (%) no coincide con sus cuotas pendientes (%). No se aplicaron cambios.',
            v_saldo_anterior,
            v_total_pendiente;
    END IF;

    -- OPCIÓN A: marcar una sola cuota como pagada.
    IF p_cuota_id IS NOT NULL THEN
        SELECT *
        INTO v_cuota
        FROM public.cuotas_credito
        WHERE id::TEXT = p_cuota_id
          AND credito_id::TEXT = p_credito_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'La cuota no pertenece al crédito indicado.';
        END IF;

        v_pendiente := GREATEST(
            0,
            COALESCE(v_cuota.valor_cuota, 0) - COALESCE(v_cuota.monto_pagado, 0)
        );

        IF v_pendiente <= 0 THEN
            RAISE EXCEPTION 'Esta cuota ya está pagada.';
        END IF;

        v_abono := v_pendiente;

        UPDATE public.cuotas_credito
        SET
            monto_pagado = valor_cuota,
            estado = 'PAGADO',
            fecha_pago = v_fecha
        WHERE id::TEXT = p_cuota_id
          AND credito_id::TEXT = p_credito_id;

    -- OPCIÓN B: marcar toda la deuda como pagada.
    ELSE
        v_abono := v_total_pendiente;

        UPDATE public.cuotas_credito
        SET
            monto_pagado = valor_cuota,
            estado = 'PAGADO',
            fecha_pago = COALESCE(fecha_pago, v_fecha)
        WHERE credito_id::TEXT = p_credito_id
          AND (
              COALESCE(monto_pagado, 0) < COALESCE(valor_cuota, 0)
              OR UPPER(TRIM(COALESCE(estado, ''))) <> 'PAGADO'
          );
    END IF;

    -- Actualizar saldo general.
    v_saldo_nuevo := GREATEST(0, v_saldo_anterior - v_abono);

    -- Buscar la siguiente cuota pendiente. Cuando no quede ninguna,
    -- v_proximo_vencimiento será NULL y eso es válido para un crédito PAGADO.
    SELECT MIN(fecha_vencimiento)
    INTO v_proximo_vencimiento
    FROM public.cuotas_credito
    WHERE credito_id::TEXT = p_credito_id
      AND COALESCE(monto_pagado, 0) < COALESCE(valor_cuota, 0);

    UPDATE public.creditos
    SET
        deuda_actual = v_saldo_nuevo,
        estado = CASE
            WHEN v_saldo_nuevo <= 0.009 THEN 'PAGADO'
            ELSE 'ACTIVO'
        END,
        proximo_vencimiento = CASE
            WHEN v_saldo_nuevo <= 0.009 THEN NULL
            ELSE v_proximo_vencimiento
        END
    WHERE id::TEXT = p_credito_id;

    -- Restaurar en el disponible el valor efectivamente abonado.
    -- La regla especial de evaluación del cupo total requiere la función
    -- aplicar_pago_credito que utiliza el Portal de Pagos.
    UPDATE public.clientes
    SET cupo_disponible = COALESCE(cupo_disponible, 0) + v_abono
    WHERE id::TEXT = v_credito.cliente_id::TEXT;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró el cliente asociado al crédito.';
    END IF;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'credito_id', p_credito_id,
        'cuota_id', p_cuota_id,
        'abonado', v_abono,
        'saldo_restante', v_saldo_nuevo,
        'estado', CASE
            WHEN v_saldo_nuevo <= 0.009 THEN 'PAGADO'
            ELSE 'ACTIVO'
        END,
        'fecha_pago', v_fecha
    );
END;
$function$;
