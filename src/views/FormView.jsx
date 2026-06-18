import { useEffect, useRef, useState } from 'react'
import {
  BODEGAS,
  ESTADOS,
  ELEMENTOS_FALTANTES,
  PHOTO_EMAIL,
} from '../lib/constants'
import { validarEquipo } from '../lib/validacion'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'

const ESTADO_DESCRIPCIONES = {
  Operativo: 'Equipo en condiciones de trabajar inmediatamente.',
  'Operativo con observaciones':
    'Funcional con defectos menores o pendientes.',
  Inoperativo: 'No puede operar por fallas o falta de componentes.',
}

const clasesInput =
  'mt-1.5 block w-full rounded-[10px] border-[1.5px] border-slate-300 bg-white px-3 py-2.5 text-base font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15'

const estadoInicial = {
  bodega: '',
  numero_interno: '',
  numero_serie: '',
  marca: '',
  modelo: '',
  ubicacion_actual: '',
  estado_operacional: '',
  horometro: '',
  elementos_faltantes: [],
  observaciones: '',
  responsable: '',
  foto_enviada: false,
  correlativo: null,
}

/**
 * Formulario de registro de equipos.
 * Al montarse, solicita a Supabase un correlativo único atómico.
 * Props:
 *  - bodegaInicial: string
 *  - onGuardar(equipo): async
 */
export default function FormView({ bodegaInicial = '', onGuardar }) {
  const toast = useToast()
  const refs = useRef({})

  const [form, setForm] = useState(() => ({
    ...estadoInicial,
    bodega: bodegaInicial && bodegaInicial !== 'todas' ? bodegaInicial : '',
  }))
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [estadoCorrelativo, setEstadoCorrelativo] = useState('cargando') // 'cargando' | 'listo' | 'error'

  // ------------------------------------------------------------------
  // Solicitar correlativo único al abrir el formulario.
  // Postgres nextval() es atómico: garantiza que dos llamadas simultáneas
  // devuelvan números distintos.
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelado = false
    const obtener = async () => {
      if (!supabase) {
        setEstadoCorrelativo('error')
        return
      }
      const { data, error } = await supabase.rpc('next_equipo_correlativo')
      if (cancelado) return
      if (error) {
        console.error('Error al obtener correlativo:', error)
        setEstadoCorrelativo('error')
        toast.error('No se pudo asignar correlativo')
        return
      }
      setForm((prev) => ({ ...prev, correlativo: data }))
      setEstadoCorrelativo('listo')
    }
    obtener()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
    if (errores[name]) {
      setErrores((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const toggleFaltante = (item) => {
    setForm((prev) => {
      const lista = prev.elementos_faltantes ?? []
      const existe = lista.includes(item)
      return {
        ...prev,
        elementos_faltantes: existe
          ? lista.filter((x) => x !== item)
          : [...lista, item],
      }
    })
  }

  const handleLimpiar = () => {
    setForm({
      ...estadoInicial,
      bodega: bodegaInicial && bodegaInicial !== 'todas' ? bodegaInicial : '',
    })
    setErrores({})
    // Re-solicitar correlativo (el actual queda "quemado" en la sequence).
    setEstadoCorrelativo('cargando')
    if (supabase) {
      supabase.rpc('next_equipo_correlativo').then(({ data, error }) => {
        if (error) {
          setEstadoCorrelativo('error')
          return
        }
        setForm((prev) => ({ ...prev, correlativo: data }))
        setEstadoCorrelativo('listo')
      })
    }
  }

  const reintentarCorrelativo = async () => {
    setEstadoCorrelativo('cargando')
    if (!supabase) {
      setEstadoCorrelativo('error')
      return
    }
    const { data, error } = await supabase.rpc('next_equipo_correlativo')
    if (error) {
      setEstadoCorrelativo('error')
      toast.error('No se pudo reasignar correlativo')
      return
    }
    setForm((prev) => ({ ...prev, correlativo: data }))
    setEstadoCorrelativo('listo')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.correlativo) {
      toast.error('Aún no se asignó un correlativo. Reintenta.')
      return
    }

    const payload = {
      ...form,
      elementos_faltantes: (form.elementos_faltantes ?? []).join(', '),
      horometro:
        form.horometro === '' || form.horometro === null ? null : Number(form.horometro),
    }
    const { ok, errores: nuevosErrores } = validarEquipo(payload)
    if (!ok) {
      setErrores(nuevosErrores)
      const primerCampo = Object.keys(nuevosErrores)[0]
      if (primerCampo && refs.current[primerCampo]) {
        refs.current[primerCampo].focus()
        refs.current[primerCampo].scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      toast.error('Revisa los campos marcados')
      return
    }

    setGuardando(true)
    try {
      await onGuardar(payload)
      toast.success(`Registro #${String(form.correlativo).padStart(4, '0')} guardado`)
      handleLimpiar()
    } catch (err) {
      console.error(err)
      // Detectar violación de unicidad (por si dos clientes recibieran el mismo número).
      if (err?.message?.includes('correlativo_key') || err?.message?.includes('duplicate')) {
        toast.error('Conflicto de correlativo. Reasignando…')
        await reintentarCorrelativo()
      } else {
        toast.error(err?.message ?? 'Error al guardar el equipo')
      }
    } finally {
      setGuardando(false)
    }
  }

  const correlativoTexto =
    form.correlativo != null ? String(form.correlativo).padStart(4, '0') : '----'

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      noValidate
    >
      {/* ============ Ticket de correlativo ============ */}
      <div
        className={`flex items-center justify-between gap-3 rounded-[14px] border-2 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.10)] sm:px-5 sm:py-4 ${
          estadoCorrelativo === 'error'
            ? 'border-red-300 bg-red-50'
            : estadoCorrelativo === 'cargando'
              ? 'border-slate-200 bg-white'
              : 'border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50'
        }`}
      >
        <div className="min-w-0">
          <p className="text-[0.72rem] font-bold uppercase tracking-wider text-slate-500">
            Correlativo asignado
          </p>
          {estadoCorrelativo === 'cargando' && (
            <p className="mt-1 text-base font-semibold text-slate-500">
              Solicitando número único…
            </p>
          )}
          {estadoCorrelativo === 'listo' && (
            <p className="mt-0.5 text-[0.78rem] text-slate-600">
              Este número es permanente y único en todo el sistema.
            </p>
          )}
          {estadoCorrelativo === 'error' && (
            <p className="mt-1 text-sm text-red-700">
              No se pudo asignar un correlativo.
              <button
                type="button"
                onClick={reintentarCorrelativo}
                className="ml-2 rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700"
              >
                Reintentar
              </button>
            </p>
          )}
        </div>

        <div
          className={`grid h-16 w-20 shrink-0 place-items-center rounded-xl font-mono text-2xl font-extrabold tabular-nums shadow-inner sm:h-20 sm:w-24 sm:text-3xl ${
            estadoCorrelativo === 'listo'
              ? 'bg-slate-900 text-white'
              : estadoCorrelativo === 'error'
                ? 'bg-red-200 text-red-800'
                : 'animate-pulse bg-slate-200 text-slate-400'
          }`}
        >
          #{correlativoTexto}
        </div>
      </div>

      <div className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.10)] sm:p-6">
        <header className="mb-5">
          <h2 className="text-[1.2rem] font-bold text-slate-900">Nuevo registro</h2>
          <p className="text-sm text-slate-500">
            Completa los datos del equipo.
          </p>
        </header>

        {/* ============ Identificación ============ */}
        <fieldset className="rounded-[10px] border border-slate-200 px-3.5 py-2.5 sm:px-4 sm:py-3">
          <legend className="px-2 text-[0.78rem] font-bold uppercase tracking-wider text-blue-600">
            Identificación del equipo
          </legend>

          <label className="block text-[0.88rem] font-semibold text-slate-900">
            Bodega
            <select
              name="bodega"
              value={form.bodega}
              onChange={handleChange}
              ref={(el) => (refs.current.bodega = el)}
              className={clasesInput}
            >
              <option value="">— Selecciona —</option>
              {BODEGAS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            {errores.bodega && (
              <p className="mt-1 text-xs font-medium text-red-600">{errores.bodega}</p>
            )}
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-[0.88rem] font-semibold text-slate-900">
              Número interno
              <input
                type="text"
                name="numero_interno"
                value={form.numero_interno}
                onChange={handleChange}
                ref={(el) => (refs.current.numero_interno = el)}
                placeholder="Ej. INT-0421"
                className={clasesInput}
              />
              {errores.numero_interno && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  {errores.numero_interno}
                </p>
              )}
            </label>
            <label className="block text-[0.88rem] font-semibold text-slate-900">
              Número de serie
              <input
                type="text"
                name="numero_serie"
                value={form.numero_serie}
                onChange={handleChange}
                ref={(el) => (refs.current.numero_serie = el)}
                placeholder="Ej. SN-ABC123"
                className={clasesInput}
              />
              {errores.numero_serie && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  {errores.numero_serie}
                </p>
              )}
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-[0.88rem] font-semibold text-slate-900">
              Marca
              <input
                type="text"
                name="marca"
                value={form.marca}
                onChange={handleChange}
                ref={(el) => (refs.current.marca = el)}
                placeholder="Ej. Caterpillar"
                className={clasesInput}
              />
              {errores.marca && (
                <p className="mt-1 text-xs font-medium text-red-600">{errores.marca}</p>
              )}
            </label>
            <label className="block text-[0.88rem] font-semibold text-slate-900">
              Modelo
              <input
                type="text"
                name="modelo"
                value={form.modelo}
                onChange={handleChange}
                ref={(el) => (refs.current.modelo = el)}
                placeholder="Ej. 320D"
                className={clasesInput}
              />
              {errores.modelo && (
                <p className="mt-1 text-xs font-medium text-red-600">{errores.modelo}</p>
              )}
            </label>
          </div>

          <label className="block text-[0.88rem] font-semibold text-slate-900">
            Ubicación actual
            <input
              type="text"
              name="ubicacion_actual"
              value={form.ubicacion_actual}
              onChange={handleChange}
              ref={(el) => (refs.current.ubicacion_actual = el)}
              placeholder="Ej. Patio norte, Galpón 2"
              className={clasesInput}
            />
          </label>
        </fieldset>

        {/* ============ Estado operacional ============ */}
        <fieldset className="mt-3.5 rounded-[10px] border border-slate-200 px-3.5 py-2.5 sm:px-4 sm:py-3">
          <legend className="px-2 text-[0.78rem] font-bold uppercase tracking-wider text-blue-600">
            Estado operacional
          </legend>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup">
            {ESTADOS.map((estado) => {
              const checked = form.estado_operacional === estado
              return (
                <label
                  key={estado}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-[10px] border-[1.5px] px-3 py-2.5 transition ${
                    checked
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-slate-300 bg-white hover:border-blue-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="estado_operacional"
                    value={estado}
                    checked={checked}
                    onChange={handleChange}
                    ref={(el) => (refs.current.estado_operacional = el)}
                    className="mt-0.5 h-4 w-4 accent-blue-600"
                  />
                  <span>
                    <strong
                      className={`block text-[0.92rem] ${checked ? 'text-blue-600' : 'text-slate-900'}`}
                    >
                      {estado === 'Operativo con observaciones'
                        ? 'Operativo c/ obs.'
                        : estado}
                    </strong>
                    <small className="mt-0.5 block text-[0.78rem] font-normal text-slate-500">
                      {ESTADO_DESCRIPCIONES[estado]}
                    </small>
                  </span>
                </label>
              )
            })}
          </div>
          {errores.estado_operacional && (
            <p className="mt-2 text-xs font-medium text-red-600">
              {errores.estado_operacional}
            </p>
          )}
        </fieldset>

        {/* ============ Información complementaria ============ */}
        <fieldset className="mt-3.5 rounded-[10px] border border-slate-200 px-3.5 py-2.5 sm:px-4 sm:py-3">
          <legend className="px-2 text-[0.78rem] font-bold uppercase tracking-wider text-blue-600">
            Información complementaria
          </legend>

          <label className="block text-[0.88rem] font-semibold text-slate-900">
            Horómetro <span className="font-normal text-slate-500">(cuando corresponda)</span>
            <input
              type="text"
              inputMode="numeric"
              name="horometro"
              value={form.horometro}
              onChange={handleChange}
              placeholder="Ej. 1250 h"
              className={clasesInput}
            />
            {errores.horometro && (
              <p className="mt-1 text-xs font-medium text-red-600">{errores.horometro}</p>
            )}
          </label>

          <div className="mt-3">
            <span className="block text-[0.88rem] font-semibold text-slate-900">
              Elementos faltantes
            </span>
            <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {ELEMENTOS_FALTANTES.map((item) => {
                const checked = (form.elementos_faltantes ?? []).includes(item)
                return (
                  <label
                    key={item}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border-[1.5px] px-2.5 py-2 text-[0.88rem] font-medium transition ${
                      checked
                        ? 'border-amber-600 bg-amber-50'
                        : 'border-slate-200 bg-slate-50 hover:bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFaltante(item)}
                      className="h-4 w-4 accent-amber-600"
                    />
                    {item}
                  </label>
                )
              })}
            </div>
          </div>

          <label className="mt-3 block text-[0.88rem] font-semibold text-slate-900">
            Observaciones relevantes
            <textarea
              name="observaciones"
              rows={3}
              value={form.observaciones}
              onChange={handleChange}
              placeholder="Inconsistencias, modificaciones, detalles relevantes..."
              className={`${clasesInput} resize-y`}
            />
          </label>

          <label className="mt-3 block text-[0.88rem] font-semibold text-slate-900">
            Nombre del responsable
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
              <p className="mt-1 text-xs font-medium text-red-600">{errores.responsable}</p>
            )}
          </label>

          <label className="mt-3.5 flex cursor-pointer items-center gap-2.5 rounded-[10px] border-[1.5px] border-dashed border-blue-600 bg-blue-50 px-3 py-3 font-medium text-slate-800 transition hover:bg-blue-100">
            <input
              type="checkbox"
              name="foto_enviada"
              checked={form.foto_enviada}
              onChange={handleChange}
              className="h-5 w-5 accent-blue-600"
            />
            <span>
              📸 Foto enviada a{' '}
              <strong className="font-bold text-slate-900">{PHOTO_EMAIL}</strong>
            </span>
          </label>
        </fieldset>

        {/* ============ Acciones ============ */}
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={handleLimpiar}
            className="flex-1 rounded-[10px] bg-slate-100 px-4 py-3.5 text-base font-bold text-slate-900 transition hover:bg-slate-200"
          >
            Limpiar
          </button>
          <button
            type="submit"
            disabled={guardando || estadoCorrelativo !== 'listo'}
            className="flex-1 rounded-[10px] bg-blue-600 px-4 py-3.5 text-base font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar registro'}
          </button>
        </div>
      </div>
    </form>
  )
}