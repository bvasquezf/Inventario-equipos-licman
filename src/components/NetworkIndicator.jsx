import { useNetwork } from '../context/NetworkContext'

/**
 * Pill visual que muestra el estado de conectividad y la cola de
 * sincronización. Se monta en el Header.
 *
 * - En línea, sin pendientes → verde "🟢 En línea"
 * - En línea, sincronizando → azul con spinner "Sincronizando N…"
 * - En línea, con pendientes → ámbar "🟠 N pendiente(s)"
 * - Sin conexión → rojo "🔴 Sin conexión · N pendiente(s)"
 */
export default function NetworkIndicator() {
  const { online, pending, sincronizando } = useNetwork()

  if (sincronizando) {
    return (
      <div
        role="status"
        className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-2.5 py-1 text-[0.72rem] font-bold text-blue-800"
      >
        <span
          aria-hidden
          className="inline-block h-2 w-2 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
        />
        Sincronizando…
      </div>
    )
  }

  if (!online) {
    return (
      <div
        role="status"
        className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-[0.72rem] font-bold text-red-800"
        title="Sin internet. Los cambios se guardan localmente y se sincronizan al reconectar."
      >
        <span aria-hidden>🔴</span>
        Sin conexión
        {pending > 0 && (
          <span className="rounded-full bg-red-200 px-1.5 text-[0.65rem] tabular-nums text-red-900">
            {pending}
          </span>
        )}
      </div>
    )
  }

  if (pending > 0) {
    return (
      <div
        role="status"
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[0.72rem] font-bold text-amber-800"
        title="Cambios pendientes de sincronizar"
      >
        <span aria-hidden>🟠</span>
        {pending} pendiente{pending === 1 ? '' : 's'}
      </div>
    )
  }

  return (
    <div
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full border border-green-300 bg-green-50 px-2.5 py-1 text-[0.72rem] font-bold text-green-800"
      title="En línea, todo sincronizado"
    >
      <span aria-hidden>🟢</span>
      En línea
    </div>
  )
}