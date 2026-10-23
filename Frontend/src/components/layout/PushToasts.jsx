import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { getPushSince } from '../../services/notificationApi'

const POLL_MS = 20_000

/**
 * In-app toasts styled like an OS notification: every 20 seconds, new push notifications for the
 * signed-in user (stock-outs, waiting list ready, ...) are fetched and shown for a few seconds.
 */
export function PushToasts() {
  const { user } = useAuth()
  const since = useRef(Date.now())
  const shown = useRef(new Set())
  const [items, setItems] = useState([])
  const navigate = useNavigate()
  const signedIn = !!user

  useEffect(() => {
    if (!signedIn) return undefined
    let alive = true
    const check = async () => {
      try {
        const asked = Date.now()
        const fresh = (await getPushSince(since.current)).filter((n) => !shown.current.has(n.id))
        if (!alive) return
        since.current = asked
        if (!fresh.length) return
        fresh.forEach((n) => shown.current.add(n.id))
        setItems((cur) => [...fresh, ...cur].slice(0, 3))
        fresh.forEach((n) => setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== n.id)), 7000))
      } catch {
        /* offline or signed out: try again next time */
      }
    }
    const id = setInterval(check, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [signedIn])

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
