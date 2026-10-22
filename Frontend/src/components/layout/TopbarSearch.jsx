import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, Search } from 'lucide-react'
import { globalSearch } from '../../services/mockApi'
import { useDebounce } from '../../hooks/useStore'
import { BookCover } from '../books/BookCover'
import { ShelfTag, StatusChip } from '../ui/Status'
import { Spinner } from '../ui/Feedback'
import { cn } from '../../utils/format'
import { itemLink } from './CommandSearch'

/**
 * The search box in the admin top bar: type a title, author, ISBN or shelf and the matching books
 * drop down under it (arrow keys + Enter to open one, Esc to close). Ctrl/⌘ K focuses it.
 * On narrower screens it shrinks to an icon that opens the full search dialog (`onOpenDialog`).
 */
export function TopbarSearch({ inputRef, onOpenDialog }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const dq = useDebounce(q, 180)
  const navigate = useNavigate()
  const boxRef = useRef(null)
  const searching = dq.trim().length >= 2

  useEffect(() => {
    if (!searching) return undefined
    let alive = true
    globalSearch(dq).then((found) => {
      if (!alive) return
      setResults(found)
      setActive(0)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [dq, searching])

  // Close the results when clicking anywhere outside the search box.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => !boxRef.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const go = (item) => {
    setOpen(false)
    setQ('')
    setResults([])
    inputRef.current?.blur()
    navigate(itemLink(item))
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault()
      go(results[active])
    }
  }

  return (
    <>
      <div className="tsearch" ref={boxRef}>
        <label className="tsearch__field">
          <Search size={15} aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
              if (e.target.value.trim().length >= 2) setLoading(true)
              else setResults([])
            }}
            onFocus={() => q && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search title, author, ISBN or shelf"
            aria-label="Search books"
            role="combobox"
            aria-expanded={open && searching}
            aria-controls="tsearch-results"
            autoComplete="off"
          />
          {loading ? <Spinner /> : <kbd className="kbd">Ctrl K</kbd>}
        </label>
        {open && searching && (
          <div className="tsearch__panel" id="tsearch-results">
            {results.length === 0 && !loading ? (
              <p className="cmd__empty">No books match “{dq}”.</p>
            ) : (
              <ul className="cmd__list" role="listbox" aria-label="Matching books">
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
        )}
      </div>
      <button className="tsearch__icon icon-btn" onClick={onOpenDialog} aria-label="Search books">
        <Search size={18} aria-hidden />
      </button>
    </>
  )
}
