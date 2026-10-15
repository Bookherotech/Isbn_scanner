import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Store } from 'lucide-react'
import { getItem } from '../../services/mockApi'
import { useQuery, useTicker } from '../../hooks/useStore'
import { BookCover } from '../../components/books/BookCover'
import { DuplicateExplainer, SourceBadge } from '../../components/books/BookBits'
import { FlagReviewCard } from '../../components/books/FlagReview'
import { Barcode, Panel } from '../../components/ui/Misc'
import { Button } from '../../components/ui/Button'
import { ErrorState, Skeleton } from '../../components/ui/Feedback'
import { ShelfTag, StatusChip, SyncChip } from '../../components/ui/Status'
import { ActivityRow } from '../../components/dashboard/ActivityRow'
import { Person } from '../../components/inventory/Filters'
import { formatDateTime, timeAgo } from '../../utils/format'

export default function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: it, loading, error, reload } = useQuery(() => getItem(id), [id])
  useTicker()

  if (loading)
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <Skeleton w={120} h={14} />
        <Skeleton h={260} r={10} />
      </div>
    )
  if (error) return <ErrorState error={error} onRetry={reload} />

  return (
    <div className="bookd">
      <button className="backlink" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} aria-hidden /> Back
      </button>
      <div className="bookd__hero">
        <BookCover title={it.title} author={it.author} isbn={it.isbn} size="xl" />
        <div className="bookd__ident">
          <div className="bookd__chips">
            <StatusChip status={it.status} ready={it.ready} />
            <SourceBadge source={it.source} />
          </div>
          <h1 className="review__title">{it.title}</h1>
          <p className="review__author">by {it.author}</p>
          <p className="muted">{[it.publisher, it.year, it.pages && `${it.pages} pages`].filter(Boolean).join(' · ')}</p>
          <div className="review__barcode">
            <Barcode value={it.isbn} height={30} />
          </div>
          {it.status === 'pending' && (
            <Button variant="primary" to={`/admin/pending/${it.id}`}>
              Review this submission
            </Button>
          )}
          {it.status === 'waiting' && (
            <Button variant="primary" to={`/admin/waiting-list?review=${it.id}`}>
              Open in waiting list
            </Button>
          )}
        </div>
        <dl className="bookd__stats">
          <div>
            <dt>Shelf</dt>
            <dd>
              <ShelfTag id={it.shelfId} size="lg" variant={it.status === 'closed' ? 'muted' : 'solid'} />
            </dd>
          </div>
          <div>
            <dt>{it.stock != null ? 'On Shopify' : 'Quantity'}</dt>
            <dd className="num bookd__big">{it.stock ?? it.quantity}</dd>
          </div>
          <div>
            <dt>Submitted by</dt>
            <dd>
              <Person id={it.submittedBy} name={it.submittedByName} />
            </dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{formatDateTime(it.submittedAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="bookd__grid">
        {it.flags?.length > 0 && <FlagReviewCard item={it} />}
        {it.productId && (
          <Panel title="Shopify product" eyebrow="Demo / mock integration">
            <dl className="kv">
              <div>
                <dt>Product</dt>
                <dd className="mono">#{it.productId}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <SyncChip status={it.syncStatus} />
                </dd>
              </div>
              <div>
                <dt>Inventory</dt>
                <dd className="num">{it.stock}</dd>
              </div>
              <div>
                <dt>Last checked</dt>
                <dd>{timeAgo(it.lastSync)}</dd>
              </div>
            </dl>
            {it.shelfHistory.length > 1 && (
              <>
                <h3 className="kv__title">Shelf history — same product</h3>
                <ol className="shelfhist">
                  {it.shelfHistory.map((h) => (
                    <li key={h.id} className={h.status === 'closed' ? 'is-closed' : ''}>
                      <ShelfTag id={h.shelfId} size="sm" variant={h.status === 'closed' ? 'muted' : 'solid'} />
                      <span>{h.status === 'closed' ? `Closed ${timeAgo(h.closedAt)} · sold out` : `Active since ${timeAgo(h.approvedAt)}`}</span>
                      <span className="num muted">{h.quantity} units</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <p className="shopcard__note">
              <Store size={13} aria-hidden /> Listing created on approval; quantity kept in sync by the stock check.
            </p>
          </Panel>
        )}
        {it.status === 'rejected' && (
          <Panel title="Rejection">
            <p>
              <strong>{it.rejectReason}</strong> {it.rejectNote && `— ${it.rejectNote}`}
            </p>
            {it.match && <DuplicateExplainer mine={it} match={it.match} />}
          </Panel>
        )}
        <Panel title="History">
          {it.activity.length ? (
            <ul className="act-list">
              {it.activity.map((a) => (
                <ActivityRow key={a.id} a={a} compact />
              ))}
            </ul>
          ) : (
            <p className="muted">No history recorded.</p>
          )}
          <Link to="/admin/activity" className="panel__link" style={{ marginTop: 10 }}>
            Full activity log
          </Link>
        </Panel>
      </div>
    </div>
  )
}
