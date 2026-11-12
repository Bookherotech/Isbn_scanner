import { useAuth } from '../../hooks/useAuth'
import { NotificationFeed } from '../../components/notifications/NotificationFeed'
import { PageHeader } from '../../components/ui/Misc'

export default function AdminNotifications() {
  const { user } = useAuth()
  return (
    <div>
      <PageHeader title="Notifications" description="Stock-outs, waiting-list readiness, new submissions and Shopify sync issues." />
      <NotificationFeed user={user} variant="admin" />
    </div>
  )
}
