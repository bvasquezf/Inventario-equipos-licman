-- =====================================================
-- Migración 002: insert_equipo (asignar el MENOR correlativo libre)
-- =====================================================
-- v1: el cliente pedía un correlativo al abrir el form con nextval()
--     → quemaba el número. Si el usuario salía sin guardar, quedaba
--     un hueco.
--
-- v2: asignación DENTRO del insert con nextval() sobre la sequence.
--     Cero huecos al guardar, pero no rellena los huecos de inserts
--     anteriores (siempre va a max+1).
--
-- v3 (actual): buscar el MENOR número correlativo que NO esté en uso.
--   - Llena automáticamente los huecos existentes (1,2,13,14 → 3,4,5…)
--   - Atómico con concurrentes vía pg_advisory_xact_lock
--   - Consistente incluso si se borra un registro
-- =====================================================

-- ---------------------------------------------------------
-- 1) insert_equipo: asigna el menor libre + inserta, atómico.
-- ---------------------------------------------------------
create or replace function public.insert_equipo(equipo_data jsonb)
returns public.equipos
language plpgsql
security definer
as $$
declare
  next_val bigint;
  inserted_row public.equipos;
begin
  -- Lock por-transacción: serializa llamadas concurrentes a esta
  -- función. NO bloquea SELECTs ni inserts hechos por código que
  -- no use la función (pero como toda la app pasa por acá, está OK).
  perform pg_advisory_xact_lock(hashtext('insert_equipo'));

  -- Buscar el MENOR número correlativo que NO exista en la tabla.
  --   Tabla vacía        → max()=NULL → 0+1=1 → genera [1]     → toma 1
  --   Existen 1,2,13,14  → max()=14   → 14+1=15 → genera [1..15] → toma 3 (primer libre)
  --   Existen 1..14      → max()=14   → 14+1=15 → genera [1..15] → toma 15 (siguiente)
  --   Existen 1,2,3,14   → max()=14   → genera [1..15] → toma 4
  select n
    into next_val
    from generate_series(1, (select coalesce(max(correlativo), 0) + 1 from public.equipos)) as n
    where not exists (select 1 from public.equipos where correlativo = n)
    order by n asc
    limit 1;

  if next_val is null then
    next_val := 1;
  end if;

  insert into public.equipos (
    correlativo,
    bodega,
    tipo_equipo,
    numero_interno,
    numero_serie,
    marca,
    modelo,
    ubicacion_actual,
    estado_operacional,
    horometro,
    elementos_faltantes,
    observaciones,
    responsable,
    foto_enviada
  )
  values (
    next_val,
    equipo_data->>'bodega',
    equipo_data->>'tipo_equipo',
    equipo_data->>'numero_interno',
    equipo_data->>'numero_serie',
    equipo_data->>'marca',
    equipo_data->>'modelo',
    equipo_data->>'ubicacion_actual',
    equipo_data->>'estado_operacional',
    case
      when equipo_data->>'horometro' is null or equipo_data->>'horometro' = '' then null
      else (equipo_data->>'horometro')::numeric
    end,
    -- elementos_faltantes es jsonb en esta DB. `->` (sin `>`) lo
    -- extrae como jsonb. Fallback a array vacío si llega null.
    coalesce(equipo_data->'elementos_faltantes', '[]'::jsonb),
    equipo_data->>'observaciones',
    equipo_data->>'responsable',
    coalesce((equipo_data->>'foto_enviada')::boolean, false)
  )
  returning * into inserted_row;

  return inserted_row;
end;
$$;

grant execute on function public.insert_equipo(jsonb) to anon;

-- ---------------------------------------------------------
-- 2) preview_next_correlativo: muestra el menor libre SIN insertar.
--    Usado por el cliente para el ticket del formulario.
--    No toma lock (es solo una pista visual; la atomicidad real
--    está en insert_equipo).
-- ---------------------------------------------------------
create or replace function public.preview_next_correlativo()
returns bigint
language plpgsql
security definer
stable
as $$
declare
  next_val bigint;
begin
  select n
    into next_val
    from generate_series(1, (select coalesce(max(correlativo), 0) + 1 from public.equipos)) as n
    where not exists (select 1 from public.equipos where correlativo = n)
    order by n asc
    limit 1;

  return coalesce(next_val, 1);
end;
$$;

grant execute on function public.preview_next_correlativo() to anon;

-- ---------------------------------------------------------
-- (Opcional) La función vieja y la sequence ya no se usan.
-- Si querés limpiarlas en una migración futura:
--   drop function if exists public.next_equipo_correlativo();
--   drop sequence if exists public.equipos_correlativo_seq;
-- ---------------------------------------------------------

-- =====================================================
-- Verificar (con tu estado actual: 1, 2, 13, 14):
--   select correlativo from public.equipos order by correlativo;
--   select preview_next_correlativo();           -- debería devolver 3
--
-- Insertar uno nuevo:
--   select insert_equipo('{
--     "bodega": "Renca",
--     "numero_interno": "TEST-1",
--     "numero_serie": "SN-001",
--     "marca": "Caterpillar",
--     "modelo": "320D",
--     "estado_operacional": "Operativo",
--     "responsable": "Test"
--   }'::jsonb);
--   -- debería devolver la fila con correlativo = 3
-- =====================================================
