import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useStoreVersion } from '../../hooks/useStore'
import { selectors } from '../../services/mockApi'

/**
 * Simulated browser push — styled like an OS notification so the client sees
 * what Admin and Staff receive when stock runs out (Section 04 push rule).
 */
export function PushToasts() {
  const { user } = useAuth()
  const version = useStoreVersion()
  const since = useRef(selectors.clock())
  const shown = useRef(new Set())
  const [items, setItems] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    const fresh = selectors.latestPush(user, since.current).filter((n) => !shown.current.has(n.id))
    if (!fresh.length) return
    fresh.forEach((n) => shown.current.add(n.id))
    setItems((cur) => [...fresh.reverse(), ...cur].slice(0, 3))
    fresh.forEach((n) => setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== n.id)), 7000))
  }, [version, user])

  if (!items.length) return null
  const target = user.role === 'admin' ? '/admin/notifications' : '/staff/notifications'
  return (
    <div className="push-region" aria-live="polite">
      {items.map((n) => (
        <div key={n.id} className="push">
          <button className="push__body" onClick={() => navigate(n.type === 'waiting_ready' && user.role === 'admin' ? '/admin/waiting-list' : target)}>
            <img src="/logo.webp" alt="" width={34} height={34} />
            <span>
              <span className="push__app">
                BookHero <em>· now</em>
              </span>
              <strong>{n.title}</strong>
              <span className="push__text">{n.body}</span>
            </span>
          </button>
          <button className="push__close" onClick={() => setItems((cur) => cur.filter((x) => x.id !== n.id))} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
