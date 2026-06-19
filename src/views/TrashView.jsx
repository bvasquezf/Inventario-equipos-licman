import { useMemo, useState } from 'react'
import EstadoBadge from '../components/EstadoBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import { useToast } from '../context/ToastContext'

const CAMPOS_BUSQUEDA = [
  'numero_interno',
  'numero_serie',
  'marca',
  'modelo',
  'tipo_equipo',
  'responsable',
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

/**
 * Vista de papelera: muestra los equipos con `deleted_at` no nulo.
 * Permite restaurar (volver al historial) o eliminar definitivamente.
 *
 * Props:
 *  - equipos: array completo (incluye eliminados)
 *  - onRestaurar(id): async
 *  - onHardDelete(id): async (opcional, para vaciar papelera)
 */
export default function TrashView({ equipos, onRestaurar, onHardDelete }) {
  const toast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [restaurarId, setRestaurarId] = useState(null)
  const [hardDeleteId, setHardDeleteId] = useState(null)

  const papelera = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return equipos
      .filter((e) => e.deleted_at)
      .filter((e) => {
        if (!texto) return true
        return CAMPOS_BUSQUEDA.some((c) =>
          String(e[c] ?? '')
            .toLowerCase()
            .includes(texto),
        )
      })
      .sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at))
  }, [equipos, busqueda])

  const equipoARestaurar = equipos.find((e) => e.id === restaurarId)
  const equipoAHardDelete = equipos.find((e) => e.id === hardDeleteId)

  const handleRestaurar = async () => {
    if (!restaurarId) return
    try {
      await onRestaurar(restaurarId)
      toast.success('Equipo restaurado')
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo restaurar')
    } finally {
      setRestaurarId(null)
    }
  }

  const handleHardDelete = async () => {
    if (!hardDeleteId) return
    try {
      await onHardDelete(hardDeleteId)
      toast.success('Eliminado definitivamente')
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo eliminar definitivamente')
    } finally {
      setHardDeleteId(null)
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.10)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[1.2rem] font-bold text-slate-900">🗑️ Papelera</h2>
            <p className="text-sm text-slate-500">
              Equipos eliminados. Podés restaurarlos o borrarlos definitivamente.
            </p>
          </div>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar en papelera..."
            className="min-w-0 flex-1 rounded-[10px] border-[1.5px] border-slate-300 bg-white px-3 py-2 text-[0.92rem] font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15 sm:w-72"
          />
        </div>

        {papelera.length === 0 ? (
          <div className="mt-4 rounded-[10px] border-2 border-dashed border-slate-300 px-5 py-7 text-center text-sm text-slate-500">
            {equipos.some((e) => e.deleted_at)
              ? 'No se encontraron equipos con esos términos.'
              : 'La papelera está vacía. Los equipos eliminados aparecerán acá.'}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {papelera.map((e) => (
              <article
                key={e.id}
                className="grid grid-cols-[60px_1fr] items-start gap-3 rounded-[10px] border border-red-200 bg-red-50/30 p-3.5 sm:p-4"
              >
                <div className="rounded-[10px] bg-red-700 px-1 py-2 text-center font-extrabold text-white">
                  <span className="block text-[1.2rem] leading-none tabular-nums">
                    {e.correlativo ? String(e.correlativo).padStart(4, '0') : '—'}
                  </span>
                  <span className="mt-0.5 block text-[0.55rem] uppercase tracking-wider text-red-200">
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
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-slate-500">
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.68rem] font-bold text-red-700">
                      🗑️ Eliminado {formatearFecha(e.deleted_at)}
                    </span>
                    <span>
                      👤 <b className="font-semibold text-slate-700">{e.responsable}</b>
                    </span>
                    <div className="ml-auto flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setRestaurarId(e.id)}
                        className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[0.78rem] font-bold text-blue-700 transition hover:-translate-y-px hover:border-blue-300 hover:bg-blue-100"
                      >
                        ↩️ Restaurar
                      </button>
                      {onHardDelete && (
                        <button
                          type="button"
                          onClick={() => setHardDeleteId(e.id)}
                          className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-[0.78rem] font-bold text-red-700 transition hover:-translate-y-px hover:bg-red-100"
                        >
                          Borrar definitivo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(restaurarId)}
        title="Restaurar equipo"
        message={
          equipoARestaurar
            ? `Vas a restaurar ${equipoARestaurar.marca} ${equipoARestaurar.modelo} (${equipoARestaurar.numero_interno}). Volverá al inventario activo.`
            : ''
        }
        confirmLabel="Restaurar"
        onConfirm={handleRestaurar}
        onCancel={() => setRestaurarId(null)}
      />

      <ConfirmDialog
        open={Boolean(hardDeleteId)}
        title="Borrar definitivamente"
        message={
          equipoAHardDelete
            ? `Vas a borrar DEFINITIVAMENTE ${equipoAHardDelete.marca} ${equipoAHardDelete.modelo} (${equipoAHardDelete.numero_interno}). Esta acción NO se puede deshacer.`
            : ''
        }
        confirmLabel="Borrar definitivamente"
        onConfirm={handleHardDelete}
        onCancel={() => setHardDeleteId(null)}
        peligro
      />
    </section>
  )
}