import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import FormView from './views/FormView'
import ListView from './views/ListView'
import ExportView from './views/ExportView'
import { supabase, tieneCredenciales } from './lib/supabase'
import { BODEGAS } from './lib/constants'
import { useToast } from './context/ToastContext'

const BODEGA_INICIAL = 'todas'
const TAB_INICIAL = 'form'

export default function App() {
  const toast = useToast()

  const [equipos, setEquipos] = useState([])
  const [bodegaFiltro, setBodegaFiltro] = useState(BODEGA_INICIAL)
  const [tabActiva, setTabActiva] = useState(TAB_INICIAL)
  const [cargando, setCargando] = useState(false)
  const [errorInicial, setErrorInicial] = useState(null)

  // Conteos por bodega para los stats del header.
  const conteo = useMemo(() => {
    const acc = { todas: equipos.length }
    for (const b of BODEGAS) acc[b] = 0
    for (const e of equipos) {
      if (acc[e.bodega] !== undefined) acc[e.bodega] += 1
    }
    return acc
  }, [equipos])

  // Carga inicial -------------------------------------------------------
  useEffect(() => {
    if (!tieneCredenciales) {
      setErrorInicial(
        'Faltan las credenciales de Supabase. Crea un archivo .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
      )
      return undefined
    }

    let cancelado = false
    setCargando(true)

    const cargar = async () => {
      const { data, error } = await supabase
        .from('equipos')
        .select('*')
        .order('created_at', { ascending: false })

      if (cancelado) return
      if (error) {
        setErrorInicial(error.message)
        toast.error(`Error al cargar: ${error.message}`)
      } else {
        setEquipos(data ?? [])
      }
      setCargando(false)
    }

    cargar()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime -----------------------------------------------------------
  useEffect(() => {
    if (!tieneCredenciales) return undefined

    const canal = supabase
      .channel('equipos-insert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'equipos' },
        (payload) => {
          const nuevo = payload?.new
          if (!nuevo) return
          setEquipos((prev) => {
            if (prev.some((e) => e.id === nuevo.id)) return prev
            return [nuevo, ...prev]
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  // Handlers -----------------------------------------------------------
  const guardarEquipo = useCallback(async (equipo) => {
    if (!supabase) throw new Error('No hay credenciales de Supabase configuradas.')
    const { data, error } = await supabase
      .from('equipos')
      .insert(equipo)
      .select()
      .single()
    if (error) throw new Error(error.message)
    if (data) {
      setEquipos((prev) => (prev.some((e) => e.id === data.id) ? prev : [data, ...prev]))
    }
    return data
  }, [])

  const eliminarEquipo = useCallback(async (id) => {
    if (!supabase) throw new Error('No hay credenciales de Supabase configuradas.')
    const { error } = await supabase.from('equipos').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setEquipos((prev) => prev.filter((e) => e.id !== id))
  }, [])

  // Render -------------------------------------------------------------
  return (
    <div
      className="flex min-h-screen flex-col text-slate-900"
      style={{
        minHeight: '100svh',
        background: 'linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)',
      }}
    >
      <Header
        bodega={bodegaFiltro}
        onBodegaChange={setBodegaFiltro}
        tabActiva={tabActiva}
        onTabChange={setTabActiva}
        conteo={conteo}
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

        {/* Las vistas se montan una sola vez y se ocultan con `hidden`.
            Así el correlativo de FormView no se "quema" al cambiar de pestaña. */}
        <div hidden={tabActiva !== 'form'}>
          <FormView bodegaInicial={bodegaFiltro} onGuardar={guardarEquipo} />
        </div>

        <div hidden={tabActiva !== 'list'} className="space-y-3">
          {cargando && (
            <p className="text-sm text-slate-500">Cargando inventario…</p>
          )}
          <ListView
            equipos={equipos}
            bodegaFiltro={bodegaFiltro}
            onEliminar={eliminarEquipo}
          />
        </div>

        <div hidden={tabActiva !== 'export'}>
          <ExportView equipos={equipos} bodegaFiltro={bodegaFiltro} />
        </div>
      </main>
    </div>
  )
}