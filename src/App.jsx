import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import FormView from './views/FormView'
import ListView from './views/ListView'
import ExportView from './views/ExportView'
import TrashView from './views/TrashView'
import { supabase, tieneCredenciales } from './lib/supabase'
import { BODEGAS } from './lib/constants'
import { useToast } from './context/ToastContext'
import { useNetwork } from './context/NetworkContext'
import {
  cacheEquipos,
  getCachedEquipos,
  enqueuePendingWrite,
} from './lib/offlineDb'

const BODEGA_INICIAL = 'todas'
const TAB_INICIAL = 'form'

// Helpers --------------------------------------------------------------

// Genera un id temporal para items optimistas. El prefijo `temp-` lo
// distingue de los UUID reales, así podemos barrerlo después del flush.
function makeTempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// `true` si parece un error de red (sin internet, timeout, fetch failed).
// NO incluye errores de validación (que，我们应该 propagar al usuario).
function esErrorDeRed(err) {
  if (!err) return false
  const msg = String(err?.message ?? err).toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('networkerror') ||
    msg.includes('timeout') ||
    msg.includes('offline') ||
    !navigator.onLine
  )
}

// Limpia del state los items con id temporal. Se llama después del
// flush, porque los rows reales ya llegaron por realtime.
function limpiarTempIds(prev) {
  return prev.filter((e) => !String(e.id ?? '').startsWith('temp-'))
}

// Hook para cargar equipos con cache-first.
function useEquiposLoad(toast) {
  const [equipos, setEquipos] = useState([])
  const [cargando, setCargando] = useState(false)
  const [errorInicial, setErrorInicial] = useState(null)

  useEffect(() => {
    if (!tieneCredenciales) {
      setErrorInicial(
        'Faltan las credenciales de Supabase. Crea un archivo .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
      )
      return undefined
    }

    let cancelado = false

    const cargar = async () => {
      setCargando(true)

      // 1) Pintar inmediatamente desde cache (instantáneo).
      try {
        const cached = await getCachedEquipos()
        if (!cancelado && cached.length > 0) {
          setEquipos(cached)
          setCargando(false)
        }
      } catch {
        // Cache vacío o error → seguimos.
      }

      // 2) Fetch desde Supabase (fuente de verdad).
      const { data, error } = await supabase
        .from('equipos')
        .select('*')
        .order('created_at', { ascending: false })

      if (cancelado) return
      if (error) {
        // Si falló la red y NO tenemos cache, mostramos el error.
        setErrorInicial(error.message)
        toast.error(`Error al cargar: ${error.message}`)
      } else {
        // 3) Reemplazar por la versión fresca + actualizar cache.
        const fresh = data ?? []
        setEquipos(fresh)
        cacheEquipos(fresh).catch(() => {})
      }
      setCargando(false)
    }

    cargar()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { equipos, setEquipos, cargando, errorInicial }
}

// App ------------------------------------------------------------------

export default function App() {
  const toast = useToast()
  const { online, refrescarPending } = useNetwork()
  const { equipos, setEquipos, cargando, errorInicial } = useEquiposLoad(toast)

  const [bodegaFiltro, setBodegaFiltro] = useState(BODEGA_INICIAL)
  const [tabActiva, setTabActiva] = useState(TAB_INICIAL)

  // Conteos por bodega para los stats del header. Excluye papelera.
  const conteo = useMemo(() => {
    const acc = { todas: 0 }
    for (const b of BODEGAS) acc[b] = 0
    for (const e of equipos) {
      if (e.deleted_at) continue // papelera no cuenta
      acc.todas++
      if (acc[e.bodega] !== undefined) acc[e.bodega] += 1
    }
    return acc
  }, [equipos])

  const papeleraCount = useMemo(
    () => equipos.filter((e) => e.deleted_at).length,
    [equipos],
  )

  // Realtime -------------------------------------------------------------
  useEffect(() => {
    if (!tieneCredenciales) return undefined

    const canal = supabase
      .channel('equipos-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'equipos' },
        (payload) => {
          const nuevo = payload?.new
          if (!nuevo) return
          setEquipos((prev) => {
            // Si ya existe (porque llegó por otro medio), no duplicar.
            if (prev.some((e) => e.id === nuevo.id)) return prev
            // Si hay un temp-* en state que matchee por contenido, lo
            // reemplazamos (caso típico: insert offline → flush → realtime).
            const idxTemp = prev.findIndex(
              (e) =>
                String(e.id).startsWith('temp-') &&
                e.numero_interno === nuevo.numero_interno &&
                e.bodega === nuevo.bodega,
            )
            if (idxTemp >= 0) {
              const next = prev.slice()
              next[idxTemp] = nuevo
              return next
            }
            return [nuevo, ...prev]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'equipos' },
        (payload) => {
          const actualizado = payload?.new
          if (!actualizado?.id) return
          setEquipos((prev) =>
            prev.map((e) => (e.id === actualizado.id ? actualizado : e)),
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [setEquipos])

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const guardarEquipo = useCallback(
    async (equipo) => {
      if (!supabase) throw new Error('No hay credenciales de Supabase configuradas.')

      const tempId = makeTempId()
      const optimisticItem = {
        ...equipo,
        id: tempId,
        correlativo: null,
        created_at: new Date().toISOString(),
      }

      // Si el navegador dice offline, encolar y agregar optimista.
      if (!navigator.onLine) {
        await enqueuePendingWrite({ type: 'insert_equipo', payload: equipo })
        setEquipos((prev) => [optimisticItem, ...prev])
        await refrescarPending()
        toast.info('Sin conexión — guardado localmente. Se subirá al reconectar.')
        return optimisticItem
      }

      try {
        const { data, error } = await supabase.rpc('insert_equipo', {
          equipo_data: equipo,
        })
        if (error) throw error
        if (data) {
          setEquipos((prev) =>
            prev.some((e) => e.id === data.id) ? prev : [data, ...prev],
          )
        }
        return data
      } catch (err) {
        if (esErrorDeRed(err)) {
          await enqueuePendingWrite({ type: 'insert_equipo', payload: equipo })
          setEquipos((prev) => [optimisticItem, ...prev])
          await refrescarPending()
          toast.info('Sin conexión — guardado localmente. Se subirá al reconectar.')
          return optimisticItem
        }
        throw new Error(err?.message ?? 'Error al guardar')
      }
    },
    [refrescarPending, toast, setEquipos],
  )

  const eliminarEquipo = useCallback(
    async (id) => {
      if (!supabase) throw new Error('No hay credenciales de Supabase configuradas.')

      // Offline: encolar y aplicar update optimista (marca deleted_at).
      if (!navigator.onLine) {
        const tempDeletedAt = new Date().toISOString()
        await enqueuePendingWrite({
          type: 'soft_delete',
          payload: { id },
        })
        setEquipos((prev) =>
          prev.map((e) =>
            e.id === id ? { ...e, deleted_at: tempDeletedAt } : e,
          ),
        )
        await refrescarPending()
        toast.info('Sin conexión — eliminado se sincronizará al reconectar.')
        return
      }

      try {
        const { data: deleted, error } = await supabase.rpc('soft_delete_equipo', {
          p_id: id,
        })
        if (error) throw error
        if (!deleted) throw new Error('No se pudo eliminar el equipo')

        setEquipos((prev) =>
          prev.map((e) => (e.id === id ? { ...e, deleted_at: deleted.deleted_at } : e)),
        )

        // TODO / STAND BY: notificación por correo al admin.
        // --------------------------------------------------------------
        // Esta funcionalidad está pausada por decisión del usuario.
        // Cuando se retome hay que:
        //   1. Crear cuenta en resend.com y obtener API key
        //   2. supabase functions deploy notify-delete --no-verify-jwt
        //   3. supabase secrets set RESEND_API_KEY=... ADMIN_EMAIL=bavf.1995@gmail.com
        //   4. Descomentar el bloque de abajo
        // El código de la Edge Function está en
        //   supabase/functions/notify-delete/index.ts
        // y la migración 007_soft_delete.sql deja todo listo del lado DB.
        // --------------------------------------------------------------
        // try {
        //   await supabase.functions.invoke('notify-delete', {
        //     body: { record: deleted },
        //   })
        // } catch (err) {
        //   console.warn('No se pudo notificar por correo:', err?.message ?? err)
        // }
      } catch (err) {
        if (esErrorDeRed(err)) {
          const tempDeletedAt = new Date().toISOString()
          await enqueuePendingWrite({
            type: 'soft_delete',
            payload: { id },
          })
          setEquipos((prev) =>
            prev.map((e) =>
              e.id === id ? { ...e, deleted_at: tempDeletedAt } : e,
            ),
          )
          await refrescarPending()
          toast.info('Sin conexión — eliminado se sincronizará al reconectar.')
          return
        }
        throw new Error(err?.message ?? 'Error al eliminar')
      }
    },
    [refrescarPending, toast, setEquipos],
  )

  const restaurarEquipo = useCallback(
    async (id) => {
      if (!supabase) throw new Error('No hay credenciales de Supabase configuradas.')

      if (!navigator.onLine) {
        await enqueuePendingWrite({ type: 'restore', payload: { id } })
        setEquipos((prev) =>
          prev.map((e) => (e.id === id ? { ...e, deleted_at: null } : e)),
        )
        await refrescarPending()
        toast.info('Sin conexión — restauración se sincronizará al reconectar.')
        return
      }

      try {
        const { data, error } = await supabase.rpc('restore_equipo', { p_id: id })
        if (error) throw error
        if (data) {
          setEquipos((prev) => prev.map((e) => (e.id === id ? data : e)))
        }
        return data
      } catch (err) {
        if (esErrorDeRed(err)) {
          await enqueuePendingWrite({ type: 'restore', payload: { id } })
          setEquipos((prev) =>
            prev.map((e) => (e.id === id ? { ...e, deleted_at: null } : e)),
          )
          await refrescarPending()
          toast.info('Sin conexión — restauración se sincronizará al reconectar.')
          return
        }
        throw new Error(err?.message ?? 'Error al restaurar')
      }
    },
    [refrescarPending, toast, setEquipos],
  )

  const hardDeleteEquipo = useCallback(
    async (id) => {
      if (!supabase) throw new Error('No hay credenciales de Supabase configuradas.')

      if (!navigator.onLine) {
        await enqueuePendingWrite({ type: 'hard_delete', payload: { id } })
        setEquipos((prev) => prev.filter((e) => e.id !== id))
        await refrescarPending()
        toast.info('Sin conexión — borrado se sincronizará al reconectar.')
        return
      }

      try {
        const { error } = await supabase.rpc('hard_delete_equipo', { p_id: id })
        if (error) throw error
        setEquipos((prev) => prev.filter((e) => e.id !== id))
      } catch (err) {
        if (esErrorDeRed(err)) {
          await enqueuePendingWrite({ type: 'hard_delete', payload: { id } })
          setEquipos((prev) => prev.filter((e) => e.id !== id))
          await refrescarPending()
          toast.info('Sin conexión — borrado se sincronizará al reconectar.')
          return
        }
        throw new Error(err?.message ?? 'Error al eliminar')
      }
    },
    [refrescarPending, toast, setEquipos],
  )

  const registrarMovimiento = useCallback(
    async (payload) => {
      if (!supabase) throw new Error('No hay credenciales de Supabase configuradas.')

      if (!navigator.onLine) {
        await enqueuePendingWrite({ type: 'movimiento', payload })
        setEquipos((prev) =>
          prev.map((e) =>
            e.id === payload.equipo_id
              ? {
                  ...e,
                  bodega: payload.bodega_destino,
                  ubicacion_actual: payload.ubicacion_destino,
                  ultimo_movimiento: {
                    fecha: new Date().toISOString(),
                    bodega_origen: e.bodega,
                    bodega_destino: payload.bodega_destino,
                    ubicacion_origen: e.ubicacion_actual,
                    ubicacion_destino: payload.ubicacion_destino,
                    motivo: payload.motivo,
                    responsable: payload.responsable,
                    notas: payload.notas,
                  },
                }
              : e,
          ),
        )
        await refrescarPending()
        toast.info('Sin conexión — movimiento se sincronizará al reconectar.')
        return
      }

      try {
        const { data, error } = await supabase.rpc('registrar_movimiento', {
          p_equipo_id: payload.equipo_id,
          p_bodega_destino: payload.bodega_destino,
          p_ubicacion_destino: payload.ubicacion_destino,
          p_motivo: payload.motivo,
          p_responsable: payload.responsable,
          p_notas: payload.notas,
        })
        if (error) throw error
        if (Array.isArray(data) && data.length > 0) {
          const equipoActualizado = data.find((r) => r.id === payload.equipo_id)
          if (equipoActualizado) {
            setEquipos((prev) =>
              prev.map((e) => (e.id === equipoActualizado.id ? equipoActualizado : e)),
            )
          }
        }
        return data
      } catch (err) {
        if (esErrorDeRed(err)) {
          await enqueuePendingWrite({ type: 'movimiento', payload })
          setEquipos((prev) =>
            prev.map((e) =>
              e.id === payload.equipo_id
                ? {
                    ...e,
                    bodega: payload.bodega_destino,
                    ubicacion_actual: payload.ubicacion_destino,
                    ultimo_movimiento: {
                      fecha: new Date().toISOString(),
                      bodega_origen: e.bodega,
                      bodega_destino: payload.bodega_destino,
                      ubicacion_origen: e.ubicacion_actual,
                      ubicacion_destino: payload.ubicacion_destino,
                      motivo: payload.motivo,
                      responsable: payload.responsable,
                      notas: payload.notas,
                    },
                  }
                : e,
            ),
          )
          await refrescarPending()
          toast.info('Sin conexión — movimiento se sincronizará al reconectar.')
          return
        }
        throw new Error(err?.message ?? 'Error al registrar movimiento')
      }
    },
    [refrescarPending, toast, setEquipos],
  )

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div
      className="flex min-h-screen flex-col text-slate-900"
      style={{
        minHeight: '100svh',
        background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
      }}
    >
      <Header
        bodega={bodegaFiltro}
        onBodegaChange={setBodegaFiltro}
        tabActiva={tabActiva}
        onTabChange={setTabActiva}
        conteo={conteo}
        papeleraCount={papeleraCount}
      />

      <main
        className="mx-auto w-full max-w-6xl flex-1 px-3 pb-6 pt-4 sm:px-6 sm:pt-5"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        {errorInicial && (
          <div className="mb-4 rounded-[10px] border-l-4 border-amber-600 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold">Configuración pendiente</p>
            <p className="mt-0.5">{errorInicial}</p>
          </div>
        )}

        {!online && (
          <div className="mb-4 rounded-[10px] border-l-4 border-red-600 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
            <p className="font-bold">🔴 Sin conexión</p>
            <p className="mt-0.5">
              Los cambios se guardan localmente y se sincronizan automáticamente
              cuando vuelvas a tener internet.
            </p>
          </div>
        )}

        {/* Las vistas se montan una sola vez y se ocultan con `hidden`.
            Así el correlativo de FormView no se "quema" al cambiar de pestaña. */}
        <div hidden={tabActiva !== 'form'}>
          <FormView bodega={bodegaFiltro} equipos={equipos} onGuardar={guardarEquipo} />
        </div>

        <div hidden={tabActiva !== 'list'} className="space-y-3">
          {cargando && (
            <p className="text-sm text-slate-500">Cargando inventario…</p>
          )}
          <ListView
            equipos={equipos}
            bodegaFiltro={bodegaFiltro}
            onEliminar={eliminarEquipo}
            onRegistrarMovimiento={registrarMovimiento}
          />
        </div>

        <div hidden={tabActiva !== 'trash'}>
          <TrashView
            equipos={equipos}
            onRestaurar={restaurarEquipo}
            onHardDelete={hardDeleteEquipo}
          />
        </div>

        <div hidden={tabActiva !== 'export'}>
          <ExportView equipos={equipos} bodegaFiltro={bodegaFiltro} />
        </div>
      </main>
    </div>
  )
}