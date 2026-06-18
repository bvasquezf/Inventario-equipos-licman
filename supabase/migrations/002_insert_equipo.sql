-- =====================================================
-- Migración 002: insert_equipo (asignar correlativo al guardar)
-- =====================================================
-- Antes: el cliente pedía un correlativo al abrir el form con
--   next_equipo_correlativo() → nextval() → quemaba el número.
--   Si el usuario salía sin guardar, quedaba un hueco en la numeración.
--
-- Ahora: la asignación ocurre DENTRO del insert, en una sola
--   transacción atómica. Cero huecos, cero conflictos con
--   inserts concurrentes desde múltiples dispositivos.
-- =====================================================

create or replace function public.insert_equipo(equipo_data jsonb)
returns public.equipos
language plpgsql
security definer
as $$
declare
  next_val bigint;
  inserted_row public.equipos;
begin
  -- 1) Asignar correlativo atómicamente. nextval() es thread-safe
  --    a nivel de Postgres: dos llamadas simultáneas devuelven números
  --    distintos aunque la tabla esté vacía o haya millones de filas.
  next_val := nextval('public.equipos_correlativo_seq');

  -- 2) Insertar la fila con todos los campos. Los CHECK constraints
  --    de la tabla (bodega, estado_operacional) y los NOT NULL se
  --    validan automáticamente; si algo viene mal, la función
  --    propaga el error y no se inserta nada (rollback implícito).
  insert into public.equipos (
    correlativo,
    bodega,
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
    equipo_data->>'elementos_faltantes',
    equipo_data->>'observaciones',
    equipo_data->>'responsable',
    coalesce((equipo_data->>'foto_enviada')::boolean, false)
  )
  returning * into inserted_row;

  return inserted_row;
end;
$$;

grant execute on function public.insert_equipo(jsonb) to anon;

-- (Opcional) La función next_equipo_correlativo() ya no se usa desde el cliente.
-- Si querés limpiarla más adelante:
--   drop function if exists public.next_equipo_correlativo();

-- =====================================================
-- Verificar:
--   select insert_equipo('{
--     "bodega": "Renca",
--     "numero_interno": "TEST-1",
--     "numero_serie": "SN-001",
--     "marca": "Caterpillar",
--     "modelo": "320D",
--     "estado_operacional": "Operativo",
--     "responsable": "Test"
--   }'::jsonb);
--   select max(correlativo), count(*) from public.equipos;
-- =====================================================
