-- =====================================================
-- Inventario Licman · Esquema inicial de base de datos
-- Ejecutar UNA sola vez en: Supabase Dashboard → SQL Editor
-- =====================================================

-- 1. Tabla principal de equipos
create table if not exists public.equipos (
  id                  bigserial primary key,
  correlativo         bigint      unique not null,
  bodega              text        not null check (bodega in ('Antillanca', 'Cordillera', 'Renca')),
  numero_interno      text        not null,
  numero_serie        text        not null,
  marca               text        not null,
  modelo              text        not null,
  ubicacion_actual    text,
  estado_operacional  text        not null check (estado_operacional in ('Operativo', 'Operativo con observaciones', 'Inoperativo')),
  horometro           numeric,
  elementos_faltantes text,
  observaciones       text,
  responsable         text        not null,
  foto_enviada        boolean     default false,
  created_at          timestamptz default now()
);

-- 2. Índices para acelerar filtros por bodega y orden por fecha
create index if not exists idx_equipos_bodega on public.equipos (bodega);
create index if not exists idx_equipos_created_at on public.equipos (created_at desc);
-- El UNIQUE ya crea un índice implícito sobre correlativo, pero dejamos explícito el orden por él
create index if not exists idx_equipos_correlativo on public.equipos (correlativo desc);

-- 3. Sequence para asignar correlativos de forma atómica y libre de race conditions.
--    Cada llamada a nextval() devuelve un número único incluso con miles de requests simultáneos.
create sequence if not exists public.equipos_correlativo_seq
  increment by 1
  start with 1
  minvalue 1;

-- 4. Función RPC que devuelve el siguiente correlativo disponible.
--    Se invoca desde el cliente al abrir el formulario de registro.
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

-- 5. Activar Row Level Security (RLS)
alter table public.equipos enable row level security;

-- 6. Política para MVP: el rol anon tiene acceso total.
drop policy if exists "anon_all_equipos" on public.equipos;
create policy "anon_all_equipos"
  on public.equipos
  for all
  to anon
  using (true)
  with check (true);

-- 7. Permitir que el rol anon ejecute la función de correlativo
grant execute on function public.next_equipo_correlativo() to anon;

-- 8. Habilitar Realtime para INSERT events.
alter publication supabase_realtime add table public.equipos;

-- =====================================================
-- Listo. Puedes verificar con:
--   select * from public.equipos order by correlativo desc limit 5;
--   select next_equipo_correlativo();   -- devuelve el siguiente número
-- =====================================================