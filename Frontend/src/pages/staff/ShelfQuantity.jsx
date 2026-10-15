import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, ChevronDown, History, Search } from 'lucide-react'
import { getActiveShelvesSync } from '../../services/mockApi'
import { getLastShelf, useDraft } from '../../hooks/useDraft'
import { FlowHeader, BottomBar } from '../../components/staff/StaffBits'
import { BookCover } from '../../components/books/BookCover'
import { Button } from '../../components/ui/Button'
import { QuantityStepper } from '../../components/ui/Form'
import { ShelfTag } from '../../components/ui/Status'
import { cn } from '../../utils/format'

export default function ShelfQuantity() {
  const navigate = useNavigate()
  const { draft, setDraft } = useDraft()
  const shelves = useMemo(() => getActiveShelvesSync(), [])
  const last = getLastShelf()
  const lastValid = shelves.some((s) => s.id === last) ? last : ''
  const [shelf, setShelf] = useState(draft?.shelfId || lastValid)
  const [open, setOpen] = useState(!draft?.shelfId && !lastValid)
  const [q, setQ] = useState('')
  const [qty, setQty] = useState(draft?.quantity ?? 1)
  const [tried, setTried] = useState(false)

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase().replace(/\s/g, '')
    return shelves.filter((x) => !s || x.code.replace('-', '').includes(s.replace('-', '')))
  }, [shelves, q])

  if (!draft?.values) return <Navigate to="/staff/scan" replace />

  const proceed = () => {
    setTried(true)
    if (!shelf || !qty) return
    setDraft((d) => ({ ...d, shelfId: shelf, quantity: Number(qty) }))
    navigate('/staff/review')
  }

  return (
    <div className="flow">
      <FlowHeader title="Shelf & quantity" step={2} onBack={() => navigate(`/staff/book/${draft.isbn}`)} />
      <div className="flow__body">
        <div className="flow-book">
          <BookCover title={draft.values.title} author={draft.values.author} isbn={draft.meta?.noCover ? null : draft.isbn} size="sm" />
          <div>
            <strong>{draft.values.title}</strong>
            <span>{draft.values.author}</span>
          </div>
        </div>

        <section className="sq-block">
          <label className="sq-label" id="shelf-label">
            Shelf
          </label>
          <button
            type="button"
            className={cn('shelf-select', open && 'is-open', tried && !shelf && 'is-invalid')}
            aria-expanded={open}
            aria-controls="shelf-list"
            aria-labelledby="shelf-label"
            onClick={() => setOpen((o) => !o)}
          >
            {shelf ? <ShelfTag id={shelf} size="lg" /> : <span className="shelf-select__ph">Select a shelf</span>}
            <ChevronDown size={20} aria-hidden />
          </button>
          {open && (
            <div className="shelf-pop" id="shelf-list">
              <div className="shelf-pop__search">
                <Search size={17} aria-hidden />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shelf — e.g. B4" aria-label="Search shelves" autoFocus />
              </div>
              {!q && lastValid && (
                <button
                  type="button"
                  className={cn('shelf-opt shelf-opt--last', shelf === lastValid && 'is-selected')}
                  onClick={() => {
                    setShelf(lastValid)
                    setOpen(false)
                  }}
                >
                  <History size={16} aria-hidden />
                  <span>Last used</span>
                  <ShelfTag id={lastValid} />
                  {shelf === lastValid && <Check size={18} className="shelf-opt__check" />}
                </button>
              )}
              <div className="shelf-grid" role="listbox" aria-label="Shelves">
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={shelf === s.id}
                    className={cn('shelf-cell', shelf === s.id && 'is-selected')}
                    onClick={() => {
                      setShelf(s.id)
                      setOpen(false)
                      setQ('')
                    }}
                  >
                    <span className="mono">{s.code}</span>
                  </button>
                ))}
                {filtered.length === 0 && <p className="shelf-grid__empty">No shelf matches “{q}”. Shelves are added by the admin in Masters.</p>}
              </div>
            </div>
          )}
          {tried && !shelf && <p className="field__error">Choose the shelf this book is on.</p>}
        </section>

        <section className="sq-block">
          <label className="sq-label" htmlFor="qty">
            Quantity
          </label>
          <QuantityStepper id="qty" value={qty} onChange={setQty} size="lg" max={500} />
          <p className="sq-help">Enter the full quantity currently on this shelf.</p>
        </section>
      </div>
      <BottomBar>
        <Button variant="primary" size="xl" block iconRight={ArrowRight} onClick={proceed}>
          Review submission
        </Button>
      </BottomBar>
    </div>
  )
}
