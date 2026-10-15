import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../utils/format'

function useOverlay(open, onClose, panelRef) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current?.()
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector('[data-autofocus]') || panelRef.current
      target?.focus({ preventScroll: true })
    })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      prev?.focus?.({ preventScroll: true })
    }
  }, [open, panelRef])
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md', className }) {
  const ref = useRef(null)
  const titleId = useId()
  useOverlay(open, onClose, ref)
  if (!open) return null
  return createPortal(
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={cn('modal', `modal--${size}`, className)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="modal__head">
          <div>
            <h2 id={titleId} className="modal__title">
              {title}
            </h2>
            {description && <p className="modal__desc">{description}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

/** Right-side panel on desktop, bottom sheet on phones. */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = 520, className }) {
  const ref = useRef(null)
  const titleId = useId()
  useOverlay(open, onClose, ref)
  if (!open) return null
  return createPortal(
    <div className="overlay overlay--drawer" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside ref={ref} className={cn('drawer', className)} style={{ '--drawer-w': `${width}px` }} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="drawer__head">
          <div>
            <h2 id={titleId} className="drawer__title">
              {title}
            </h2>
            {subtitle && <p className="drawer__sub">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close panel">
            <X size={18} />
          </button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer && <footer className="drawer__foot">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  )
}
