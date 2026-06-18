import { createContext, useCallback, useContext, useRef, useState } from 'react'
import ToastContainer from '../components/ToastContainer'

const ToastContext = createContext(null)

const AUTO_DISMISS_MS = 3500

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // Ref para asignar IDs incrementales sin que se dupliquen entre re-renders.
  const idRef = useRef(0)

  const cerrar = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const mostrar = useCallback(
    (mensaje, tipo = 'info', duracion = AUTO_DISMISS_MS) => {
      const id = ++idRef.current
      setToasts((prev) => [...prev, { id, mensaje, tipo }])
      if (duracion > 0) {
        setTimeout(() => cerrar(id), duracion)
      }
      return id
    },
    [cerrar],
  )

  const api = {
    success: (msg, duracion) => mostrar(msg, 'success', duracion),
    error: (msg, duracion) => mostrar(msg, 'error', duracion ?? 6000),
    info: (msg, duracion) => mostrar(msg, 'info', duracion),
    cerrar,
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} onCerrar={cerrar} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>')
  }
  return ctx
}