# Inventario Licman

Sistema web para el levantamiento y gestión de inventario de equipos en las bodegas **Antillanca**, **Cordillera** y **Renca**. Permite registrar, buscar, filtrar, eliminar y exportar el inventario a Excel con sincronización en tiempo real entre usuarios.

## Stack

- **Frontend**: React 19 + Vite 8 + Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Exportación**: SheetJS (`xlsx`)
- **Deploy**: Netlify

## Estructura

```
src/
├── components/         # Header, ToastContainer, ConfirmDialog, EstadoBadge
├── views/              # FormView, ListView, ExportView
├── context/            # ToastContext
├── lib/                # supabase.js, validacion.js, export.js, constants.js
├── App.jsx             # Estado global, tabs, suscripción realtime
└── main.jsx            # Entry point con ToastProvider
supabase/
└── schema.sql          # DDL + RLS + realtime de la tabla equipos
```

## Setup local

1. **Instalar dependencias**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno**
   ```bash
   cp .env.example .env
   ```
   Edita `.env` con tus credenciales de Supabase (Dashboard → Settings → API):
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...
   ```

3. **Crear la tabla en Supabase**
   - Abre Supabase → SQL Editor
   - Pega el contenido de `supabase/schema.sql`
   - Ejecuta

4. **Levantar el servidor de desarrollo**
   ```bash
   npm run dev
   ```
   Abre [http://localhost:5173](http://localhost:5173).

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Build de producción |
| `npm run preview` | Servir el build localmente |
| `npm run lint` | Pasar ESLint |

## Funcionalidades

- **Registrar equipos** con validación de campos obligatorios
- **Visualizar inventario** con búsqueda multi-campo y filtro por bodega
- **Eliminar con confirmación**
- **Exportar a Excel** (.xlsx) con o sin filtro por bodega
- **Sincronización en tiempo real** vía Supabase Realtime (INSERT events)
- **Diseño responsive mobile-first** optimizado para Safari iOS

## Próximos pasos sugeridos

- Reemplazar la policy `anon_all_equipos` por políticas basadas en `auth.uid()` cuando se agregue autenticación
- Agregar paginación cuando el inventario supere ~500 registros
- Captura de fotos en el formulario (actualmente solo se marca si fue enviada)