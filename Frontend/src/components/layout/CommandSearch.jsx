import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, Search } from 'lucide-react'
import { globalSearch } from '../../services/mockApi'
import { useDebounce } from '../../hooks/useStore'
import { BookCover } from '../books/BookCover'
import { ShelfTag, StatusChip } from '../ui/Status'
import { Spinner } from '../ui/Feedback'
import { cn } from '../../utils/format'

export function itemLink(item) {
  return item.status === 'pending' ? `/admin/pending/${item.id}` : `/admin/books/${item.id}`
}

/** Ctrl/⌘ K — find any book by title, author, ISBN or shelf. */
export function CommandSearch({ open, onClose }) {
  if (!open) return null
  return <CommandSearchDialog onClose={onClose} />
}

function CommandSearchDialog({ onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const dq = useDebounce(q, 180)
  const navigate = useNavigate()
  const inputRef = useRef(null)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  useEffect(() => {
    let alive = true
    if (dq.trim().length < 2) return
    globalSearch(dq).then((r) => {
      if (!alive) return
      setResults(r)
      setActive(0)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [dq])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const go = (item) => {
    onClose()
    navigate(itemLink(item))
  }

  return createPortal(
    <div className="overlay overlay--top" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label="Search books">
        <div className="cmd__input">
          <Search size={18} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              if (e.target.value.trim().length >= 2) setLoading(true)
              else setResults([])
            }}
            placeholder="Search title, author, ISBN or shelf (e.g. B-03)"
            aria-label="Search books"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter' && results[active]) go(results[active])
            }}
          />
          {loading && <Spinner />}
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="cmd__body">
          {dq.trim().length < 2 ? (
            <div className="cmd__hint">
              <p>Try</p>
              <div className="cmd__chips">
                {['Atomic Habits', 'Murakami', '9780062315007', 'B-03'].map((t) => (
                  <button key={t} className="chip-btn" onClick={() => { setQ(t); setLoading(true) }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : results.length === 0 && !loading ? (
            <p className="cmd__empty">No books match “{dq}”.</p>
          ) : (
            <ul className="cmd__list" role="listbox">
              {results.map((r, i) => (
                <li key={r.id} role="option" aria-selected={i === active}>
                  <button className={cn('cmd__item', i === active && 'is-active')} onPointerEnter={() => setActive(i)} onClick={() => go(r)}>
                    <BookCover title={r.title} author={r.author} isbn={r.isbn} size="xs" />
                    <span className="cmd__text">
                      <strong>{r.title}</strong>
                      <span>
                        {r.author} · <span className="mono">{r.isbn}</span>
                      </span>
                    </span>
                    <ShelfTag id={r.shelfId} size="sm" />
                    <StatusChip status={r.status} ready={r.ready} size="sm" />
                    {i === active && <CornerDownLeft size={15} className="cmd__enter" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
