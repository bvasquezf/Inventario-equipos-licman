import { BODEGAS, TABS } from '../lib/constants'
import NetworkIndicator from './NetworkIndicator'

/**
 * Topbar + tabs sticky.
 * Props:
 *  - bodega, onBodegaChange
 *  - tabActiva, onTabChange
 *  - conteo: { todas, Antillanca, Cordillera, Renca }
 *  - papeleraCount: número de equipos en la papelera (para badge en tab)
 */
export default function Header({
  bodega,
  onBodegaChange,
  tabActiva,
  onTabChange,
  conteo,
  papeleraCount = 0,
}) {
  const stats = [
    { key: 'todas', label: 'Total' },
    { key: 'Antillanca', label: 'Antillanca' },
    { key: 'Cordillera', label: 'Cordillera' },
    { key: 'Renca', label: 'Renca' },
  ]

  return (
    <>
      <header
        className="sticky top-0 z-30 bg-slate-900 text-white shadow-lg"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <div
              className="grid h-10 w-10 place-items-center rounded-[10px] text-sm font-extrabold text-white shadow-md sm:h-11 sm:w-11"
              style={{
                background: 'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)',
              }}
            >
              IL
            </div>
            <div>
              <h1 className="text-[1.05rem] font-bold leading-tight tracking-tight sm:text-[1.15rem]">
                Inventario Licman
              </h1>
              <p className="text-[0.72rem] text-slate-400 sm:text-[0.78rem]">
                Levantamiento en terreno · 3 bodegas
              </p>
            </div>
          </div>

          {/* Stats badges (desktop) */}
          <div className="hidden gap-2 sm:flex sm:items-center">
            <NetworkIndicator />
            {stats.map((s) => (
              <div
                key={s.key}
                className="flex min-w-[64px] flex-col items-center rounded-[10px] border border-white/10 bg-white/[0.06] px-3 py-1.5"
              >
                <span className="text-base font-extrabold leading-none">
                  {conteo?.[s.key] ?? 0}
                </span>
                <span className="mt-0.5 text-[0.62rem] uppercase tracking-wider text-slate-400">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Indicador de red en móvil */}
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-2 sm:hidden">
          <NetworkIndicator />
        </div>

        {/* Stats badges (móvil: segunda fila compacta) */}
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3 sm:hidden">
          {stats.map((s) => (
            <div
              key={s.key}
              className="flex min-w-[56px] shrink-0 flex-col items-center rounded-[10px] border border-white/10 bg-white/[0.06] px-2.5 py-1"
            >
              <span className="text-sm font-extrabold leading-none">
                {conteo?.[s.key] ?? 0}
              </span>
              <span className="mt-0.5 text-[0.58rem] uppercase tracking-wider text-slate-400">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </header>

      {/* Tabs sticky debajo del topbar */}
      <nav
        role="tablist"
        aria-label="Vistas principales"
        className="sticky top-[64px] z-20 flex gap-1 overflow-x-auto bg-slate-100/80 px-3 pt-2.5 backdrop-blur sm:top-[76px] sm:px-4 sm:pt-2.5"
        style={{ scrollbarWidth: 'none' }}
      >
        {TABS.map((t) => {
          const activo = t.id === tabActiva
          const esPapelera = t.id === 'trash'
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={activo}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`shrink-0 rounded-t-[12px] border border-b-0 px-3.5 py-2 text-sm font-semibold transition ${
                activo
                  ? 'border-slate-200 bg-white text-blue-600 shadow-[inset_0_-2px_0_0_theme(colors.blue.600)]'
                  : 'border-transparent bg-white/60 text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              {t.label}
              {esPapelera && papeleraCount > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0 text-[0.65rem] tabular-nums ${
                    activo
                      ? 'bg-red-100 text-red-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {papeleraCount}
                </span>
              )}
            </button>
          )
        })}

        {/* Bodega selector a la derecha de las tabs en desktop */}
        <div className="ml-auto hidden items-center pr-2 sm:flex">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span>Bodega:</span>
            <select
              value={bodega}
              onChange={(e) => onBodegaChange(e.target.value)}
              className="rounded-[10px] border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="todas">Todas</option>
              {BODEGAS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        </div>
      </nav>

      {/* Bodega selector en móvil */}
      <div className="mx-auto flex max-w-6xl items-center gap-2 bg-white px-4 py-2 sm:hidden">
        <label className="flex flex-1 items-center gap-2 text-xs font-semibold text-slate-600">
          <span>Bodega:</span>
          <select
            value={bodega}
            onChange={(e) => onBodegaChange(e.target.value)}
            className="flex-1 rounded-[10px] border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            <option value="todas">Todas</option>
            {BODEGAS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  )
}