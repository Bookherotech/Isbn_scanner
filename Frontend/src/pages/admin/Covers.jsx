import { useRef, useState } from 'react'
import { ArrowRight, Camera, CircleDashed, ImageUp, Store, ChevronLeft, ChevronRight, Upload, UserRound } from 'lucide-react'
import { getCoverBooks, releaseCovers, setBookCover } from '../../services/adminApi'
import { shrinkPhoto } from '../../services/photo'
import { useQuery } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { DataTable } from '../../components/ui/Data'
import { PageHeader } from '../../components/ui/Misc'
import { Input, Segmented } from '../../components/ui/Form'
import { Button, IconButton } from '../../components/ui/Button'
import { EmptyState, ErrorState } from '../../components/ui/Feedback'
import { ShelfTag, StatusChip } from '../../components/ui/Status'
import { BookCell } from '../../components/books/BookCover'
import { Person } from '../../components/inventory/Filters'
import { formatDateTime } from '../../utils/format'

/** Already in the Shopify store: on Shopify itself, or waiting behind units that are. */
const onShopify = (b) => Boolean(b.productId || b.match?.shopify || b.linked?.productId)
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files')
const timeOf = (ms) => (ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—')

function shiftDay(day, by) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + by)
  return d.toISOString().slice(0, 10)
}

/** The row (table) or card (phone) under the pointer -> its position in the list, or -1. */
function rowIndex(target) {
  const row = target instanceof Element ? target.closest('tbody > tr, .cardlist > li') : null
  return row ? Array.prototype.indexOf.call(row.parentElement.children, row) : -1
}

export default function Covers() {
  const { toast } = useToast()
  const [tab, setTab] = useState('check') // check = new books waiting here before Pending / Waiting list; day = all scans of a day
  const [day, setDay] = useState('') // '' = today in store time; the server answers with the date it used
  const { data, loading, error, reload, refreshing } = useQuery(() => getCoverBooks({ tab, date: day }), [tab, day])
  const [busyId, setBusyId] = useState(null)
  const [sending, setSending] = useState(null) // 'all' | book id
  const [over, setOver] = useState(-1) // the row a photo is being dragged over
  const depth = useRef(0)
  const shown = data?.date || day
  const today = data?.today
  const rows = data?.tab === tab ? data.rows : [] // not the other tab's rows while switching
  const dropped = rows.filter((b) => b.coverDroppedAt).length

  const upload = async (book, file) => {
    setBusyId(book.id)
    try {
      await setBookCover(book.id, await shrinkPhoto(file))
      const approved = book.status === 'live' || book.status === 'out_of_stock'
      toast({ title: `Cover updated · ${book.title}`, description: approved ? 'Sent to the Shopify product.' : 'It replaces the Shopify image when the book is approved.' })
    } catch (err) {
      toast({ title: 'Couldn’t update the cover', description: err.message, tone: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  const drag = {
    onDragEnter: (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current += 1
    },
    onDragOver: (e) => {
      if (!hasFiles(e)) return
      e.preventDefault() // allow the drop (else the browser opens the file)
      const i = rowIndex(e.target)
      e.dataTransfer.dropEffect = i >= 0 && !busyId ? 'copy' : 'none'
      if (i !== over) setOver(i)
    },
    onDragLeave: (e) => {
      if (!hasFiles(e)) return
      depth.current -= 1
      if (depth.current <= 0) {
        depth.current = 0
        setOver(-1)
      }
    },
    onDrop: (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setOver(-1)
      const book = rows[rowIndex(e.target)]
      const files = Array.from(e.dataTransfer.files || [])
      const file = files.find((f) => f.type.startsWith('image/')) || files[0]
      if (book && file && !busyId) upload(book, file)
    },
  }

  const send = async (ids, key) => {
    setSending(key)
    try {
      const { released } = await releaseCovers(ids)
      toast({ title: released === 1 ? 'Sent on' : `${released} books sent on`, description: 'They are in Pending or the Waiting list now.' })
    } catch (err) {
      toast({ title: 'Couldn’t send them on', description: err.message, tone: 'error' })
    } finally {
      setSending(null)
    }
  }

  const choose = (book) => (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // the same file can be picked again
    if (file) upload(book, file)
  }

  const columns = [
    { key: 'n', header: '#', align: 'right', card: 'meta', render: (b) => <span className="num td-muted">{b.n}</span> },
    { key: 'book', header: 'Book', card: 'title', render: (b) => <BookCell item={b} sub={b.author} /> },
    { key: 'isbn', header: 'ISBN', card: 'meta', render: (b) => <span className="td-mono">{b.isbn}</span> },
    { key: 'shelf', header: 'Shelf', card: 'meta', render: (b) => <ShelfTag id={b.shelfId} size="sm" /> },
    { key: 'qty', header: 'Qty', align: 'right', card: 'meta', render: (b) => <span className="num td-strong">{b.quantity}</span> },
    { key: 'by', header: 'Scanned by', card: 'meta', render: (b) => <Person id={b.submittedBy} name={b.submittedByName} /> },
    { key: 'at', header: 'Scanned', card: 'meta', render: (b) => <span className="td-muted" title={formatDateTime(b.submittedAt)}>{timeOf(b.submittedAt)}</span> },
    { key: 'status', header: 'Status', card: 'badge', render: (b) => <StatusChip status={b.status} ready={b.ready} syncStatus={b.syncStatus} size="sm" label={b.coverHold ? `Goes to ${b.status === 'waiting' ? 'Waiting list' : 'Pending'}` : undefined} /> },
    {
      key: 'cover',
      header: 'Cover',
      card: 'meta',
      render: (b) => (
        <span className="cover-state">
          {b.coverDroppedAt ? (
            <span className="chip chip--sm chip--approved" title={`Dropped ${formatDateTime(b.coverDroppedAt)}`}>
              <ImageUp size={12} aria-hidden strokeWidth={2.3} /> Photo dropped
            </span>
          ) : b.hasPhoto ? (
            <span className="chip chip--sm chip--waiting">
              <UserRound size={12} aria-hidden strokeWidth={2.3} /> Staff photo
            </span>
          ) : (
            <span className="chip chip--sm chip--oos">
              <CircleDashed size={12} aria-hidden strokeWidth={2.3} /> Not dropped
            </span>
          )}
          <span className="cover-note">
            {b.hasPhoto ? (
              'Replaces the Shopify image'
            ) : onShopify(b) ? (
              <>
                <Store size={12} aria-hidden /> Store image kept
              </>
            ) : (
              'Fetched cover used'
            )}
          </span>
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      card: 'action',
      render: (b) => (
        <span className="row-actions">
          <Button as="label" size="sm" icon={Camera} loading={busyId === b.id} disabled={!!busyId}>
            {b.hasPhoto ? 'Change photo' : 'Choose photo'}
            <input type="file" accept="image/*" onChange={choose(b)} hidden disabled={!!busyId} />
          </Button>
          {b.coverHold && (
            <Button size="sm" variant="dark" iconRight={ArrowRight} loading={sending === b.id} disabled={!!sending || busyId === b.id} onClick={() => send([b.id], b.id)}>
              Send
            </Button>
          )}
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Covers"
        eyebrow="Inventory"
        description="New scans come here first. Drag a photo onto a book’s row (or choose one) to make it the cover, then send the books on to Pending or the Waiting list. A photo replaces the Shopify image; without one, a book already in the Shopify store keeps the store’s image and a new product gets the fetched cover."
        actions={
          tab === 'check' &&
          rows.length > 0 && (
            <Button variant="primary" iconRight={ArrowRight} loading={sending === 'all'} disabled={!!sending || !!busyId} onClick={() => send(rows.map((b) => b.id), 'all')}>
              Send all on ({rows.length})
            </Button>
          )
        }
      />
      <div className="toolbar">
        <Segmented
          label="Show"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'check', label: `To check${data?.check ? ` (${data.check})` : ''}` },
            { value: 'day', label: 'By day' },
          ]}
        />
        {tab === 'day' && (
          <>
            <IconButton icon={ChevronLeft} label="Previous day" onClick={() => shown && setDay(shiftDay(shown, -1))} />
            <Input type="date" className="covers__date" value={shown} max={today} onChange={(e) => setDay(e.target.value)} aria-label="Scan date" />
            <IconButton icon={ChevronRight} label="Next day" disabled={!shown || !today || shown >= today} onClick={() => setDay(shiftDay(shown, 1))} />
          </>
        )}
        {data && (
          <span className="toolbar__note">
            {rows.length} {rows.length === 1 ? 'book' : 'books'} · <b className="covers__count is-dropped">{dropped} dropped</b> ·{' '}
            <b className="covers__count is-missing">{rows.length - dropped} not dropped</b>
          </span>
        )}
        <span className="toolbar__spacer" />
        <span className="toolbar__note covers__hint">
          <Upload size={13} aria-hidden /> Drop a photo on a row
        </span>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="covers-drop" {...drag}>
          <DataTable
            columns={columns}
            rows={rows.map((b, i) => ({ ...b, n: i + 1, __highlight: i === over }))}
            loading={loading || (!!data && data.tab !== tab)}
            refreshing={refreshing}
            caption="Books scanned on this day"
            empty={
              tab === 'check' ? (
                <EmptyState title="All caught up">No new scans are waiting for a cover check.</EmptyState>
              ) : (
                <EmptyState title="No books scanned">Nothing was scanned on this day (rejected books are not listed).</EmptyState>
              )
            }
          />
        </div>
      )}
    </div>
  )
}
