import { useEffect, useMemo, useState } from 'react'
import { BODEGAS } from '../lib/constants'
import EstadoBadge from '../components/EstadoBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import MovimientoDialog from '../components/MovimientoDialog'
import MovimientoHistorialModal from '../components/MovimientoHistorialModal'
import { useToast } from '../context/ToastContext'

// Cantidad de cards por página en el inventario. Mobile-first: 20
// mantiene un scroll razonable sin saturar la pantalla.
const ITEMS_POR_PAGINA = 20

const CAMPOS_BUSQUEDA = [
  'numero_interno',
  'numero_serie',
  'marca',
  'modelo',
  'tipo_equipo',
  'responsable',
  'ubicacion_actual',
]

/**
 * Genera la lista de números de página a mostrar, con ellipsis
 * cuando hay muchas páginas. Ejemplos:
 *   7 páginas, actual 3 → [1, 2, 3, 4, 5, '…', 7]
 *   4 páginas, actual 2 → [1, 2, 3, 4]
 *   1 página            → [1]
 */
function generarPaginas(actual, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const paginas = [1]
  const inicio = Math.max(2, actual - 1)
  const fin = Math.min(total - 1, actual + 1)
  if (inicio > 2) paginas.push('…')
  for (let i = inicio; i <= fin; i++) paginas.push(i)
  if (fin < total - 1) paginas.push('…')
  paginas.push(total)
  return paginas
}

function Paginacion({ pagina, totalPaginas, desde, hasta, total, onCambiar }) {
  const paginas = generarPaginas(pagina, totalPaginas)
  const hayAnterior = pagina > 1
  const haySiguiente = pagina < totalPaginas

  return (
    <nav
      className="mt-4 flex flex-col items-center gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between"
      aria-label="Paginación del inventario"
    >
      <p className="text-[0.78rem] font-medium text-slate-600 tabular-nums">
        Mostrando <strong className="text-slate-900">{desde}</strong>–
        <strong className="text-slate-900">{hasta}</strong> de{' '}
        <strong className="text-slate-900">{total}</strong>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onCambiar(pagina - 1)}
          disabled={!hayAnterior}
          className="rounded-lg border-[1.5px] border-slate-300 bg-white px-2.5 py-1.5 text-[0.78rem] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Anterior
        </button>
        {paginas.map((p, i) =>
          p === '…' ? (
            <span
              key={`ellipsis-${i}`}
              className="px-1 text-[0.78rem] font-bold text-slate-400"
              aria-hidden
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onCambiar(p)}
              aria-current={p === pagina ? 'page' : undefined}
              className={`min-w-[2.25rem] rounded-lg border-[1.5px] px-2 py-1.5 text-[0.78rem] font-bold tabular-nums transition ${
                p === pagina
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onCambiar(pagina + 1)}
          disabled={!haySiguiente}
          className="rounded-lg border-[1.5px] border-slate-300 bg-white px-2.5 py-1.5 text-[0.78rem] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente →
        </button>
      </div>
    </nav>
  )
}

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

// Fecha corta sin hora (para líneas secundarias tipo "movido el 15/06").
function formatearFechaCorta(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
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

export default function ListView({ equipos, bodegaFiltro, onEliminar, onRegistrarMovimiento }) {
  const toast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [filtroBodega, setFiltroBodega] = useState(bodegaFiltro || 'todas')
  const [confirmId, setConfirmId] = useState(null)
  const [soloDuplicados, setSoloDuplicados] = useState(false)
  const [filtroRapido, setFiltroRapido] = useState('todos')
  const [movimientoEquipo, setMovimientoEquipo] = useState(null)
  const [historialEquipo, setHistorialEquipo] = useState(null)
  const [pagina, setPagina] = useState(1)

  // Equipos visibles (excluir papelera). La papelera tiene su propia
  // vista, así que acá solo mostramos los activos.
  const equiposActivos = useMemo(
    () => equipos.filter((e) => !e.deleted_at),
    [equipos],
  )

  // Conteos por filtro rápido sobre el universo ya filtrado por bodega.
  // Los chips muestran números que cambian con `filtroBodega`.
  const conteosFiltros = useMemo(() => {
    const base =
      filtroBodega === 'todas'
        ? equiposActivos
        : equiposActivos.filter((e) => e.bodega === filtroBodega)
    return {
      todos: base.length,
      operativos: base.filter((e) => e.estado_operacional === 'Operativo').length,
      inoperativos: base.filter((e) => e.estado_operacional === 'Inoperativo').length,
      con_faltantes: base.filter((e) => {
        const f = parseFaltantes(e.elementos_faltantes)
        return f.length > 0
      }).length,
      sin_foto: base.filter((e) => !e.foto_enviada).length,
    }
  }, [equiposActivos, filtroBodega])

  // Detectar N° interno repetido POR BODEGA. Cada bodega tiene su
  // propia numeración, así que el mismo N° interno en bodegas
  // distintas NO se considera duplicado.
  // Estructura: Set de claves "bodega|numero_interno" con count > 1.
  // Solo considera equipos activos (no los de la papelera).
  const duplicados = useMemo(() => {
    const counts = {}
    for (const e of equiposActivos) {
      if (e.numero_interno && e.bodega) {
        const key = `${e.bodega}|${e.numero_interno}`
        counts[key] = (counts[key] || 0) + 1
      }
    }
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1))
  }, [equiposActivos])

  const equiposFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return equiposActivos.filter((e) => {
      if (filtroBodega !== 'todas' && e.bodega !== filtroBodega) return false
      if (soloDuplicados) {
        const key = `${e.bodega}|${e.numero_interno}`
        if (!duplicados.has(key)) return false
      }
      // Filtros rápidos.
      if (filtroRapido === 'operativos' && e.estado_operacional !== 'Operativo') return false
      if (filtroRapido === 'inoperativos' && e.estado_operacional !== 'Inoperativo') return false
      if (filtroRapido === 'con_faltantes') {
        const f = parseFaltantes(e.elementos_faltantes)
        if (f.length === 0) return false
      }
      if (filtroRapido === 'sin_foto' && e.foto_enviada) return false
      if (!texto) return true
      return CAMPOS_BUSQUEDA.some((c) =>
        String(e[c] ?? '')
          .toLowerCase()
          .includes(texto),
      )
    })
  }, [equiposActivos, busqueda, filtroBodega, soloDuplicados, duplicados, filtroRapido])

  // Paginación: cuando cambia cualquier filtro, volvemos a la página 1
  // para que el usuario no quede atrapado en una página que ya no
  // tiene items después de filtrar.
  useEffect(() => {
    setPagina(1)
  }, [busqueda, filtroBodega, soloDuplicados, filtroRapido])

  const totalPaginas = Math.max(1, Math.ceil(equiposFiltrados.length / ITEMS_POR_PAGINA))

  // Si la página actual quedó fuera de rango (por ejemplo porque se
  // borraron items), la corregimos a la última válida.
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas)
  }, [pagina, totalPaginas])

  const equiposPaginados = useMemo(() => {
    const inicio = (pagina - 1) * ITEMS_POR_PAGINA
    return equiposFiltrados.slice(inicio, inicio + ITEMS_POR_PAGINA)
  }, [equiposFiltrados, pagina])

  const rangoActual = useMemo(() => {
    if (equiposFiltrados.length === 0) return { desde: 0, hasta: 0 }
    const desde = (pagina - 1) * ITEMS_POR_PAGINA + 1
    const hasta = Math.min(pagina * ITEMS_POR_PAGINA, equiposFiltrados.length)
    return { desde, hasta }
  }, [equiposFiltrados.length, pagina])

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

  const handleRegistrarMovimiento = async (payload) => {
    if (!onRegistrarMovimiento) return
    try {
      await onRegistrarMovimiento(payload)
      toast.success('Movimiento registrado')
      setMovimientoEquipo(null)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo registrar el movimiento')
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

        {/* Filtros rápidos (chips clickeables con conteo) */}
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtros rápidos">
          {[
            { id: 'todos', label: 'Todos', color: 'slate' },
            { id: 'operativos', label: 'Operativos', color: 'green' },
            { id: 'inoperativos', label: 'Inoperativos', color: 'red' },
            { id: 'con_faltantes', label: 'Con faltantes', color: 'amber' },
            { id: 'sin_foto', label: 'Sin foto', color: 'blue' },
          ].map((chip) => {
            const activo = filtroRapido === chip.id
            const count = conteosFiltros[chip.id] ?? 0
            const colorClasses = {
              slate: activo
                ? 'border-slate-700 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
              green: activo
                ? 'border-green-700 bg-green-600 text-white'
                : 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100',
              red: activo
                ? 'border-red-700 bg-red-600 text-white'
                : 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100',
              amber: activo
                ? 'border-amber-700 bg-amber-600 text-white'
                : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
              blue: activo
                ? 'border-blue-700 bg-blue-600 text-white'
                : 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100',
            }[chip.color]
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFiltroRapido(chip.id)}
                aria-pressed={activo}
                className={`flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5 text-[0.78rem] font-bold transition ${colorClasses}`}
              >
                <span>{chip.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0 text-[0.68rem] tabular-nums ${
                    activo ? 'bg-white/25' : 'bg-black/10'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
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
            {equiposActivos.length === 0
              ? 'Aún no hay registros. Ve a "Registrar" para empezar.'
              : 'No se encontraron equipos con los filtros actuales.'}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {equiposPaginados.map((e) => {
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
                      {e.tipo_equipo && (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.7rem] font-bold text-violet-800">
                          {e.tipo_equipo}
                        </span>
                      )}
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

                    {/* Última ubicación (destacada) y resumen de último movimiento. */}
                    {(e.ubicacion_actual || e.ultimo_movimiento) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.82rem] text-slate-700">
                        <span className="font-semibold">
                          📍 {e.ubicacion_actual || e.bodega}
                        </span>
                        {e.ultimo_movimiento && (
                          <span className="text-[0.78rem] text-slate-500">
                            · Movido a <strong className="text-slate-700">{e.ultimo_movimiento.bodega_destino}</strong>
                            {' '}
                            el {formatearFechaCorta(e.ultimo_movimiento.fecha)} por{' '}
                            <strong className="text-slate-700">{e.ultimo_movimiento.responsable}</strong>
                            {' '}
                            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[0.68rem] font-bold text-violet-800">
                              {e.ultimo_movimiento.motivo}
                            </span>
                          </span>
                        )}
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
                      <div className="ml-auto flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setMovimientoEquipo(e)}
                          className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[0.78rem] font-bold text-blue-700 transition hover:-translate-y-px hover:border-blue-300 hover:bg-blue-100"
                          title="Registrar un traslado o cambio de ubicación"
                        >
                          🔄 Mover
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistorialEquipo(e)}
                          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[0.78rem] font-bold text-slate-700 transition hover:-translate-y-px hover:bg-slate-50"
                          title="Ver historial completo de movimientos"
                        >
                          📜 Historial
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(e.id)}
                          className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[0.78rem] font-bold text-red-700 transition hover:-translate-y-px hover:border-red-300 hover:bg-red-100"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {/* ============ Paginación ============ */}
        {equiposFiltrados.length > 0 && (
          <Paginacion
            pagina={pagina}
            totalPaginas={totalPaginas}
            desde={rangoActual.desde}
            hasta={rangoActual.hasta}
            total={equiposFiltrados.length}
            onCambiar={setPagina}
          />
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

      <MovimientoDialog
        open={Boolean(movimientoEquipo)}
        equipo={movimientoEquipo}
        onSubmit={handleRegistrarMovimiento}
        onCancel={() => setMovimientoEquipo(null)}
      />

      <MovimientoHistorialModal
        open={Boolean(historialEquipo)}
        equipo={historialEquipo}
        onClose={() => setHistorialEquipo(null)}
      />
    </section>
  )
}