import { useAuth } from '../../hooks/useAuth'
import { NotificationFeed } from '../../components/notifications/NotificationFeed'

export default function StaffNotifications() {
  const { user } = useAuth()
  return (
    <div className="s-page">
      <header className="s-pagehead">
        <h1>Alerts</h1>
        <p className="muted">Stock-outs and the results of your submissions.</p>
      </header>
      <NotificationFeed user={user} variant="staff" />
    </div>
  )
}
