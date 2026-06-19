import * as XLSX from 'xlsx'
import { EXCEL_HEADERS, EXCEL_COLUMN_ORDER } from './constants'

// Anchos sugeridos por columna (caracteres). Hoja "Inventario".
const COLUMN_WIDTHS = {
  correlativo: 12,
  bodega: 14,
  numero_interno: 14,
  numero_serie: 18,
  marca: 14,
  modelo: 16,
  ubicacion_actual: 20,
  estado_operacional: 18,
  horometro: 12,
  elementos_faltantes: 28,
  observaciones: 32,
  responsable: 18,
  foto_enviada: 12,
  created_at: 22,
}

function formatearFila(equipo) {
  return EXCEL_COLUMN_ORDER.map((campo) => {
    const valor = equipo[campo]
    if (campo === 'foto_enviada') {
      return valor ? 'Sí' : 'No'
    }
    if (campo === 'correlativo') {
      return valor ?? ''
    }
    if (campo === 'created_at' && valor) {
      // Mantener formato ISO; Excel lo interpreta automáticamente.
      return valor
    }
    if (campo === 'horometro') {
      return valor === null || valor === undefined || valor === '' ? '' : Number(valor)
    }
    if (campo === 'elementos_faltantes') {
      // jsonb array → string CSV para que se vea legible en Excel.
      if (Array.isArray(valor)) return valor.join(', ')
      return valor ?? ''
    }
    return valor ?? ''
  })
}

function formatearFechaHoy() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function sanitizarNombre(nombre) {
  // Quitar tildes y caracteres no válidos para nombre de archivo.
  return nombre
    .normalize('NFD')
    .replace(/[̀-̃̅-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

/**
 * Genera un archivo XLSX y dispara la descarga.
 *
 * @param {Array<object>} equipos - registros a exportar
 * @param {{ bodega?: string }} opciones - si `bodega` viene, el archivo se llama
 *   inventario-licman-{bodega}-{YYYY-MM-DD}.xlsx; si no, inventario-licman-completo-{YYYY-MM-DD}.xlsx
 */
export function exportarAExcel(equipos, opciones = {}) {
  const { bodega } = opciones

  const headers = EXCEL_COLUMN_ORDER.map((campo) => EXCEL_HEADERS[campo])
  const filas = equipos.map(formatearFila)

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...filas])

  // Anchos de columna.
  worksheet['!cols'] = EXCEL_COLUMN_ORDER.map((campo) => ({
    wch: COLUMN_WIDTHS[campo] ?? 14,
  }))

  // Congelar la primera fila (header).
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario')

  const segmento = bodega ? sanitizarNombre(bodega) : 'completo'
  const filename = `inventario-licman-${segmento}-${formatearFechaHoy()}.xlsx`

  XLSX.writeFile(workbook, filename)
  return filename
}