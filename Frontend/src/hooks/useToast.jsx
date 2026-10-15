import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'

const ToastContext = createContext(null)
const ICONS = { success: CheckCircle2, error: XCircle, warning: TriangleAlert, info: Info }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 180)
  }, [])

  const toast = useCallback(
    ({ title, description, tone = 'success', duration = 3800, action }) => {
      const id = ++seq.current
      setToasts((t) => [...t.slice(-3), { id, title, description, tone, action }])
      setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone] || Info
          return (
            <div key={t.id} className={`toast toast--${t.tone}${t.leaving ? ' is-leaving' : ''}`}>
              <Icon size={18} className="toast__icon" aria-hidden />
              <div className="toast__body">
                <strong>{t.title}</strong>
                {t.description && <span>{t.description}</span>}
              </div>
              {t.action && (
                <button className="toast__action" onClick={() => { t.action.onClick(); dismiss(t.id) }}>
                  {t.action.label}
                </button>
              )}
              <button className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
