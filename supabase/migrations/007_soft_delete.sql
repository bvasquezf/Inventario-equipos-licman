-- =====================================================
-- Migración 007: soft delete + papelera
-- =====================================================
-- En vez de borrar definitivamente, marcamos `deleted_at` con la
-- fecha de eliminación. Esto nos da:
--   1. Posibilidad de restaurar (papelera)
--   2. Historial completo: nada se pierde de la base
--   3. Notificación por correo (Edge Function) antes/después de borrar
--
-- El cliente (App.jsx) sigue llamando `eliminarEquipo(id)` pero
-- internamente usa el RPC `soft_delete_equipo` que setea el timestamp.
-- =====================================================

-- 1) Columna `deleted_at` en equipos.
alter table public.equipos
  add column if not exists deleted_at timestamptz;

-- 2) Índice parcial para listar papelera eficientemente.
create index if not exists idx_equipos_deleted_at
  on public.equipos (deleted_at)
  where deleted_at is not null;

-- 3) RPC: soft_delete_equipo.
--    Marca la fila como eliminada (deleted_at = now()) y la devuelve.
--    NO borra. Si ya estaba eliminada, error.
--    Nota: `equipos.id` es `bigint`, no `uuid`.
create or replace function public.soft_delete_equipo(p_id bigint)
returns public.equipos
language plpgsql
security definer
as $$
declare
  v_row public.equipos;
begin
  update public.equipos
    set deleted_at = now()
    where id = p_id and deleted_at is null
    returning * into v_row;

  if v_row.id is null then
    raise exception 'Equipo no existe o ya está eliminado';
  end if;

  return v_row;
end;
$$;

grant execute on function public.soft_delete_equipo to anon;

-- 4) RPC: restore_equipo.
--    Saca la fila de la papelera (deleted_at = null).
create or replace function public.restore_equipo(p_id bigint)
returns public.equipos
language plpgsql
security definer
as $$
declare
  v_row public.equipos;
begin
  update public.equipos
    set deleted_at = null
    where id = p_id
    returning * into v_row;

  if v_row.id is null then
    raise exception 'Equipo no existe';
  end if;

  return v_row;
end;
$$;

grant execute on function public.restore_equipo to anon;

-- 5) RPC: hard_delete_equipo (borrado definitivo desde la papelera).
--    Útil si quieren vaciar la papelera o eliminar definitivamente.
create or replace function public.hard_delete_equipo(p_id bigint)
returns void
language plpgsql
security definer
as $$
begin
  delete from public.equipos where id = p_id;
end;
$$;

grant execute on function public.hard_delete_equipo to anon;

-- =====================================================
-- Verificar:
--
--   -- Listar papelera:
--   select id, marca, modelo, numero_interno, deleted_at
--   from public.equipos
--   where deleted_at is not null
--   order by deleted_at desc;
--
--   -- Soft delete de prueba:
--   select soft_delete_equipo('00000000-0000-0000-0000-000000000000');
--   -- Devuelve error (no existe).
--
--   -- Restaurar:
--   select restore_equipo('00000000-0000-0000-0000-000000000000');
--   -- Devuelve error (no existe).
-- =====================================================