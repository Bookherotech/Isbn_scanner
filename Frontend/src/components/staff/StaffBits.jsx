import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Flag, X } from 'lucide-react'
import { BookCover } from '../books/BookCover'
import { ShelfTag, StatusChip } from '../ui/Status'
import { cn, timeAgo } from '../../utils/format'

const STEPS = ['Book', 'Shelf & qty', 'Review']

/** Header used inside the scan → submit flow. */
export function FlowHeader({ title, step, onBack, close = false }) {
  const navigate = useNavigate()
  return (
    <header className="flowhead">
      <div className="flowhead__row">
        <button className="icon-btn" onClick={onBack || (() => navigate(-1))} aria-label={close ? 'Cancel and close' : 'Back'}>
          {close ? <X size={20} /> : <ArrowLeft size={20} />}
        </button>
        <h1 className="flowhead__title">{title}</h1>
        {step ? <span className="flowhead__step num">{step}/3</span> : <span style={{ width: 36 }} />}
      </div>
      {step && (
        <ol className="flowsteps" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className={cn(i + 1 < step && 'is-done', i + 1 === step && 'is-current')} aria-current={i + 1 === step ? 'step' : undefined}>
              <span className="flowsteps__bar" />
              <span className="flowsteps__lbl">{s}</span>
            </li>
          ))}
        </ol>
      )}
    </header>
  )
}

export function SubmissionCard({ item }) {
  return (
    <Link to={`/staff/submissions/${item.id}`} className="subcard">
      <BookCover title={item.title} author={item.author} isbn={item.isbn} size="sm" />
      <span className="subcard__main">
        <span className="subcard__title">{item.title}</span>
        <span className="subcard__meta">
          <ShelfTag id={item.shelfId} size="sm" />
          <span className="num">Qty {item.quantity}</span>
          <span className="subcard__dot" aria-hidden>·</span>
          <span>{timeAgo(item.submittedAt)}</span>
        </span>
        <span className="subcard__status">
          <StatusChip status={item.status} ready={item.ready} size="sm" />
          {item.flagHold && (
            <span className="subcard__flag">
              <Flag size={11} aria-hidden /> In flag review
            </span>
          )}
        </span>
      </span>
      <ChevronRight size={18} className="subcard__chev" aria-hidden />
    </Link>
  )
}

/** Sticky bottom action area inside the phone. */
export function BottomBar({ children }) {
  return <div className="bottombar">{children}</div>
}
