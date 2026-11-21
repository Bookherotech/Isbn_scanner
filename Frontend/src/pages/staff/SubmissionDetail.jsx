import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSubmission } from '../../services/staffApi'
import { useQuery } from '../../hooks/useStore'
import { FlowHeader } from '../../components/staff/StaffBits'
import { BookCover } from '../../components/books/BookCover'
import { DuplicateExplainer, ShelfMove, SourceBadge } from '../../components/books/BookBits'
import { ErrorState, Skeleton } from '../../components/ui/Feedback'
import { FlagChips, ShelfTag, StatusChip } from '../../components/ui/Status'
import { Barcode } from '../../components/ui/Misc'
import { cn, formatDateTime } from '../../utils/format'

function timeline(it) {
  const steps = [{ label: 'Submitted', at: it.submittedAt, state: 'done' }]
  if (it.status === 'rejected') {
    steps.push({ label: it.rejectedBy === 'system' ? 'Duplicate check — same shelf' : `Rejected by admin · ${it.rejectReason}`, at: it.rejectedAt, state: 'error' })
    return steps
  }
  steps.push({ label: 'Duplicate check passed', at: it.submittedAt, state: 'done' })
  if (it.status === 'waiting') {
    steps.push({ label: it.ready ? 'Current stock sold out — ready for approval' : `Waiting for stock on ${it.linked?.shelfId} to sell out`, state: it.ready ? 'current' : 'current' })
    steps.push({ label: 'Admin approval', state: 'todo' })
    return steps
  }
  if (it.status === 'pending') {
    steps.push({ label: 'Admin review', state: 'current' })
    steps.push({ label: 'Live on Shopify', state: 'todo' })
    return steps
  }
  steps.push({ label: `Approved by ${it.approvedByName || 'admin'}`, at: it.approvedAt, state: 'done' })
  steps.push({ label: 'Live on Shopify', at: it.approvedAt, state: 'done' })
  if (it.status === 'out_of_stock') steps.push({ label: it.syncStatus === 'deleted' ? 'Deleted on Shopify' : 'Sold out on Shopify', at: it.stockOutAt, state: 'warn' })
  if (it.status === 'closed') steps.push({ label: 'Sold out — shelf closed', at: it.closedAt, state: 'warn' })
  return steps
}

export default function SubmissionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: it, loading, error, reload } = useQuery(() => getSubmission(id), [id], { mock: false })
  const [showAll, setShowAll] = useState(false)

  return (
    <div className="flow">
      <FlowHeader title="Submission" onBack={() => navigate('/staff/submissions')} />
      <div className="flow__body">
        {loading ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Skeleton h={150} r={10} />
            <Skeleton h={200} r={10} />
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={reload} compact />
        ) : (
          <div className="subdetail">
            <div className="subdetail__hero">
              <BookCover title={it.title} author={it.author} isbn={it.isbn} photo={it.coverPhotoUrl} size="lg" />
              <div>
                <StatusChip status={it.status} ready={it.ready} syncStatus={it.syncStatus} />
                <h2 className="serif">{it.title}</h2>
                <p>{it.author}</p>
                <span className="meta-hero__badges">
                  <SourceBadge source={it.source} />
                  {it.edited && <span className="edited-tag">Edited</span>}
                </span>
              </div>
            </div>

            {/* Right column on wide screens; on phones its parts slot in between the main sections (see CSS order). */}
            <div className="subdetail__side">
              <section className="subdetail__card subdetail__stock" aria-label="Stock">
                <dl className="subdetail__facts">
                  <div>
                    <dt>Shelf</dt>
                    <dd>
                      <ShelfTag id={it.shelfId} />
                    </dd>
                  </div>
                  <div>
                    <dt>Quantity</dt>
                    <dd className="num">{it.quantity}</dd>
                  </div>
                  {it.stock != null && (
                    <div>
                      <dt>On Shopify</dt>
                      <dd className="num">{it.stock}</dd>
                    </div>
                  )}
                </dl>
                <div className="subdetail__isbn">
                  <span className="subdetail__label">ISBN</span>
                  <Barcode value={it.isbn} height={24} />
                </div>
              </section>

              <section className="subdetail__progress" aria-label="Progress">
                {it.flags?.length > 0 && (
                  <div className="result__flag result__flag--left">
                    <span className="result__flag-head">{it.flagHold ? 'Flagged for admin review' : 'Content labels'}</span>
                    <FlagChips flags={it.flags} reviewed={!it.flagHold} />
                  </div>
                )}
                {it.status === 'waiting' && it.linked && <ShelfMove from={it.linked.shelfId} to={it.shelfId} fromLabel="Current stock" toLabel="Your shelf" />}
                {it.status === 'rejected' && it.rejectedBy === 'system' && it.match && (
                  <>
                    <p className="result__strong">
                      Already added on Shelf {it.match.shelfId} with quantity {it.match.quantity}.
                    </p>
                    <DuplicateExplainer mine={it} match={it.match} compact />
                  </>
                )}
                {it.status === 'rejected' && it.rejectedBy !== 'system' && (
                  <div className="callout callout--danger">
                    <p>
                      <strong>{it.rejectReason}.</strong> {it.rejectNote}
                    </p>
                  </div>
                )}
                <div className="subdetail__card">
                  <h3 className="subdetail__title">Progress</h3>
                  <ol className="timeline">
                    {timeline(it).map((s, i) => (
                      <li key={i} className={cn('timeline__item', `is-${s.state}`)}>
                        <span className="timeline__dot" aria-hidden />
                        <span className="timeline__label">{s.label}</span>
                        {s.at && <time className="timeline__time">{formatDateTime(s.at)}</time>}
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            </div>

            <div className="subdetail__main">
              <section className="subdetail__card" aria-labelledby="sd-details">
                <h3 className="subdetail__title" id="sd-details">
                  Book details
                </h3>
                <dl className="subdetail__grid">
                  {[
                    ['Publisher', it.publisher],
                    ['Year', it.year],
                    ['Pages', it.pages],
                    ['Format', it.format],
                    ['Dimensions', it.dimensions && `${it.dimensions} mm`],
                    ['Language', it.language || 'English'],
                    ['Genre', it.genre],
                    ['ISBN', <span className="mono">{it.isbn}</span>],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd className={cn(!value && 'is-empty')}>{value || 'Not set'}</dd>
                    </div>
                  ))}
                  {it.subgenres.length > 0 && (
                    <div className="subdetail__grid-wide">
                      <dt>{it.genre ? `${it.genre} categories` : 'Categories'}</dt>
                      <dd>
                        <ul className="subjects subjects--genre">
                          {it.subgenres.map((g) => (
                            <li key={g}>{g}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}
                  {it.subjects?.length > 0 && (
                    <div className="subdetail__grid-wide">
                      <dt>Subjects</dt>
                      <dd>
                        <ul className="subjects">
                          {it.subjects.map((sub) => (
                            <li key={sub}>{sub}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}
                </dl>
              </section>

              {it.description && (
                <section className="subdetail__card" aria-labelledby="sd-desc">
                  <h3 className="subdetail__title" id="sd-desc">
                    Description
                  </h3>
                  <p className={cn('book-desc', !showAll && 'is-clamped')}>{it.description}</p>
                  {it.description.length > 420 && (
                    <button type="button" className="subdetail__more" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                      {showAll ? 'Show less' : 'Show full description'}
                    </button>
                  )}
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
