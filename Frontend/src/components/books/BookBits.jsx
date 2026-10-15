import { ArrowRight, BookOpen, Equal, Keyboard, Library } from 'lucide-react'
import { cn, SOURCE_LABEL } from '../../utils/format'
import { normalizeAuthor, normalizeTitle } from '../../services/normalize'
import { ShelfTag, StatusChip } from '../ui/Status'

const SOURCE_ICON = { google: BookOpen, openlibrary: Library, manual: Keyboard }

export function SourceBadge({ source, fallback, className }) {
  const Icon = SOURCE_ICON[source] || Keyboard
  return (
    <span className={cn('source', `source--${source}`, className)}>
      <Icon size={13} aria-hidden />
      {source === 'manual' ? 'Manual entry' : `via ${SOURCE_LABEL[source]}`}
      {fallback && <span className="source__note">· Google Books unavailable</span>}
    </span>
  )
}

/**
 * Shows *why* two entries are the same book: normalized title + author match,
 * even when ISBN, publisher or author spelling differ.
 */
export function DuplicateExplainer({ mine, match, compact }) {
  const rows = [
    { label: 'Title', a: mine.title, b: match.title, na: normalizeTitle(mine.title), nb: normalizeTitle(match.title) },
    { label: 'Author', a: mine.author, b: match.author, na: normalizeAuthor(mine.author), nb: normalizeAuthor(match.author) },
  ]
  const isbnDiffers = mine.isbn && match.isbn && mine.isbn !== match.isbn
  return (
    <div className={cn('dupx', compact && 'dupx--compact')}>
      <div className="dupx__head">
        <span>This submission</span>
        <span />
        <span>Already registered</span>
      </div>
      {rows.map((r) => (
        <div className="dupx__row" key={r.label}>
          <div>
            <span className="dupx__label">{r.label}</span>
            <span className="dupx__val">{r.a}</span>
            <span className="dupx__norm mono">{r.na}</span>
          </div>
          <span className="dupx__eq" aria-label="matches">
            <Equal size={14} />
          </span>
          <div>
            <span className="dupx__label">{r.label}</span>
            <span className="dupx__val">{r.b}</span>
            <span className="dupx__norm mono">{r.nb}</span>
          </div>
        </div>
      ))}
      <div className="dupx__row dupx__row--meta">
        <div>
          <span className="dupx__label">ISBN</span>
          <span className="mono">{mine.isbn}</span>
        </div>
        <span className={cn('dupx__eq', isbnDiffers && 'is-diff')}>{isbnDiffers ? '≠' : '='}</span>
        <div>
          <span className="dupx__label">ISBN</span>
          <span className="mono">{match.isbn}</span>
        </div>
      </div>
      <p className="dupx__foot">
        Matched on <strong>normalized title + author</strong>
        {isbnDiffers ? ' — different ISBN, same book (another publisher or edition).' : '.'}
      </p>
    </div>
  )
}

export function ShelfMove({ from, to, fromLabel = 'Current', toLabel = 'Waiting', fromStatus, compact }) {
  return (
    <span className={cn('shelfmove', compact && 'shelfmove--compact')}>
      <span className="shelfmove__end">
        {!compact && <span className="shelfmove__lbl">{fromLabel}</span>}
        <ShelfTag id={from} variant={fromStatus === 'closed' ? 'muted' : 'solid'} size="sm" />
      </span>
      <ArrowRight size={14} aria-hidden className="shelfmove__arrow" />
      <span className="shelfmove__end">
        {!compact && <span className="shelfmove__lbl">{toLabel}</span>}
        <ShelfTag id={to} variant="outline" size="sm" />
      </span>
    </span>
  )
}

export function MatchLine({ match }) {
  if (!match) return null
  return (
    <span className="matchline">
      <ShelfTag id={match.shelfId} size="sm" /> qty <strong className="num">{match.quantity}</strong> <StatusChip status={match.status} size="sm" />
    </span>
  )
}
