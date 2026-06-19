-- =====================================================
-- Migración 003: arreglar DELETE para el rol anon
-- =====================================================
-- Síntoma: al eliminar desde la app, el toast muestra éxito
-- pero al recargar la página el registro sigue ahí.
--
-- Causa típica: el rol `anon` no tiene el GRANT de DELETE a
-- nivel tabla. Aunque la policy RLS diga `for all ... using (true)`,
-- Postgres rechaza la operación si el rol no tiene el privilegio.
-- El cliente Supabase a veces devuelve `{ error: null }` aunque
-- la fila NO se haya borrado.
-- =====================================================

-- 1) Asegurar que anon tiene los 4 privilegios CRUD sobre la tabla.
--    (Si ya están otorgados, este GRANT es idempotente.)
grant select, insert, update, delete on public.equipos to anon;

-- 2) Re-crear la policy con sintaxis explícita. `for all` cubre
--    SELECT/INSERT/UPDATE/DELETE, pero lo dejamos inequívoco.
drop policy if exists "anon_all_equipos" on public.equipos;
create policy "anon_all_equipos"
  on public.equipos
  for all
  to anon
  using (true)
  with check (true);

-- =====================================================
-- Verificar (pegar en SQL Editor después de correr la migración):
--
--   -- Privilegios del rol anon:
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and table_name = 'equipos'
--     and grantee = 'anon';
--   -- Debe listar: SELECT, INSERT, UPDATE, DELETE
--
--   -- Policies activas:
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where tablename = 'equipos';
--
--   -- Test de borrado manual (con un id que NO exista):
--   delete from public.equipos where id = 999999999;
--   -- Debe devolver "DELETE 0" sin error de permisos.
-- =====================================================
