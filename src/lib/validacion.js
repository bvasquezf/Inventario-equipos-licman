import { BODEGAS, ESTADOS } from './constants'

// Campos requeridos para registrar un equipo.
const CAMPOS_REQUERIDOS = [
  'bodega',
  'numero_interno',
  'numero_serie',
  'marca',
  'modelo',
  'estado_operacional',
  'responsable',
]

/**
 * Valida un objeto `equipo` y devuelve `{ ok, errores }`.
 * `errores` es un objeto { campo: mensaje }.
 */
export function validarEquipo(data) {
  const errores = {}

  for (const campo of CAMPOS_REQUERIDOS) {
    const valor = data[campo]
    if (valor === undefined || valor === null || String(valor).trim() === '') {
      errores[campo] = 'Este campo es obligatorio'
    }
  }

  if (data.bodega && !BODEGAS.includes(data.bodega)) {
    errores.bodega = 'Bodega no válida'
  }

  if (data.estado_operacional && !ESTADOS.includes(data.estado_operacional)) {
    errores.estado_operacional = 'Estado no válido'
  }

  if (data.horometro !== '' && data.horometro !== null && data.horometro !== undefined) {
    const num = Number(data.horometro)
    if (Number.isNaN(num) || num < 0) {
      errores.horometro = 'Debe ser un número mayor o igual a 0'
    }
  }

  return { ok: Object.keys(errores).length === 0, errores }
}

// Estado inicial del formulario (todos los campos vacíos).
export const equipoVacio = {
  bodega: '',
  numero_interno: '',
  numero_serie: '',
  marca: '',
  modelo: '',
  ubicacion_actual: '',
  estado_operacional: '',
  horometro: '',
  elementos_faltantes: '',
  observaciones: '',
  responsable: '',
  foto_enviada: false,
}