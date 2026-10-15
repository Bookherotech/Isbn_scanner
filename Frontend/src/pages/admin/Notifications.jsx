import { BellRing, Repeat, Smartphone } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { NotificationFeed } from '../../components/notifications/NotificationFeed'
import { PageHeader, Panel } from '../../components/ui/Misc'

export default function AdminNotifications() {
  const { user } = useAuth()
  return (
    <div>
      <PageHeader title="Notifications" description="Stock-outs, waiting-list readiness, new submissions and Shopify sync issues." />
      <div className="notif-layout">
        <Panel flush className="notif-layout__feed">
          <div style={{ padding: '14px 16px 16px' }}>
            <NotificationFeed user={user} variant="admin" />
          </div>
        </Panel>
        <aside className="notif-rules">
          <h2 className="eyebrow">Push rule (Release 1)</h2>
          <ol className="rule-steps">
            <li>
              <BellRing size={16} aria-hidden />
              <span>
                <strong>Push #1</strong> to all admin and staff when the stock check finds a book at 0.
              </span>
            </li>
            <li>
              <Repeat size={16} aria-hidden />
              <span>
                <strong>Re-check after 24 h.</strong> If still out of stock and not approved, send <strong>push #2</strong>. Maximum two per stock-out.
              </span>
            </li>
            <li>
              <Smartphone size={16} aria-hidden />
              <span>Browser push via the PWA. iPhone requires “Add to Home Screen”. This list is the in-app fallback.</span>
            </li>
          </ol>
          <p className="muted notif-rules__mock">Push delivery is simulated in this demo.</p>
        </aside>
      </div>
    </div>
  )
}
