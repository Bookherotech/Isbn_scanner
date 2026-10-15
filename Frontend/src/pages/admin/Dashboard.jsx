import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, BellRing, Clock3, Flag, RefreshCw, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react'
import { getDashboard, retrySync } from '../../services/mockApi'
import { useAuth } from '../../hooks/useAuth'
import { useQuery, useTicker } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { Panel, PageHeader, Avatar } from '../../components/ui/Misc'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { ShelfTag } from '../../components/ui/Status'
import { DayBars, ShelfBars, StatusBar } from '../../components/charts/Charts'
import { BookCover } from '../../components/books/BookCover'
import { ActivityRow } from '../../components/dashboard/ActivityRow'
import { ShopifyCard } from '../../components/inventory/Shopify'
import { firstName, fmtNum, greeting, longDate, plural, timeAgo } from '../../utils/format'

export default function Dashboard() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useQuery(() => getDashboard(), [])
  useTicker()

  if (error) return <ErrorState error={error} onRetry={reload} />

  return (
    <div className="dash">
      <PageHeader
        eyebrow={data ? longDate(data.now) : ' '}
        title={`${greeting()}, ${firstName(user.name)}`}
        description={data ? attentionLine(data) : 'Loading today’s overview…'}
        actions={
          <Button variant="primary" to="/admin/pending" iconRight={ArrowRight}>
            Review pending{data ? ` (${data.kpis.pending})` : ''}
          </Button>
        }
      />

      <Kpis data={data} loading={loading} />

      <div className="dash__grid">
        <Panel title="Needs attention" className="dash__attention" action={data && <span className="muted dash__meta">{plural(attentionCount(data), 'item')}</span>}>
          {loading ? <ListSkeleton /> : <Attention data={data} />}
        </Panel>

        <Panel title="Inventory status" className="dash__status" action={<Link to="/admin/live" className="panel__link">Live inventory <ArrowUpRight size={14} /></Link>}>
          {loading ? <Skeleton h={180} r={6} /> : <StatusBar items={data.status} />}
        </Panel>

        <Panel title="Books added" eyebrow="Last 7 days" className="dash__added" action={data && <TrendNote data={data} />}>
          {loading ? <Skeleton h={180} r={6} /> : <DayBars data={data.added7} caption="Books submitted per day, last 7 days" />}
        </Panel>

        <Panel title="Shelf distribution" eyebrow={data ? `Top 8 of ${data.shelfCount} active shelves · units on Shopify` : ' '} className="dash__shelves" action={<Link to="/admin/shelves" className="panel__link">Shelves <ArrowUpRight size={14} /></Link>}>
          {loading ? <Skeleton h={190} r={6} /> : <ShelfBars shelves={data.shelves} />}
        </Panel>

        <Panel title="Recent activity" className="dash__activity" action={<Link to="/admin/activity" className="panel__link">Activity log <ArrowUpRight size={14} /></Link>}>
          {loading ? (
            <ListSkeleton rows={6} />
          ) : data.activity.length ? (
            <ul className="act-list">
              {data.activity.map((a) => (
                <ActivityRow key={a.id} a={a} compact />
              ))}
            </ul>
          ) : (
            <EmptyState art="activity" title="No activity yet" compact />
          )}
        </Panel>

        <div className="dash__side">
          <ShopifyCard shopify={data?.shopify} loading={loading} />
          <Panel title="Staff today" className="dash__staff">
            {loading ? (
              <ListSkeleton rows={4} />
            ) : (
              <ul className="staff-today">
                {data.staffToday.map((s) => (
                  <li key={s.id}>
                    <Avatar name={s.name} hue={s.hue} size={26} />
                    <span className="staff-today__name">{s.name}</span>
                    <span className="staff-today__bar" aria-hidden>
                      <span style={{ width: `${Math.min(100, (s.submitted / Math.max(1, data.staffToday[0].submitted)) * 100)}%` }} />
                    </span>
                    <span className="num staff-today__n">{s.submitted}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function attentionCount(d) {
  return d.attention.ready.length + d.attention.failed.length + d.attention.oldestPending.length + d.attention.flagged.length
}

function attentionLine(d) {
  const parts = []
  if (d.kpis.ready) parts.push(`${plural(d.kpis.ready, 'waiting-list entry', 'waiting-list entries')} ready for approval`)
  if (d.kpis.pending) parts.push(`${d.kpis.pending} books pending review`)
  if (d.kpis.outOfStock) parts.push(`${d.kpis.outOfStock} out of stock`)
  return parts.length ? `${parts.join(' · ')}.` : 'Everything is up to date.'
}

function TrendNote({ data }) {
  const diff = data.kpis.addedToday - data.kpis.addedYesterday
  const Icon = diff >= 0 ? TrendingUp : TrendingDown
  return (
    <span className={`trend ${diff >= 0 ? 'trend--up' : 'trend--down'}`}>
      <Icon size={14} aria-hidden />
      {diff >= 0 ? '+' : ''}
      {diff} vs yesterday
    </span>
  )
}

function Kpis({ data, loading }) {
  const k = data?.kpis
  const cells = [
    { label: 'Pending review', value: k?.pending, sub: k && 'Awaiting your decision', to: '/admin/pending' },
    {
      label: 'Waiting list',
      value: k?.waiting,
      sub: k && (k.ready ? <span className="kpi-ready"><BellRing size={12} aria-hidden /> {k.ready} ready for approval</span> : 'Behind current stock'),
      to: '/admin/waiting-list',
      tone: k?.ready ? 'hero' : null,
    },
    { label: 'Live on Shopify', value: k && fmtNum(k.liveTitles), sub: k && `${fmtNum(k.liveUnits)} units in stock`, to: '/admin/live' },
    { label: 'Out of stock', value: k?.outOfStock, sub: k && 'Detected by stock check', to: '/admin/waiting-list?tab=stock', tone: k?.outOfStock ? 'warn' : null },
    { label: 'Added today', value: k?.addedToday, sub: k && `${k.approvedToday} approved today`, to: '/admin/reports' },
  ]
  return (
    <section className="kpis" aria-label="Key metrics">
      {cells.map((c) => (
        <Link key={c.label} to={c.to} className={`kpis__cell${c.tone ? ` kpis__cell--${c.tone}` : ''}`}>
          <span className="kpis__label">{c.label}</span>
          {loading ? <Skeleton w={56} h={30} /> : <span className="kpis__value num">{c.value}</span>}
          <span className="kpis__sub">{loading ? <Skeleton w={110} h={10} /> : c.sub}</span>
        </Link>
      ))}
    </section>
  )
}

function Attention({ data }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [retrying, setRetrying] = useState('')
  const { ready, failed, oldestPending, flagged } = data.attention
  if (!ready.length && !failed.length && !oldestPending.length && !flagged.length) {
    return (
      <EmptyState art="check" title="Nothing needs attention" compact>
        No waiting-list approvals, sync failures or old pending books.
      </EmptyState>
    )
  }
  return (
    <ul className="attn">
      {ready.map((w) => (
        <li key={w.id} className="attn__item attn__item--ready">
          <BookCover title={w.title} author={w.author} isbn={w.isbn} size="xs" />
          <div className="attn__text">
            <strong>{w.title}</strong>
            <span>
              <ShelfTag id={w.linked.shelfId} size="sm" variant="muted" /> sold out · entry on <ShelfTag id={w.shelfId} size="sm" variant="outline" /> ready
            </span>
          </div>
          <Button size="sm" variant="primary" onClick={() => navigate(`/admin/waiting-list?review=${w.id}`)}>
            Review &amp; approve
          </Button>
        </li>
      ))}
      {flagged.map((f) => (
        <li key={f.id} className="attn__item">
          <span className="attn__icon attn__icon--flag">
            <Flag size={15} aria-hidden />
          </span>
          <div className="attn__text">
            <strong>{f.title}</strong>
            <span>Flagged · {f.flags.filter((x) => x.mode === 'hold').map((x) => x.name).join(', ')}</span>
          </div>
          <Button size="sm" onClick={() => navigate(f.status === 'pending' ? `/admin/pending/${f.id}` : '/admin/flags')}>
            Review flag
          </Button>
        </li>
      ))}
      {failed.map((f) => (
        <li key={f.id} className="attn__item attn__item--error">
          <span className="attn__icon attn__icon--error">
            <TriangleAlert size={15} aria-hidden />
          </span>
          <div className="attn__text">
            <strong>{f.title}</strong>
            <span>Shopify sync failed {timeAgo(f.lastSync)} · rate limited</span>
          </div>
          <Button
            size="sm"
            icon={RefreshCw}
            loading={retrying === f.id}
            onClick={async () => {
              setRetrying(f.id)
              await retrySync(f.id)
              setRetrying('')
              toast({ title: 'Sync retried', description: `${f.title} is synced with Shopify.` })
            }}
          >
            Retry sync
          </Button>
        </li>
      ))}
      {oldestPending.map((p) => (
        <li key={p.id} className="attn__item">
          <span className="attn__icon">
            <Clock3 size={15} aria-hidden />
          </span>
          <div className="attn__text">
            <strong>{p.title}</strong>
            <span>
              Pending {timeAgo(p.submittedAt)} · submitted by {firstName(p.submittedByName)}
            </span>
          </div>
          <Button size="sm" onClick={() => navigate(`/admin/pending/${p.id}`)}>
            Review
          </Button>
        </li>
      ))}
    </ul>
  )
}

function ListSkeleton({ rows = 4 }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Skeleton w={28} h={28} r={14} />
          <div style={{ flex: 1, display: 'grid', gap: 5 }}>
            <Skeleton w={`${60 - i * 6}%`} h={10} />
            <Skeleton w={`${40 - i * 4}%`} h={9} />
          </div>
        </div>
      ))}
    </div>
  )
}
