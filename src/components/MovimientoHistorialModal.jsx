import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function formatearFecha(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/**
 * Modal que muestra el historial completo de movimientos de un equipo.
 * Carga on-demand desde Supabase (no precargamos toda la tabla).
 *
 * Props:
 *  - open: boolean
 *  - equipo: { id, marca, modelo, numero_interno }
 *  - onClose(): void
 */
export default function MovimientoHistorialModal({ open, equipo, onClose }) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [movimientos, setMovimientos] = useState([])

  useEffect(() => {
    if (!open || !equipo?.id) return undefined
    let cancelado = false
    const cargar = async () => {
      setCargando(true)
      setError(null)
      const { data, error: err } = await supabase
        .from('movimientos')
        .select('*')
        .eq('equipo_id', equipo.id)
        .order('fecha', { ascending: false })
      if (cancelado) return
      if (err) {
        setError(err.message)
      } else {
        setMovimientos(data ?? [])
      }
      setCargando(false)
    }
    cargar()
    return () => {
      cancelado = true
    }
  }, [open, equipo?.id])

  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open || !equipo) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="historial-mov-titulo"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="historial-mov-titulo"
              className="text-[1.15rem] font-bold text-slate-900"
            >
              📜 Historial de movimientos
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {equipo.marca} {equipo.modelo} ·{' '}
              <span className="font-mono font-semibold">{equipo.numero_interno}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </header>

        {cargando && (
          <div className="rounded-[10px] border-2 border-dashed border-slate-300 px-5 py-7 text-center text-sm text-slate-500">
            Cargando movimientos…
          </div>
        )}

        {error && (
          <div className="rounded-[10px] border-l-4 border-red-600 bg-red-50 px-3 py-2.5 text-sm text-red-900">
            Error al cargar: {error}
          </div>
        )}

        {!cargando && !error && movimientos.length === 0 && (
          <div className="rounded-[10px] border-2 border-dashed border-slate-300 px-5 py-7 text-center text-sm text-slate-500">
            Este equipo aún no tiene movimientos registrados.{' '}
            <strong>Solo se registran traslados posteriores al alta.</strong>
          </div>
        )}

        {!cargando && !error && movimientos.length > 0 && (
          <ol className="space-y-2">
            {movimientos.map((m, idx) => (
              <li
                key={m.id}
                className={`rounded-[10px] border p-3 ${
                  idx === 0
                    ? 'border-blue-300 bg-blue-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-white">
                    {formatearFecha(m.fecha)}
                  </span>
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.7rem] font-bold text-violet-800">
                    {m.motivo}
                  </span>
                  {idx === 0 && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-white">
                      Último
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[0.92rem] font-semibold text-slate-900">
                  {m.bodega_origen ?? '—'}
                  <span className="mx-2 text-slate-400">→</span>
                  <span className="text-blue-700">{m.bodega_destino}</span>
                </p>
                {(m.ubicacion_origen || m.ubicacion_destino) && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {m.ubicacion_origen ?? '—'}
                    <span className="mx-1.5 text-slate-400">→</span>
                    <span className="font-medium text-slate-700">
                      {m.ubicacion_destino ?? '—'}
                    </span>
                  </p>
                )}
                <p className="mt-1.5 text-xs text-slate-500">
                  👤 <span className="font-semibold text-slate-700">{m.responsable}</span>
                </p>
                {m.notas && (
                  <p className="mt-1.5 rounded border-l-[3px] border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                    {m.notas}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}