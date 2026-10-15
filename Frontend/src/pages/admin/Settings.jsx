import { Link } from 'react-router-dom'
import { BellRing, Clock4, FileSpreadsheet, Flag, MapPinned, Store, Tags, Webhook } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useSelector } from '../../hooks/useStore'
import { selectors } from '../../services/mockApi'
import { Avatar, PageHeader, Panel } from '../../components/ui/Misc'
import { ShopifyCard } from '../../components/inventory/Shopify'

const FUTURE = [
  { icon: FileSpreadsheet, title: 'CLZ & Shopify CSV import', text: 'Bulk import with field mapping and validation.' },
  { icon: Webhook, title: 'Shopify webhooks', text: 'Instant sale events instead of the 10-minute stock check.' },
  { icon: MapPinned, title: 'Automatic location switching', text: 'FIFO next-shelf promotion without admin approval.' },
  { icon: Tags, title: 'Price, condition, tags & category', text: 'Edited in BookHero instead of Shopify.' },
]

export default function Settings() {
  const { user } = useAuth()
  const shop = useSelector(() => selectors.shopify())
  return (
    <div>
      <PageHeader title="Settings" description="Profile, integrations and system behaviour for this release." />
      <div className="settings">
        <Panel title="Profile">
          <div className="settings__profile">
            <Avatar name={user.name} hue={user.hue} size={56} />
            <div>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
              <span className="state-pill is-on">{user.title}</span>
            </div>
          </div>
          <dl className="kv">
            <div>
              <dt>Username</dt>
              <dd className="mono">@{user.username}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>Admin — full access, approvals, masters</dd>
            </div>
          </dl>
        </Panel>

        <div id="shopify">
          <ShopifyCard shopify={shop} />
        </div>

        <Panel title="System behaviour" eyebrow="Release 1 · read-only in this demo">
          <ul className="sysrules">
            <li>
              <Clock4 size={17} aria-hidden />
              <div>
                <strong>Stock check every {shop.pollMinutes} minutes</strong>
                <span>Live books are polled from Shopify; a book at 0 becomes Out of stock and its waiting-list entry becomes Ready for approval.</span>
              </div>
            </li>
            <li>
              <BellRing size={17} aria-hidden />
              <div>
                <strong>Push to admin + staff, 24-hour reminder</strong>
                <span>Push #1 on stock-out; re-check after 24 hours and push #2 if still out of stock. Maximum two per stock-out.</span>
              </div>
            </li>
            <li>
              <Flag size={17} aria-hidden />
              <div>
                <strong>Content flags</strong>
                <span>
                  Admin-defined categories (e.g. LGBTQ+ themes) hold matching books for review or add a label. Never auto-rejects. <Link to="/admin/flags" className="linkbtn">Manage categories</Link>
                </span>
              </div>
            </li>
            <li>
              <Store size={17} aria-hidden />
              <div>
                <strong>Duplicate rule: normalized title + author</strong>
                <span>Same shelf → rejected on submit (even while pending). Different shelf → waiting list. ISBN is not the duplicate key.</span>
              </div>
            </li>
          </ul>
        </Panel>

        <Panel title="Future / coming later" eyebrow="Not part of Release 1" className="future">
          <p className="future__lead">Deferred in the project plan. Shown here only so the roadmap is visible — none of these are active in this release.</p>
          <ul className="future__list">
            {FUTURE.map((f) => (
              <li key={f.title}>
                <f.icon size={17} aria-hidden />
                <div>
                  <strong>{f.title}</strong>
                  <span>{f.text}</span>
                </div>
                <span className="future__tag">Later</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
