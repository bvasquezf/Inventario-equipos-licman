// Lógica para vaciar la cola de pendingWrites contra Supabase.
//
// Tipos soportados:
//   - 'insert_equipo'    → RPC insert_equipo(equipo_data)
//   - 'soft_delete'      → RPC soft_delete_equipo(p_id)
//   - 'restore'          → RPC restore_equipo(p_id)
//   - 'movimiento'       → RPC registrar_movimiento(...)
//
// Si la app vuelve online y hay N items en cola, flushQueue() los
// procesa en orden FIFO. Cada item exitoso se borra de la cola;
// los que fallan se reintentan hasta N veces (después quedan
// pendientes para próximo flush).

import { supabase } from './supabase'
import {
  getPendingWrites,
  removePendingWrite,
  incrementPendingRetry,
  getPendingCount,
} from './offlineDb'

const MAX_RETRIES = 5

async function ejecutarItem(item) {
  if (!supabase) throw new Error('No hay cliente Supabase configurado')

  switch (item.type) {
    case 'insert_equipo': {
      const { data, error } = await supabase.rpc('insert_equipo', {
        equipo_data: item.payload,
      })
      if (error) throw error
      return data
    }
    case 'soft_delete': {
      const { error } = await supabase.rpc('soft_delete_equipo', {
        p_id: item.payload.id,
      })
      if (error) throw error
      return null
    }
    case 'restore': {
      const { error } = await supabase.rpc('restore_equipo', {
        p_id: item.payload.id,
      })
      if (error) throw error
      return null
    }
    case 'movimiento': {
      const { data, error } = await supabase.rpc('registrar_movimiento', {
        p_equipo_id: item.payload.equipo_id,
        p_bodega_destino: item.payload.bodega_destino,
        p_ubicacion_destino: item.payload.ubicacion_destino,
        p_motivo: item.payload.motivo,
        p_responsable: item.payload.responsable,
        p_notas: item.payload.notas,
      })
      if (error) throw error
      return data
    }
    case 'notify_delete': {
      // Best-effort: si falla, no bloqueamos. Pero como es solo el
      // email, lo reintentamos igual.
      try {
        await supabase.functions.invoke('notify-delete', {
          body: { record: item.payload },
        })
      } catch (err) {
        // No reintentamos indefinidamente el email.
        return { skip: true }
      }
      return null
    }
    default:
      throw new Error(`Tipo de write desconocido: ${item.type}`)
  }
}

/**
 * Vuelca la cola contra el server.
 *
 * @param {object} opts
 * @param {(progress: { done: number, total: number, item: any }) => void} [opts.onProgress]
 * @returns {{ flushed: number, failed: number, skipped: number }}
 */
export async function flushQueue({ onProgress } = {}) {
  if (!supabase) return { flushed: 0, failed: 0, skipped: 0 }
  if (!navigator.onLine) return { flushed: 0, failed: 0, skipped: 0 }

  const items = await getPendingWrites()
  // Orden FIFO por id (autoIncrement → más viejo primero).
  items.sort((a, b) => a.id - b.id)

  let flushed = 0
  let failed = 0
  let skipped = 0

  for (const item of items) {
    if (!navigator.onLine) break // se cortó la conexión en medio del flush
    try {
      const result = await ejecutarItem(item)
      if (result?.skip) {
        skipped++
        await removePendingWrite(item.id)
        continue
      }
      await removePendingWrite(item.id)
      flushed++
      onProgress?.({ done: flushed + failed + skipped, total: items.length, item })
    } catch (err) {
      console.warn(`[offlineQueue] Falló item ${item.id} (${item.type}):`, err)
      const next = await incrementPendingRetry(item.id)
      if (next && next.retries >= MAX_RETRIES) {
        // Demasiados reintentos: lo dejamos en cola pero loggeamos
        // fuerte. El siguiente flush lo intentará de nuevo.
        console.error(
          `[offlineQueue] Item ${item.id} alcanzó ${MAX_RETRIES} reintentos`,
        )
      }
      failed++
      onProgress?.({ done: flushed + failed + skipped, total: items.length, item })
    }
  }

  return { flushed, failed, skipped }
}

export async function pendingCount() {
  return getPendingCount()
}