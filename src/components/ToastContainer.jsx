const ESTILOS = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  info: 'bg-slate-900',
}

const ICONOS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

export default function ToastContainer({ toasts, onCerrar }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex max-w-[92vw] items-center gap-2.5 rounded-full px-5 py-3 text-sm font-bold tracking-wide text-white shadow-2xl ring-1 ring-black/10 ${ESTILOS[t.tipo] ?? ESTILOS.info}`}
        >
          <span className="text-base leading-none">{ICONOS[t.tipo] ?? '•'}</span>
          <p className="leading-tight">{t.mensaje}</p>
          <button
            type="button"
            onClick={() => onCerrar(t.id)}
            className="ml-1 text-white/70 transition hover:text-white"
            aria-label="Cerrar notificación"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}