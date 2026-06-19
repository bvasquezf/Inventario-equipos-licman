-- =====================================================
-- Migración 004: agregar columna tipo_equipo
-- =====================================================
-- El usuario pidió un campo obligatorio para clasificar el tipo de
-- maquinaria al registrar un equipo. Se guarda como texto libre
-- (no ENUM) para poder agregar/modificar tipos sin migraciones.
--
-- Lista actual (10 tipos, sincronizada con TIPOS_EQUIPO en
-- src/lib/constants.js):
--   - Apilador retract
--   - Apilador pedestre
--   - Grúa horquilla eléctrica
--   - Grúa horquilla a gas
--   - Traspaleta eléctrica
--   - Order picker
--   - Carro remolque
--   - Alza hombre unipersonal
--   - Apilador retractil multidireccional
--   - Recoge pedidos horizontal
-- =====================================================

-- 1) Nueva columna. NOT NULL sin DEFAULT → falla en filas existentes.
--    Primero la agregamos NULL para no romper los registros viejos.
alter table public.equipos
  add column if not exists tipo_equipo text;

-- 2) CHECK a nivel DB para que no entren valores basura. Los registros
--    viejos van a quedar en NULL (compatibilidad hacia atrás).
alter table public.equipos
  drop constraint if exists equipos_tipo_equipo_check;
alter table public.equipos
  add constraint equipos_tipo_equipo_check
  check (
    tipo_equipo is null
    or tipo_equipo in (
      'Apilador retract',
      'Apilador pedestre',
      'Grúa horquilla eléctrica',
      'Grúa horquilla a gas',
      'Traspaleta eléctrica',
      'Order picker',
      'Carro remolque',
      'Alza hombre unipersonal',
      'Apilador retractil multidireccional',
      'Recoge pedidos horizontal'
    )
  );

-- 3) Índice: vamos a filtrar/agrupar por tipo en el futuro.
create index if not exists idx_equipos_tipo_equipo
  on public.equipos (tipo_equipo);

-- =====================================================
-- Verificar:
--   \d public.equipos
--   -- Debe aparecer columna "tipo_equipo | text"
--
--   select tipo_equipo, count(*)
--   from public.equipos
--   group by tipo_equipo;
--   -- Los registros viejos van a aparecer agrupados bajo NULL.
-- =====================================================