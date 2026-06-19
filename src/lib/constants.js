// Bodegas donde se realiza el levantamiento de inventario.
export const BODEGAS = ['Antillanca', 'Cordillera', 'Renca']

// Estados operacionales posibles para un equipo.
export const ESTADOS = ['Operativo', 'Operativo con observaciones', 'Inoperativo']

// Tipos de equipo (maquinaria) disponibles en el inventario.
export const TIPOS_EQUIPO = [
  'Apilador retract',
  'Apilador pedestre',
  'Grúa horquilla eléctrica',
  'Grúa horquilla a gas',
  'Traspaleta eléctrica',
  'Order picker',
  'Carro remolque',
  'Alza hombre unipersonal',
  'Apilador retractil multidireccional',
  'Recoge pedidos horizontal',
]

// Marcas de equipos que manejamos. Si el equipo no está en la lista,
// el operador elige "Otra" y tipea la marca a mano.
export const MARCAS = ['Hyster', 'Jungheinrich', 'Yale']

// Valor centinela usado en el `value` del <select> cuando el operador
// eligió "Otra" y va a tipear la marca manualmente. NO se guarda en la
// DB: al enviar se reemplaza por el texto tipeado.
export const MARCA_OTRA = '__otra__'

// Motivos posibles para un movimiento de equipo (cambio de bodega,
// arriendo, mantención, etc.).
export const MOTIVOS_MOVIMIENTO = [
  'Cambio de bodega',
  'En arriendo a cliente',
  'Devuelto de arriendo',
  'Mantención externa',
  'Otro',
]

// Etiqueta corta para mostrar en chips/badges.
export const ESTADO_CHIP = {
  Operativo: 'Operativo',
  'Operativo con observaciones': 'Op. c/ obs.',
  Inoperativo: 'Inoperativo',
}

// Elementos faltantes predefinidos (checkboxes en el formulario).
// Se almacenan como texto separado por comas en el campo elementos_faltantes.
export const ELEMENTOS_FALTANTES = [
  'Cabina',
  'Batería',
  'Baliza',
  'Extintor',
  'Asiento',
  'Neumáticos',
  'Espejos',
  'Documentación',
  'Otros',
]

// Email al que se envían las fotos (referencia visual en el formulario).
export const PHOTO_EMAIL = 'salinascompliance@gmail.com'

// Tabs de la aplicación.
export const TABS = [
  { id: 'form', label: '📝 Registrar' },
  { id: 'list', label: '📋 Inventario' },
  { id: 'trash', label: '🗑️ Papelera' },
  { id: 'export', label: '⬇️ Exportar' },
]

// Mapeo de campos de la base de datos a headers en español para Excel.
export const EXCEL_HEADERS = {
  correlativo: 'Correlativo',
  bodega: 'Bodega',
  tipo_equipo: 'Tipo de Equipo',
  numero_interno: 'N° Interno',
  numero_serie: 'N° Serie',
  marca: 'Marca',
  modelo: 'Modelo',
  ubicacion_actual: 'Ubicación',
  estado_operacional: 'Estado',
  horometro: 'Horómetro',
  elementos_faltantes: 'Elementos Faltantes',
  observaciones: 'Observaciones',
  responsable: 'Responsable',
  foto_enviada: 'Foto Enviada',
  created_at: 'Fecha Registro',
}

// Orden de columnas en el Excel (correlativo primero).
export const EXCEL_COLUMN_ORDER = [
  'correlativo',
  'bodega',
  'tipo_equipo',
  'numero_interno',
  'numero_serie',
  'marca',
  'modelo',
  'ubicacion_actual',
  'estado_operacional',
  'horometro',
  'elementos_faltantes',
  'observaciones',
  'responsable',
  'foto_enviada',
  'created_at',
]