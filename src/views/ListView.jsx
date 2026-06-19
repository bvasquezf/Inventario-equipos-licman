import { useMemo, useState } from 'react'
import { BODEGAS } from '../lib/constants'
import EstadoBadge from '../components/EstadoBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import { useToast } from '../context/ToastContext'

const CAMPOS_BUSQUEDA = [
  'numero_interno',
  'numero_serie',
  'marca',
  'modelo',
  'responsable',
  'ubicacion_actual',
]

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

function parseFaltantes(valor) {
  if (!valor) return []
  // jsonb array (Supabase lo deserializa como array JS).
  if (Array.isArray(valor)) return valor.filter(Boolean)
  // Fallback por si quedó alguna fila vieja con texto CSV.
  return String(valor)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function ListView({ equipos, bodegaFiltro, onEliminar }) {
  const toast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [filtroBodega, setFiltroBodega] = useState(bodegaFiltro || 'todas')
  const [confirmId, setConfirmId] = useState(null)
  const [soloDuplicados, setSoloDuplicados] = useState(false)

  // Detectar N° interno repetido POR BODEGA. Cada bodega tiene su
  // propia numeración, así que el mismo N° interno en bodegas
  // distintas NO se considera duplicado.
  // Estructura: Set de claves "bodega|numero_interno" con count > 1.
  const duplicados = useMemo(() => {
    const counts = {}
    for (const e of equipos) {
      if (e.numero_interno && e.bodega) {
        const key = `${e.bodega}|${e.numero_interno}`
        counts[key] = (counts[key] || 0) + 1
      }
    }
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1))
  }, [equipos])

  const equiposFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return equipos.filter((e) => {
      if (filtroBodega !== 'todas' && e.bodega !== filtroBodega) return false
      if (soloDuplicados) {
        const key = `${e.bodega}|${e.numero_interno}`
        if (!duplicados.has(key)) return false
      }
      if (!texto) return true
      return CAMPOS_BUSQUEDA.some((c) =>
        String(e[c] ?? '')
          .toLowerCase()
          .includes(texto),
      )
    })
  }, [equipos, busqueda, filtroBodega, soloDuplicados, duplicados])

  const equipoAEliminar = equipos.find((e) => e.id === confirmId)

  const handleConfirmarEliminar = async () => {
    if (!confirmId) return
    try {
      await onEliminar(confirmId)
      toast.success('Equipo eliminado')
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo eliminar')
    } finally {
      setConfirmId(null)
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.10)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="w-full text-[1.2rem] font-bold text-slate-900 sm:w-auto">
            Inventario registrado
          </h2>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <select
              value={filtroBodega}
              onChange={(e) => setFiltroBodega(e.target.value)}
              className="rounded-[10px] border-[1.5px] border-slate-300 bg-white px-3 py-2 text-[0.92rem] font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15"
              aria-label="Filtrar por bodega"
            >
              <option value="todas">Todas las bodegas</option>
              {BODEGAS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="🔍 Buscar (N° interno, serie, marca...)"
              className="min-w-0 flex-1 rounded-[10px] border-[1.5px] border-slate-300 bg-white px-3 py-2 text-[0.92rem] font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15 sm:w-72"
            />
          </div>
        </div>

        {/* Banner de alerta: N° internos repetidos */}
        {duplicados.size > 0 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-[10px] border-l-4 border-red-600 bg-red-50 px-3 py-2.5 text-[0.85rem] text-red-900">
            <span className="text-base">⚠️</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {duplicados.size === 1
                  ? 'Hay 1 N° interno repetido en una bodega'
                  : `Hay ${duplicados.size} N° internos repetidos`}
              </p>
              <p className="mt-0.5 text-[0.8rem] text-red-800">
                Revisá los equipos marcados en rojo. El mismo N° interno en la misma
                bodega indica que el equipo fue registrado más de una vez o que hay
                un error de tipeo.
              </p>
            </div>
          </div>
        )}

        {/* Filtro: solo mostrar duplicados */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[0.85rem] font-medium text-slate-700">
            <input
              type="checkbox"
              checked={soloDuplicados}
              onChange={(e) => setSoloDuplicados(e.target.checked)}
              className="h-4 w-4 accent-red-600"
            />
            Solo mostrar con N° interno repetido
            {duplicados.size > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.68rem] font-bold text-red-700">
                {duplicados.size}
              </span>
            )}
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-green-700">
            Operativo
          </span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-amber-700">
            Op. c/ obs.
          </span>
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-red-700">
            Inoperativo
          </span>
        </div>

        {equiposFiltrados.length === 0 ? (
          <div className="mt-4 rounded-[10px] border-2 border-dashed border-slate-300 px-5 py-7 text-center text-sm text-slate-500">
            {equipos.length === 0
              ? 'Aún no hay registros. Ve a "Registrar" para empezar.'
              : 'No se encontraron equipos con los filtros actuales.'}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {equiposFiltrados.map((e) => {
              const faltantes = parseFaltantes(e.elementos_faltantes)
              const correlativo = e.correlativo ?? '—'
              const dupKey = `${e.bodega}|${e.numero_interno}`
              const esDuplicado = duplicados.has(dupKey)
              return (
                <article
                  key={e.id}
                  className={`group grid grid-cols-[60px_1fr] items-start gap-3 rounded-[10px] border p-3.5 transition sm:p-4 ${
                    esDuplicado
                      ? 'border-red-300 bg-red-50/40 hover:shadow-[0_14px_30px_rgba(220,38,38,0.10)]'
                      : 'border-slate-200 bg-white hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(16,24,40,0.06)]'
                  }`}
                >
                  <div className="rounded-[10px] bg-slate-900 px-1 py-2 text-center font-extrabold text-white">
                    <span className="block text-[1.2rem] leading-none tabular-nums">
                      {String(correlativo).padStart(4, '0')}
                    </span>
                    <span className="mt-0.5 block text-[0.55rem] uppercase tracking-wider text-slate-400">
                      N°
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-base font-bold text-slate-900">
                      <span>
                        {e.marca} {e.modelo}
                      </span>
                      <EstadoBadge estado={e.estado_operacional} />
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[0.7rem] font-bold text-sky-800">
                        {e.bodega}
                      </span>
                      {esDuplicado && (
                        <span
                          className="rounded-full bg-red-100 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-red-700"
                          title={`El N° interno "${e.numero_interno}" está repetido en ${e.bodega}`}
                        >
                          ⚠ N° interno repetido
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.82rem] text-slate-600">
                      <span>
                        <b className="font-semibold text-slate-900">N° int:</b>{' '}
                        <span className="font-mono">{e.numero_interno || '—'}</span>
                      </span>
                      <span>
                        <b className="font-semibold text-slate-900">Serie:</b>{' '}
                        {e.numero_serie || '—'}
                      </span>
                      {e.ubicacion_actual && (
                        <span>
                          <b className="font-semibold text-slate-900">Ubicación:</b>{' '}
                          {e.ubicacion_actual}
                        </span>
                      )}
                      {e.horometro !== null && e.horometro !== undefined && e.horometro !== '' && (
                        <span>
                          <b className="font-semibold text-slate-900">Horómetro:</b>{' '}
                          {e.horometro}
                        </span>
                      )}
                    </div>

                    {e.observaciones && (
                      <div
                        className={`mt-1.5 rounded border-l-[3px] px-2.5 py-1.5 text-[0.85rem] ${
                          e.estado_operacional === 'Operativo con observaciones'
                            ? 'border-amber-600 bg-amber-50'
                            : 'border-slate-300 bg-slate-50'
                        }`}
                      >
                        {e.observaciones}
                      </div>
                    )}

                    {faltantes.length > 0 && (
                      <div className="mt-1.5 text-[0.78rem] font-medium text-red-700">
                        ⚠ Faltantes: {faltantes.join(', ')}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-slate-500">
                      <span>
                        👤 <b className="font-semibold text-slate-700">{e.responsable}</b>
                      </span>
                      <span>📅 {formatearFecha(e.created_at)}</span>
                      {e.foto_enviada && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-blue-700">
                          📸 Foto enviada
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmId(e.id)}
                        className="ml-auto rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[0.78rem] font-bold text-red-700 transition hover:-translate-y-px hover:border-red-300 hover:bg-red-100"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmId)}
        title="Eliminar equipo"
        message={
          equipoAEliminar
            ? `Vas a eliminar ${equipoAEliminar.marca} ${equipoAEliminar.modelo} (${equipoAEliminar.numero_interno}) de ${equipoAEliminar.bodega}. Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        onConfirm={handleConfirmarEliminar}
        onCancel={() => setConfirmId(null)}
        peligro
      />
    </section>
  )
}