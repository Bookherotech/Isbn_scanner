import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, CheckCircle2, CircleDashed, FlaskConical, PackageX, Radar, Store } from 'lucide-react'
import { getOutOfStock } from '../../services/mockApi'
import { useQuery, useTicker } from '../../hooks/useStore'
import { Button } from '../ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../ui/Feedback'
import { ShelfTag, StatusChip, SyncChip } from '../ui/Status'
import { BookCover } from '../books/BookCover'
import { openDemoPanel } from '../layout/DemoControls'
import { cn, formatDateTime, formatTime, timeAgo, clockNow } from '../../utils/format'

/** Out-of-stock master/detail — shown as the “Out of stock” tab of the Waiting list page. */
export function OutOfStockBoard() {
  const { data, loading, error, reload } = useQuery(() => getOutOfStock(), [])
  const [selected, setSelected] = useState(null)
  useTicker()
  const current = data?.find((d) => d.id === selected) || data?.[0]

  return (
    <div>
      <div className="oos-intro">
        <p>
          Detected by the scheduled stock check (every 10 minutes). Admin and staff get push #1 immediately and push #2 if the book is still out of stock 24 hours later. A
          ready waiting-list entry can be approved right here.
        </p>
        <button className="demo-link" onClick={openDemoPanel}>
          <FlaskConical size={14} aria-hidden /> Demo: simulate a stock-out
        </button>
      </div>
      {loading ? (
        <div className="oos">
          <div className="oos__list">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={74} r={8} />
            ))}
          </div>
          <Skeleton h={420} r={10} />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyState art="check" title="Nothing is out of stock">
          Every live book has stock on Shopify. When a book sells out, it appears here and the team is notified.
        </EmptyState>
      ) : (
        <div className="oos">
          <ul className="oos__list" aria-label="Out-of-stock books">
            {data.map((d) => (
              <li key={d.id}>
                <button className={cn('oos__item', current?.id === d.id && 'is-active')} onClick={() => setSelected(d.id)} aria-current={current?.id === d.id}>
                  <BookCover title={d.title} author={d.author} isbn={d.isbn} size="sm" />
                  <span className="oos__item-text">
                    <strong>{d.title}</strong>
                    <span>
                      <ShelfTag id={d.shelfId} size="sm" variant="muted" /> · {timeAgo(d.stockOutAt)}
                    </span>
                  </span>
                  {d.waitingEntries.length > 0 ? <StatusChip status="waiting" ready size="sm" label={`${d.waitingEntries.length} ready`} /> : <span className="oos__none">No waiting entry</span>}
                </button>
              </li>
            ))}
          </ul>
          {current && <OosDetail d={current} />}
        </div>
      )}
    </div>
  )
}

function OosDetail({ d }) {
  const navigate = useNavigate()
  const now = clockNow()
  const reminder = d.push2At ? 'sent' : d.reminderCancelled ? 'cancelled' : 'scheduled'
  return (
    <article className="oos__detail" key={d.id}>
      <header className="oos__head">
        <BookCover title={d.title} author={d.author} isbn={d.isbn} size="md" />
        <div>
          <StatusChip status="out_of_stock" />
          <h2 className="serif">{d.title}</h2>
          <p className="muted">{d.author}</p>
        </div>
        <div className="oos__zero">
          <span className="num">0</span>
          <em>current stock</em>
        </div>
      </header>

      <dl className="oos__facts">
        <div>
          <dt>Current shelf</dt>
          <dd>
            <ShelfTag id={d.shelfId} />
          </dd>
        </div>
        <div>
          <dt>Shopify product</dt>
          <dd className="mono">#{d.productId}</dd>
        </div>
        <div>
          <dt>Shopify sync</dt>
          <dd>
            <SyncChip status={d.syncStatus} />
          </dd>
        </div>
        <div>
          <dt>Last stock check</dt>
          <dd>
            {formatTime(d.lastSync)} · {timeAgo(d.lastSync)}
          </dd>
        </div>
      </dl>

      <section className="oos__sec">
        <h3>Notification status</h3>
        <ol className="ntl">
          <li className="ntl__item is-done">
            <Radar size={15} aria-hidden />
            <span>
              <strong>Stock detected at {formatTime(d.stockOutAt)}</strong>
              <em>{formatDateTime(d.stockOutAt)} · stock check found 0 on Shopify</em>
            </span>
          </li>
          <li className="ntl__item is-done">
            <BellRing size={15} aria-hidden />
            <span>
              <strong>Push #1 sent to admin + staff</strong>
              <em>{formatDateTime(d.push1At)}</em>
            </span>
          </li>
          <li className={cn('ntl__item', reminder === 'sent' ? 'is-done' : reminder === 'cancelled' ? 'is-muted' : 'is-pending')}>
            {reminder === 'sent' ? <BellRing size={15} aria-hidden /> : <CircleDashed size={15} aria-hidden />}
            <span>
              <strong>
                {reminder === 'sent' ? 'Push #2 sent — still out of stock after 24 h' : reminder === 'cancelled' ? 'Reminder cancelled' : '24-hour re-check scheduled'}
              </strong>
              <em>
                {reminder === 'sent'
                  ? formatDateTime(d.push2At)
                  : reminder === 'cancelled'
                    ? 'Restocked or waiting entry approved'
                    : `${formatDateTime(d.reminderDueAt)} · in ${Math.max(1, Math.round((d.reminderDueAt - now) / 3_600_000))} h — push #2 only if still out of stock`}
              </em>
            </span>
          </li>
        </ol>
      </section>

      <section className="oos__sec">
        <h3>Waiting-list entries</h3>
        {d.waitingEntries.length === 0 ? (
          <p className="oos__empty">
            <PackageX size={15} aria-hidden /> No waiting-list entry for this book. Restock it in Shopify, or a staff member can submit copies from another shelf.
          </p>
        ) : (
          <ul className="oos__waiting">
            {d.waitingEntries.map((w) => (
              <li key={w.id}>
                <CheckCircle2 size={16} className="ok" aria-hidden />
                <span>
                  <ShelfTag id={w.shelfId} variant="outline" /> qty <strong className="num">{w.quantity}</strong> · by {w.submittedByName.split(' ')[0]}
                </span>
                <StatusChip status="waiting" ready size="sm" />
                <Button size="sm" variant="primary" onClick={() => navigate(`/admin/waiting-list?review=${w.id}`)}>
                  Review &amp; approve
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="oos__foot">
        <Store size={13} aria-hidden /> Stock is read from Shopify by polling (mock). No webhooks in this release.
      </p>
    </article>
  )
}
