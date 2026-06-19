-- =====================================================
-- Migración 006: bitácora de movimientos de equipos
-- =====================================================
-- Caso de uso: los equipos se mueven entre bodegas o salen a
-- arriendo a clientes. Queremos registrar cada traslado con:
--   - origen y destino (bodega + ubicación)
--   - motivo (cambio de bodega, arriendo, mantención, etc.)
--   - responsable y notas
--   - fecha automática
--
-- Decisión: solo se registran movimientos POSTERIORES al alta.
-- La bodega y ubicación del registro inicial quedan en `equipos`
-- sin generar un movimiento.
--
-- Para no tener que hacer JOIN cada vez que mostramos la card en
-- el historial, denormalizamos el último movimiento en la fila del
-- equipo (columna `ultimo_movimiento jsonb`). Se actualiza via
-- trigger cuando se inserta un movimiento.
-- =====================================================

-- 1) Columna denormalizada en `equipos`.
alter table public.equipos
  add column if not exists ultimo_movimiento jsonb;

-- 2) Tabla `movimientos`.
--    Nota: `equipos.id` es `bigint` (no `uuid`), por lo tanto
--    `equipo_id` acá también debe ser `bigint`. Si el SQL Editor
--    tira error "incompatible types: uuid and bigint" en el FK,
--    es por esto.
create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  equipo_id bigint not null references public.equipos(id) on delete cascade,
  bodega_origen text,
  bodega_destino text not null,
  ubicacion_origen text,
  ubicacion_destino text,
  motivo text not null,
  responsable text not null,
  notas text,
  fecha timestamptz not null default now()
);

-- Habilitar RLS sobre la tabla. Sin esto, la policy de abajo NO se
-- aplica y la tabla queda accesible vía el GRANT sin restricciones.
-- Supabase muestra un warning si creás una tabla sin RLS, así que
-- lo prendemos explícitamente.
alter table public.movimientos enable row level security;

-- 3) Índices.
create index if not exists idx_movimientos_equipo
  on public.movimientos (equipo_id, fecha desc);

create index if not exists idx_movimientos_fecha
  on public.movimientos (fecha desc);

-- 4) Privilegios + RLS (mismo patrón que `equipos`).
grant select, insert, update, delete on public.movimientos to anon;

drop policy if exists "anon_all_movimientos" on public.movimientos;
create policy "anon_all_movimientos"
  on public.movimientos
  for all
  to anon
  using (true)
  with check (true);

-- 5) RPC: registrar_movimiento (atómica).
--    Lee bodega/ubicación actual del equipo → inserta movimiento →
--    actualiza equipo → devuelve ambos.
create or replace function public.registrar_movimiento(
  p_equipo_id bigint,
  p_bodega_destino text,
  p_ubicacion_destino text,
  p_motivo text,
  p_responsable text,
  p_notas text default null
)
returns table (equipo public.equipos, movimiento public.movimientos)
language plpgsql
security definer
as $$
declare
  v_origen record;
  v_mov public.movimientos;
  v_equipo_actualizado public.equipos;
begin
  -- Leer estado actual (origen).
  select bodega, ubicacion_actual
    into v_origen
    from public.equipos
    where id = p_equipo_id and deleted_at is null;

  if v_origen.bodega is null then
    raise exception 'Equipo % no existe o está eliminado', p_equipo_id;
  end if;

  -- Insertar movimiento.
  insert into public.movimientos (
    equipo_id, bodega_origen, bodega_destino,
    ubicacion_origen, ubicacion_destino,
    motivo, responsable, notas
  )
  values (
    p_equipo_id, v_origen.bodega, p_bodega_destino,
    v_origen.ubicacion_actual, p_ubicacion_destino,
    p_motivo, p_responsable, p_notas
  )
  returning * into v_mov;

  -- Actualizar equipo + denormalizar último movimiento.
  update public.equipos
    set bodega = p_bodega_destino,
        ubicacion_actual = p_ubicacion_destino,
        ultimo_movimiento = jsonb_build_object(
          'id', v_mov.id,
          'fecha', v_mov.fecha,
          'bodega_origen', v_mov.bodega_origen,
          'bodega_destino', v_mov.bodega_destino,
          'ubicacion_origen', v_mov.ubicacion_origen,
          'ubicacion_destino', v_mov.ubicacion_destino,
          'motivo', v_mov.motivo,
          'responsable', v_mov.responsable,
          'notas', v_mov.notas
        )
    where id = p_equipo_id
    returning * into v_equipo_actualizado;

  -- Devolver ambos registros.
  equipo := v_equipo_actualizado;
  movimiento := v_mov;
  return next;
end;
$$;

grant execute on function public.registrar_movimiento to anon;

-- =====================================================
-- Verificar:
--
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'movimientos';
--
--   -- Probar RPC:
--   -- Probar RPC:
--   select * from registrar_movimiento(
--     (select id from public.equipos where deleted_at is null limit 1),
--     'Renca', 'Patio 3', 'Cambio de bodega', 'Test', null
--   );
--
--   -- Verificar denormalización:
--   select bodega, ultimo_movimiento from public.equipos
--   where ultimo_movimiento is not null;
-- =====================================================