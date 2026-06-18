-- =====================================================
-- Inventario Licman · Esquema inicial de base de datos
-- Ejecutar UNA sola vez en: Supabase Dashboard → SQL Editor
-- =====================================================

-- 1. Tabla principal de equipos
create table if not exists public.equipos (
  id                  bigserial primary key,
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

-- 3. Activar Row Level Security (RLS)
alter table public.equipos enable row level security;

-- 4. Política para MVP: el rol anon tiene acceso total (lectura, insert, update, delete).
-- ⚠️  Cuando se agregue autenticación, reemplazar con políticas basadas en auth.uid().
drop policy if exists "anon_all_equipos" on public.equipos;
create policy "anon_all_equipos"
  on public.equipos
  for all
  to anon
  using (true)
  with check (true);

-- 5. Habilitar Realtime para INSERT events.
--    (Equivale a marcar la tabla en Database → Replication → supabase_realtime)
alter publication supabase_realtime add table public.equipos;

-- =====================================================
-- Listo. Puedes verificar con:
--   select * from public.equipos order by created_at desc limit 5;
-- =====================================================