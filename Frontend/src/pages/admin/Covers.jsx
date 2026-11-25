import { useRef, useState } from 'react'
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, Store, Upload } from 'lucide-react'
import { getCoverBooks, setBookCover } from '../../services/adminApi'
import { shrinkPhoto } from '../../services/photo'
import { useQuery } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { DataTable } from '../../components/ui/Data'
import { PageHeader } from '../../components/ui/Misc'
import { Input } from '../../components/ui/Form'
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
  const [day, setDay] = useState('') // '' = today in store time; the server answers with the date it used
  const { data, loading, error, reload, refreshing } = useQuery(() => getCoverBooks(day), [day])
  const [busyId, setBusyId] = useState(null)
  const [over, setOver] = useState(-1) // the row a photo is being dragged over
  const depth = useRef(0)
  const shown = data?.date || day
  const today = data?.today
  const rows = data?.rows || []
  const withPhoto = rows.filter((b) => b.hasPhoto).length

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
    { key: 'status', header: 'Status', card: 'badge', render: (b) => <StatusChip status={b.status} ready={b.ready} syncStatus={b.syncStatus} size="sm" /> },
    {
      key: 'cover',
      header: 'Cover',
      card: 'meta',
      render: (b) =>
        b.hasPhoto ? (
          <span className="cover-note is-photo">
            <CheckCircle2 size={13} aria-hidden /> Photo set · replaces the Shopify image
          </span>
        ) : onShopify(b) ? (
          <span className="cover-note is-store">
            <Store size={13} aria-hidden /> In the Shopify store · its image is kept
          </span>
        ) : (
          <span className="cover-note">Fetched cover</span>
        ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      card: 'action',
      render: (b) => (
        <Button as="label" size="sm" icon={Camera} loading={busyId === b.id} disabled={!!busyId}>
          {b.hasPhoto ? 'Change photo' : 'Choose photo'}
          <input type="file" accept="image/*" onChange={choose(b)} hidden disabled={!!busyId} />
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Covers"
        eyebrow="Inventory"
        description="The books scanned on a day, in scan order. Drag a photo onto a book’s row (or choose one) to make it the cover: it replaces the Shopify image when the book is approved. A book already in the Shopify store keeps the store’s image unless you give it a photo."
      />
      <div className="toolbar">
        <IconButton icon={ChevronLeft} label="Previous day" onClick={() => shown && setDay(shiftDay(shown, -1))} />
        <Input type="date" className="covers__date" value={shown} max={today} onChange={(e) => setDay(e.target.value)} aria-label="Scan date" />
        <IconButton icon={ChevronRight} label="Next day" disabled={!shown || !today || shown >= today} onClick={() => setDay(shiftDay(shown, 1))} />
        {data && (
          <span className="toolbar__note">
            {rows.length} {rows.length === 1 ? 'book' : 'books'} · {withPhoto} with a photo
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
            loading={loading}
            refreshing={refreshing}
            caption="Books scanned on this day"
            empty={<EmptyState title="No books scanned">Nothing was scanned on this day (rejected books are not listed).</EmptyState>}
          />
        </div>
      )}
    </div>
  )
}
