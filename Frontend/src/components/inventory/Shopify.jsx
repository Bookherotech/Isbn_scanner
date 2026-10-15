import { useEffect, useState } from 'react'
import { Store } from 'lucide-react'
import { Panel } from '../ui/Misc'
import { Skeleton } from '../ui/Feedback'
import { formatTime, timeAgo } from '../../utils/format'
import { selectors } from '../../services/mockApi'

function useCountdown(lastPollAt, minutes) {
  const [now, setNow] = useState(() => selectors.clock())
  useEffect(() => {
    const id = setInterval(() => setNow(selectors.clock()), 1000)
    return () => clearInterval(id)
  }, [])
  const next = lastPollAt + minutes * 60_000
  const left = Math.max(0, next - now)
  const m = Math.floor(left / 60_000)
  const s = Math.floor((left % 60_000) / 1000)
  return { label: `${m}:${String(s).padStart(2, '0')}`, pct: 1 - left / (minutes * 60_000) }
}

/** Shopify connection status — clearly marked as a mock integration. */
export function ShopifyCard({ shopify, loading }) {
  return (
    <Panel className="shopcard" title={null}>
      {loading || !shopify ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <Skeleton w="60%" h={14} />
          <Skeleton h={60} r={6} />
        </div>
      ) : (
        <ShopifyBody shopify={shopify} />
      )}
    </Panel>
  )
}

function ShopifyBody({ shopify }) {
  const cd = useCountdown(shopify.lastPollAt, shopify.pollMinutes)
  return (
    <>
      <div className="shopcard__head">
        <span className="shopcard__logo">
          <Store size={18} aria-hidden />
        </span>
        <div>
          <strong>{shopify.storeName}</strong>
          <span className="mono">{shopify.domain}</span>
        </div>
        <span className="shopcard__mock">Demo / mock</span>
      </div>
      <dl className="shopcard__facts">
        <div>
          <dt>Connection</dt>
          <dd>
            <span className="live-dot" aria-hidden /> Connected
          </dd>
        </div>
        <div>
          <dt>Sync health</dt>
          <dd>{shopify.health === 'healthy' ? 'Healthy' : 'Degraded'}</dd>
        </div>
        <div>
          <dt>Last inventory sync</dt>
          <dd className="num">
            {formatTime(shopify.lastPollAt)} <span className="muted">· {timeAgo(shopify.lastPollAt)}</span>
          </dd>
        </div>
        <div>
          <dt>Stock check</dt>
          <dd>Every {shopify.pollMinutes} min</dd>
        </div>
      </dl>
      <div className="shopcard__poll">
        <span>Next stock check</span>
        <span className="shopcard__track" aria-hidden>
          <span style={{ transform: `scaleX(${cd.pct})` }} />
        </span>
        <span className="num">{cd.label}</span>
      </div>
      <p className="shopcard__note">Scheduled polling — no Shopify webhooks in this release.</p>
    </>
  )
}
