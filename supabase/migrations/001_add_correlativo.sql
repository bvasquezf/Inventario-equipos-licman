-- =====================================================
-- Migración 001: agregar columna correlativo a tabla existente
-- Ejecutar SOLO si ya tienes la tabla `equipos` creada sin correlativo.
-- =====================================================

-- 1. Agregar la columna (nullable inicialmente para permitir backfill)
alter table public.equipos
  add column if not exists correlativo bigint;

-- 2. Crear sequence si no existe
create sequence if not exists public.equipos_correlativo_seq
  increment by 1
  start with 1
  minvalue 1;

-- 3. Backfill: asignar correlativo a filas existentes usando row_number
--    Ordenamos por created_at para mantener el orden histórico.
with ranked as (
  select id, row_number() over (order by created_at asc, id asc) as rn
  from public.equipos
  where correlativo is null
)
update public.equipos e
  set correlativo = ranked.rn
  from ranked
  where e.id = ranked.id;

-- 4. Sincronizar la sequence con el máximo correlativo existente
select setval(
  'public.equipos_correlativo_seq',
  greatest(coalesce((select max(correlativo) from public.equipos), 0), 1),
  true
);

-- 5. Ahora sí: NOT NULL + UNIQUE
alter table public.equipos
  alter column correlativo set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'equipos_correlativo_key'
  ) then
    alter table public.equipos
      add constraint equipos_correlativo_key unique (correlativo);
  end if;
end $$;

-- 6. Crear la función RPC (idempotente)
create or replace function public.next_equipo_correlativo()
returns bigint
language plpgsql
security definer
as $$
declare
  next_val bigint;
begin
  next_val := nextval('public.equipos_correlativo_seq');
  return next_val;
end;
$$;

-- 7. Grant + índice
grant execute on function public.next_equipo_correlativo() to anon;
create index if not exists idx_equipos_correlativo on public.equipos (correlativo desc);

-- =====================================================
-- Verificar:
--   select count(*) from public.equipos where correlativo is null;   -- debe ser 0
--   select max(correlativo) from public.equipos;
--   select next_equipo_correlativo();
-- =====================================================