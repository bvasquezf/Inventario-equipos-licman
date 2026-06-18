import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const tieneCredenciales = Boolean(url && anonKey)

// Solo creamos el cliente si hay credenciales reales. Si no, exportamos null
// y dejamos que los consumidores (App.jsx) cortocircuiten con `tieneCredenciales`.
export const supabase = tieneCredenciales
  ? createClient(url, anonKey, {
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null

if (!tieneCredenciales) {
  // Mensaje visible en consola del navegador para el desarrollador.
  // eslint-disable-next-line no-console
  console.error(
    '[Supabase] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. ' +
      'Copia .env.example a .env y completa las variables.',
  )
}