import { useEffect, useRef, useState } from 'react'
import { BODEGAS, MOTIVOS_MOVIMIENTO } from '../lib/constants'

const clasesInput =
  'mt-1 block w-full rounded-[10px] border-[1.5px] border-slate-300 bg-white px-3 py-2.5 text-base font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15'

const estadoInicial = {
  bodega_destino: '',
  ubicacion_destino: '',
  motivo: '',
  responsable: '',
  notas: '',
}

/**
 * Diálogo controlado para registrar un movimiento de equipo.
 * Sigue el patrón de ConfirmDialog (props controladas).
 *
 * Props:
 *  - open: boolean
 *  - equipo: { id, marca, modelo, numero_interno, bodega, ubicacion_actual }
 *  - onSubmit(payload): async
 *  - onCancel(): void
 */
export default function MovimientoDialog({ open, equipo, onSubmit, onCancel }) {
  const refs = useRef({})
  const [form, setForm] = useState(estadoInicial)
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)

  // Reset form cada vez que se abre.
  useEffect(() => {
    if (open) {
      setForm({
        ...estadoInicial,
        // Pre-seleccionar la bodega destino igual a la actual (es lo
        // más común: "sigue en X pero se movió a otra ubicación").
        bodega_destino: equipo?.bodega ?? '',
        responsable: '',
      })
      setErrores({})
      setGuardando(false)
    }
  }, [open, equipo])

  // Escape cierra.
  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open || !equipo) return null

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errores[name]) {
      setErrores((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const validar = () => {
    const errs = {}
    if (!form.bodega_destino) errs.bodega_destino = 'Selecciona una bodega'
    if (!BODEGAS.includes(form.bodega_destino)) errs.bodega_destino = 'Bodega no válida'
    if (!form.motivo) errs.motivo = 'Selecciona un motivo'
    if (!MOTIVOS_MOVIMIENTO.includes(form.motivo)) errs.motivo = 'Motivo no válido'
    if (!form.responsable.trim()) errs.responsable = 'Indica quién registra'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validar()
    if (Object.keys(errs).length > 0) {
      setErrores(errs)
      const primerCampo = Object.keys(errs)[0]
      refs.current[primerCampo]?.focus()
      return
    }
    setGuardando(true)
    try {
      await onSubmit({
        equipo_id: equipo.id,
        bodega_destino: form.bodega_destino,
        ubicacion_destino: form.ubicacion_destino.trim() || null,
        motivo: form.motivo,
        responsable: form.responsable.trim(),
        notas: form.notas.trim() || null,
      })
    } catch (err) {
      // El padre maneja el toast. Acá solo dejamos de guardar.
      console.error(err)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="movimiento-titulo"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <header className="mb-4">
          <h2 id="movimiento-titulo" className="text-[1.15rem] font-bold text-slate-900">
            🔄 Registrar movimiento
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {equipo.marca} {equipo.modelo} ·{' '}
            <span className="font-mono font-semibold">{equipo.numero_interno}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Origen actual:{' '}
            <strong className="text-slate-700">{equipo.bodega}</strong>
            {equipo.ubicacion_actual && (
              <>
                {' '}
                · <span className="italic">{equipo.ubicacion_actual}</span>
              </>
            )}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-[0.85rem] font-semibold text-slate-900">
              Bodega destino
              <select
                name="bodega_destino"
                value={form.bodega_destino}
                onChange={handleChange}
                ref={(el) => (refs.current.bodega_destino = el)}
                className={clasesInput}
              >
                <option value="">— Selecciona —</option>
                {BODEGAS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              {errores.bodega_destino && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  {errores.bodega_destino}
                </p>
              )}
            </label>

            <label className="block text-[0.85rem] font-semibold text-slate-900">
              Ubicación destino
              <input
                type="text"
                name="ubicacion_destino"
                value={form.ubicacion_destino}
                onChange={handleChange}
                ref={(el) => (refs.current.ubicacion_destino = el)}
                placeholder="Ej. Patio norte, Galpón 2"
                className={clasesInput}
              />
            </label>
          </div>

          <label className="block text-[0.85rem] font-semibold text-slate-900">
            Motivo
            <select
              name="motivo"
              value={form.motivo}
              onChange={handleChange}
              ref={(el) => (refs.current.motivo = el)}
              className={clasesInput}
            >
              <option value="">— Selecciona —</option>
              {MOTIVOS_MOVIMIENTO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {errores.motivo && (
              <p className="mt-1 text-xs font-medium text-red-600">{errores.motivo}</p>
            )}
          </label>

          <label className="block text-[0.85rem] font-semibold text-slate-900">
            Responsable
            <input
              type="text"
              name="responsable"
              value={form.responsable}
              onChange={handleChange}
              ref={(el) => (refs.current.responsable = el)}
              placeholder="Tu nombre completo"
              className={clasesInput}
            />
            {errores.responsable && (
              <p className="mt-1 text-xs font-medium text-red-600">
                {errores.responsable}
              </p>
            )}
          </label>

          <label className="block text-[0.85rem] font-semibold text-slate-900">
            Notas <span className="font-normal text-slate-500">(opcional)</span>
            <textarea
              name="notas"
              rows={2}
              value={form.notas}
              onChange={handleChange}
              placeholder="Cliente, condiciones, detalles relevantes..."
              className={`${clasesInput} resize-y`}
            />
          </label>

          <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 rounded-[10px] bg-blue-600 px-4 py-3 text-base font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Registrar movimiento'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={guardando}
              className="flex-1 rounded-[10px] bg-slate-100 px-4 py-3 text-base font-bold text-slate-900 transition hover:bg-slate-200 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}