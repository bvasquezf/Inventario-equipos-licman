import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BODEGAS,
  ESTADOS,
  ELEMENTOS_FALTANTES,
  TIPOS_EQUIPO,
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
  tipo_equipo: '',
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
 * Al montarse consulta el PREVIEW del próximo correlativo vía la RPC
 * `preview_next_correlativo` (solo visual, sin lock).
 * El número REAL se asigna al guardar dentro de la RPC `insert_equipo`,
 * que toma un advisory lock, busca el MENOR correlativo libre y
 * inserta la fila en una sola transacción. Esto:
 *   - Llena automáticamente los huecos de la numeración.
 *   - Garantiza atomicidad con inserts concurrentes.
 *   - Mantiene la consistencia incluso con deletes.
 * La bodega NO se selecciona en el form: viene de la prop `bodega`,
 * que es la seleccionada en el header (una sola vez por sesión).
 * Props:
 *  - bodega: string  → 'Antillanca' | 'Cordillera' | 'Renca' | '' | 'todas'
 *  - onGuardar(equipo): async  → devuelve la fila insertada con el
 *                                correlativo real asignado por la DB
 */
export default function FormView({ bodega = '', equipos = [], onGuardar }) {
  const toast = useToast()
  const refs = useRef({})

  // La bodega viene del header (fuera de este componente).
  // Solo es "válida" si es una de las 3 bodegas reales (no 'todas', no '').
  const bodegaValida = bodega && bodega !== 'todas' && BODEGAS.includes(bodega)

  const [form, setForm] = useState(() => ({
    ...estadoInicial,
    bodega: bodegaValida ? bodega : '',
  }))
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [estadoCorrelativo, setEstadoCorrelativo] = useState('cargando') // 'cargando' | 'listo' | 'error'

  // Set de N° internos ya registrados POR BODEGA (excluyendo papelera).
  // Sirve para avisar en vivo al tipear el N° interno: si ya existe
  // en la bodega actual, marcamos el input en rojo. No bloqueamos el
  // submit porque puede haber casos legítimos (p.ej. dos apiladores
  // con mismo número por error de rotulación), pero alertamos para
  // que el operador confirme.
  const numeroInternoTomado = useMemo(() => {
    const set = new Set()
    for (const e of equipos) {
      if (e.deleted_at) continue
      if (e.numero_interno && e.bodega) {
        set.add(`${e.bodega}|${e.numero_interno}`)
      }
    }
    return set
  }, [equipos])

  const duplicadoDetectado = useMemo(() => {
    const ni = form.numero_interno.trim()
    if (!ni || !bodegaValida) return null
    const key = `${bodega}|${ni}`
    return numeroInternoTomado.has(key)
      ? { key, ni, bodega }
      : null
  }, [form.numero_interno, bodega, bodegaValida, numeroInternoTomado])

  // Sincronizar form.bodega con la prop `bodega` cada vez que el
  // usuario cambia la selección en el header. Así el form siempre
  // registra en la bodega del contexto actual.
  useEffect(() => {
    setForm((prev) => ({ ...prev, bodega: bodegaValida ? bodega : '' }))
  }, [bodega, bodegaValida])

  // ------------------------------------------------------------------
  // Preview del próximo correlativo: la RPC `preview_next_correlativo`
  // devuelve el MENOR número libre en la tabla. Es solo una pista
  // visual; el número REAL se asigna al guardar vía `insert_equipo`,
  // que es atómico.
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelado = false
    const obtener = async () => {
      if (!supabase) {
        setEstadoCorrelativo('error')
        return
      }
      const { data, error } = await supabase.rpc('preview_next_correlativo')
      if (cancelado) return
      if (error) {
        console.error('Error al obtener preview:', error)
        setEstadoCorrelativo('error')
        toast.error('No se pudo cargar el preview del correlativo')
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

  /**
   * Limpia el formulario y vuelve a consultar el preview.
   * Después de un guardado, la tabla cambió: el menor correlativo
   * libre puede ser distinto del que mostrábamos antes (puede haber
   * rellenado un hueco), así que siempre re-consultamos a la DB.
   */
  const handleLimpiar = () => {
    // La bodega NO se resetea: viene del prop (header). Así el siguiente
    // registro se hace en la misma bodega sin tener que re-seleccionarla.
    setForm({
      ...estadoInicial,
      bodega: bodegaValida ? bodega : '',
    })
    setErrores({})
    setEstadoCorrelativo('cargando')
    if (supabase) {
      supabase.rpc('preview_next_correlativo').then(({ data, error }) => {
        if (error) {
          setEstadoCorrelativo('error')
          return
        }
        setForm((prev) => ({ ...prev, correlativo: data }))
        setEstadoCorrelativo('listo')
      })
    }
  }

  const reintentarPreview = async () => {
    setEstadoCorrelativo('cargando')
    if (!supabase) {
      setEstadoCorrelativo('error')
      return
    }
    const { data, error } = await supabase.rpc('preview_next_correlativo')
    if (error) {
      setEstadoCorrelativo('error')
      toast.error('No se pudo reintentar el preview del correlativo')
      return
    }
    setForm((prev) => ({ ...prev, correlativo: data }))
    setEstadoCorrelativo('listo')
  }

  /**
   * Re-consulta el preview en silencio cuando el usuario enfoca el primer
   * campo del formulario. Es útil porque el preview se carga UNA vez al
   * montar, pero la tabla puede haber cambiado (otros dispositivos
   * guardaron, vos guardaste antes, etc.) y el número mostrado puede
   * haber quedado desactualizado.
   */
  const handleFocusPreview = useCallback(async () => {
    if (estadoCorrelativo !== 'listo' || !supabase) return
    const { data, error } = await supabase.rpc('preview_next_correlativo')
    if (!error && data != null) {
      setForm((prev) => (prev.correlativo === data ? prev : { ...prev, correlativo: data }))
    }
  }, [estadoCorrelativo])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!bodegaValida) {
      toast.error('Selecciona una bodega en la barra superior antes de guardar')
      return
    }

    // El correlativo del preview NO se envía: la RPC lo asigna
    // atómicamente al hacer el insert. (Lo seteamos a undefined para
    // que JSON.stringify lo omita al serializar el payload.)
    const payload = {
      ...form,
      correlativo: undefined,
      // elementos_faltantes es jsonb en la DB → enviamos el array directo.
      elementos_faltantes: form.elementos_faltantes ?? [],
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
      // La RPC devuelve la fila con el correlativo REAL (el menor libre
      // que se asignó). El toast confirma ese número.
      const resultado = await onGuardar(payload)
      const correlativoReal = resultado?.correlativo ?? form.correlativo
      toast.success(`Registro #${String(correlativoReal).padStart(4, '0')} guardado`)
      handleLimpiar()
    } catch (err) {
      console.error(err)
      toast.error(err?.message ?? 'Error al guardar el equipo')
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
      {/* ============ Contexto: bodega donde se está registrando ============ */}
      <div
        className={`flex items-center gap-3 rounded-[14px] border-2 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.10)] ${
          bodegaValida
            ? 'border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50'
            : 'border-amber-300 bg-amber-50'
        }`}
      >
        <span className="text-2xl">📍</span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[0.72rem] font-bold uppercase tracking-wider ${
              bodegaValida ? 'text-blue-700' : 'text-amber-700'
            }`}
          >
            {bodegaValida ? 'Registrando equipos en' : 'Bodega no seleccionada'}
          </p>
          <p
            className={`mt-0.5 text-base font-extrabold ${
              bodegaValida ? 'text-blue-900' : 'text-amber-900'
            }`}
          >
            {bodegaValida
              ? bodega
              : 'Selecciona una bodega en la barra superior'}
          </p>
        </div>
      </div>

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
            <div className="mt-0.5 flex items-center gap-1.5">
              <p className="text-[0.78rem] text-slate-600">
                Vista previa. El número real se asigna al guardar.
              </p>
              <button
                type="button"
                onClick={reintentarPreview}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                title="Actualizar preview del correlativo"
                aria-label="Actualizar preview del correlativo"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.433a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          )}
          {estadoCorrelativo === 'error' && (
            <p className="mt-1 text-sm text-red-700">
              No se pudo cargar el preview del correlativo.
              <button
                type="button"
                onClick={reintentarPreview}
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-[0.88rem] font-semibold text-slate-900">
              Número interno
              <input
                type="text"
                name="numero_interno"
                value={form.numero_interno}
                onChange={handleChange}
                onFocus={handleFocusPreview}
                ref={(el) => (refs.current.numero_interno = el)}
                placeholder="Ej. INT-0421"
                aria-invalid={Boolean(duplicadoDetectado)}
                className={`${clasesInput} ${
                  duplicadoDetectado
                    ? 'border-red-500 focus:border-red-600 focus:ring-red-600/15'
                    : ''
                }`}
              />
              {duplicadoDetectado && !errores.numero_interno && (
                <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-red-600">
                  <span aria-hidden>⚠</span>
                  <span>
                    Este N° interno ya está registrado en{' '}
                    <strong>{duplicadoDetectado.bodega}</strong>. Si es un
                    equipo distinto, revisá la numeración.
                  </span>
                </p>
              )}
              {errores.numero_interno && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  {errores.numero_interno}
                </p>
              )}
            </label>
            <label className="block text-[0.88rem] font-semibold text-slate-900">
              Tipo de equipo
              <select
                name="tipo_equipo"
                value={form.tipo_equipo}
                onChange={handleChange}
                ref={(el) => (refs.current.tipo_equipo = el)}
                className={clasesInput}
              >
                <option value="">— Selecciona un tipo —</option>
                {TIPOS_EQUIPO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {errores.tipo_equipo && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  {errores.tipo_equipo}
                </p>
              )}
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            disabled={guardando || !bodegaValida}
            className="flex-1 rounded-[10px] bg-blue-600 px-4 py-3.5 text-base font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar registro'}
          </button>
        </div>
      </div>
    </form>
  )
}