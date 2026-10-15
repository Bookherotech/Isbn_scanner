import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Clock3, Flag, Hourglass, Info, ScanLine, Send, XCircle } from 'lucide-react'
import { submitBook } from '../../services/mockApi'
import { setLastShelf, useDraft } from '../../hooks/useDraft'
import { useAuth } from '../../hooks/useAuth'
import { FlowHeader, BottomBar } from '../../components/staff/StaffBits'
import { BookCover } from '../../components/books/BookCover'
import { DuplicateExplainer, ShelfMove, SourceBadge } from '../../components/books/BookBits'
import { Barcode } from '../../components/ui/Misc'
import { Button } from '../../components/ui/Button'
import { StageList, useStages } from '../../components/ui/Feedback'
import { FlagChips, ShelfTag } from '../../components/ui/Status'
import { useToast } from '../../hooks/useToast'

export default function ReviewSubmit() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { draft, clearDraft } = useDraft()
  const { toast } = useToast()
  const stages = useStages()
  const [result, setResult] = useState(null)

  if (!draft?.values && !result) return <Navigate to="/staff/scan" replace />
  if (draft && !draft.shelfId && !result) return <Navigate to="/staff/shelf" replace />

  const submit = async () => {
    try {
      const res = await stages.run(
        ['Checking ISBN', 'Preparing submission', 'Checking inventory — title + author', 'Submission created'],
        () =>
          submitBook(
            {
              isbn: draft.isbn,
              ...draft.values,
              source: draft.source,
              subjects: !draft.manual ? draft.meta?.subjects || [] : [],
              fetched: draft.meta && !draft.manual ? { title: draft.meta.title, author: draft.meta.author, publisher: draft.meta.publisher, year: draft.meta.year, pages: draft.meta.pages } : null,
              shelfId: draft.shelfId,
              quantity: draft.quantity,
            },
            user.id,
          ),
        { stepMs: 300 },
      )
      setLastShelf(draft.shelfId)
      setResult({ ...res, draft })
      clearDraft()
    } catch (e) {
      toast({ title: 'Submission failed', description: e.message, tone: 'error' })
      stages.reset()
    }
  }

  if (result) return <SubmitResult result={result} />

  const d = draft
  return (
    <div className="flow">
      <FlowHeader title="Review submission" step={3} onBack={() => navigate('/staff/shelf')} />
      <div className="flow__body">
        <article className="review-card">
          <div className="review-card__book">
            <BookCover title={d.values.title} author={d.values.author} isbn={d.meta?.noCover ? null : d.isbn} size="lg" />
            <div className="review-card__text">
              <SourceBadge source={d.source} />
              <h2 className="serif">{d.values.title}</h2>
              <p>{d.values.author}</p>
              {(d.values.publisher || d.values.year) && (
                <p className="muted">
                  {[d.values.publisher, d.values.year, d.values.pages && `${d.values.pages} pages`].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
          <dl className="review-card__facts">
            <div>
              <dt>Shelf</dt>
              <dd>
                <ShelfTag id={d.shelfId} size="lg" />
              </dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd className="review-card__qty num">{d.quantity}</dd>
            </div>
            <div className="review-card__isbn">
              <dt>ISBN</dt>
              <dd>
                <Barcode value={d.isbn} height={28} />
              </dd>
            </div>
          </dl>
          <div className="review-card__edit">
            <Link to={`/staff/book/${d.isbn}`}>Edit details</Link>
            <Link to="/staff/shelf">Change shelf or quantity</Link>
          </div>
        </article>
        <p className="review-note">
          <Info size={15} aria-hidden />
          On submit, BookHero checks whether this book (same title + author, any edition) is already registered. ISBN alone is not used.
        </p>
        {stages.labels.length > 0 && (
          <div className="processing" role="status">
            <StageList {...stages} />
          </div>
        )}
      </div>
      <BottomBar>
        <Button variant="primary" size="xl" block icon={Send} onClick={submit} loading={stages.active} disabled={stages.active}>
          {stages.active ? 'Submitting…' : 'Submit book'}
        </Button>
      </BottomBar>
    </div>
  )
}

const RESULT = {
  pending: { icon: Clock3, tone: 'pending', title: 'Submitted for approval', text: 'Submitted for admin approval.' },
  waiting: { icon: Hourglass, tone: 'waiting', title: 'Added to the waiting list', text: 'This book already exists on another shelf. Your entry has been added to the waiting list.' },
  rejected: { icon: XCircle, tone: 'rejected', title: 'Already on this shelf', text: 'This book is already registered on this shelf.' },
}

function SubmitResult({ result }) {
  const cfg = RESULT[result.result]
  const Icon = cfg.icon
  const d = result.draft
  const mine = { title: d.values.title, author: d.values.author, isbn: d.isbn }
  return (
    <div className={`flow result result--${cfg.tone}`}>
      <div className="flow__body result__body">
        <div className="result__badge" aria-hidden>
          <Icon size={34} strokeWidth={2} />
        </div>
        <h1 className="result__title">{cfg.title}</h1>
        <p className="result__text">{cfg.text}</p>

        <div className="result__book">
          <BookCover title={d.values.title} author={d.values.author} isbn={d.meta?.noCover ? null : d.isbn} size="sm" />
          <div>
            <strong>{d.values.title}</strong>
            <span>
              <ShelfTag id={d.shelfId} size="sm" /> Qty <b className="num">{d.quantity}</b>
            </span>
          </div>
        </div>

        {result.result === 'rejected' && (
          <>
            <p className="result__strong">
              Already added on Shelf {result.match.shelfId} with quantity {result.match.quantity}.
            </p>
            <DuplicateExplainer mine={mine} match={result.match} compact />
          </>
        )}
        {result.result === 'waiting' && (
          <div className="result__waiting">
            <ShelfMove from={result.match.shelfId} to={d.shelfId} fromLabel="Current stock" toLabel="Your shelf" />
            <p>Waiting for the current stock to sell out before this shelf can become active. The admin approves it then.</p>
            {result.ready && <p className="result__ready">Current stock is already sold out — the admin can approve this right away.</p>}
          </div>
        )}
        {result.flagHold && (
          <div className="result__flag">
            <span className="result__flag-head">
              <Flag size={15} aria-hidden /> Flagged for admin review
            </span>
            <FlagChips flags={result.flags} />
            <p>This isn’t a rejection. The book matches a content category the admin checks before it goes live.</p>
          </div>
        )}
        {result.result === 'pending' && (
          <ol className="result__next">
            <li className="is-done">Submitted</li>
            <li className="is-current">Admin review</li>
            <li>Live on Shopify</li>
          </ol>
        )}
      </div>
      <BottomBar>
        <Button variant="primary" size="xl" block icon={ScanLine} to="/staff/scan">
          Scan next book
        </Button>
        <Button variant="ghost" size="lg" block to="/staff/submissions">
          View my submissions
        </Button>
      </BottomBar>
    </div>
  )
}
