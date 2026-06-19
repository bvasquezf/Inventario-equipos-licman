// NetworkContext: expone online/offline + conteo de pendingWrites.
// Al reconectarse, dispara un flush automático de la cola offline.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { flushQueue, pendingCount } from '../lib/offlineQueue'
import { useToast } from './ToastContext'

const NetworkContext = createContext(null)

export function NetworkProvider({ children }) {
  const toast = useToast()
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [pending, setPending] = useState(0)
  const [sincronizando, setSincronizando] = useState(false)
  const flushingRef = useRef(false)

  // Refrescar el conteo de pending desde IndexedDB.
  const refrescarPending = useCallback(async () => {
    try {
      const c = await pendingCount()
      setPending(c)
    } catch {
      // ignore
    }
  }, [])

  // Flush con guard contra runs concurrentes.
  const flush = useCallback(async () => {
    if (flushingRef.current) return { flushed: 0, failed: 0, skipped: 0 }
    if (!navigator.onLine) return { flushed: 0, failed: 0, skipped: 0 }
    flushingRef.current = true
    setSincronizando(true)
    try {
      const result = await flushQueue()
      await refrescarPending()
      if (result.flushed > 0) {
        toast.success(
          result.failed > 0
            ? `Sincronizado: ${result.flushed} OK, ${result.failed} con error`
            : `Sincronizado: ${result.flushed} cambio${result.flushed === 1 ? '' : 's'} pendiente${result.flushed === 1 ? '' : 's'}`,
        )
      } else if (result.failed > 0) {
        toast.error(
          `No se pudieron sincronizar ${result.failed} cambio${result.failed === 1 ? '' : 's'}. Reintentaremos.`,
        )
      }
      return result
    } catch (err) {
      console.warn('[NetworkContext] flush falló:', err)
      return { flushed: 0, failed: 0, skipped: 0 }
    } finally {
      flushingRef.current = false
      setSincronizando(false)
    }
  }, [refrescarPending, toast])

  // Listeners online/offline.
  useEffect(() => {
    refrescarPending()
    const handleOnline = () => {
      setOnline(true)
      // Flush automático al reconectar.
      flush()
    }
    const handleOffline = () => {
      setOnline(false)
      toast.info('Sin conexión — los cambios se guardarán localmente.')
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [flush, refrescarPending, toast])

  const value = {
    online,
    pending,
    sincronizando,
    flush,
    refrescarPending,
  }

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
}

export function useNetwork() {
  const ctx = useContext(NetworkContext)
  if (!ctx) {
    throw new Error('useNetwork debe usarse dentro de <NetworkProvider>')
  }
  return ctx
}