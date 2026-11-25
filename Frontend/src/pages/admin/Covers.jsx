import { useState } from 'react'
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, Store } from 'lucide-react'
import { getCoverBooks, setBookCover } from '../../services/adminApi'
import { shrinkPhoto } from '../../services/photo'
import { useQuery } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { PageHeader } from '../../components/ui/Misc'
import { Input } from '../../components/ui/Form'
import { Button, IconButton } from '../../components/ui/Button'
import { EmptyState, ErrorState, Skeleton, Spinner } from '../../components/ui/Feedback'
import { ShelfTag, StatusChip } from '../../components/ui/Status'
import { BookCover } from '../../components/books/BookCover'
import { PhotoDrop } from '../../components/books/PhotoDrop'
import { cn } from '../../utils/format'

/** Already in the Shopify store: on Shopify itself, or waiting behind units that are. */
const onShopify = (b) => Boolean(b.productId || b.match?.shopify || b.linked?.productId)

function shiftDay(day, by) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + by)
  return d.toISOString().slice(0, 10)
}

export default function Covers() {
  const [day, setDay] = useState('') // '' = today in store time; the server answers with the date it used
  const { data, loading, error, reload, refreshing } = useQuery(() => getCoverBooks(day), [day])
  const shown = data?.date || day
  const today = data?.today
  const rows = data?.rows || []
  const withPhoto = rows.filter((b) => b.hasPhoto).length

  return (
    <div>
      <PageHeader
        title="Covers"
        eyebrow="Inventory"
        description="The books scanned on a day, in scan order. Drop a photo on a book (or choose one) to make it the cover: it replaces the Shopify image when the book is approved. A book already in the Shopify store keeps the store’s image unless you give it a photo."
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
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <div className="covers">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} w={188} h={330} r={12} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No books scanned">Nothing was scanned on this day (rejected books are not listed).</EmptyState>
      ) : (
        <div className={cn('covers', refreshing && 'is-refreshing')} role="list" aria-label="Books scanned on this day">
          {rows.map((b, i) => (
            <CoverCard key={b.id} book={b} index={i + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function CoverCard({ book, index }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const store = onShopify(book)
  const approved = book.status === 'live' || book.status === 'out_of_stock'

  const upload = async (file) => {
    setBusy(true)
    try {
      await setBookCover(book.id, await shrinkPhoto(file))
      toast({ title: `Cover updated · ${book.title}`, description: approved ? 'Sent to the Shopify product.' : 'It replaces the Shopify image when the book is approved.' })
    } catch (err) {
      toast({ title: 'Couldn’t update the cover', description: err.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  const choose = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // the same file can be picked again
    if (file) upload(file)
  }

  return (
    <div className={cn('cover-card', book.hasPhoto && 'has-photo')} role="listitem">
      <span className="cover-card__index num">#{index}</span>
      <PhotoDrop className="cover-card__drop" onFile={upload} disabled={busy}>
        <BookCover title={book.title} author={book.author} isbn={book.isbn} photo={book.coverPhotoUrl} size="lg" />
        {busy && (
          <span className="cover-card__busy" aria-label="Uploading">
            <Spinner size={22} />
          </span>
        )}
      </PhotoDrop>
      <div className="cover-card__body">
        <strong className="cover-card__title" title={book.title}>
          {book.title}
        </strong>
        <span className="mono cover-card__isbn">{book.isbn}</span>
        <span className="cover-card__tags">
          <ShelfTag id={book.shelfId} size="sm" variant="muted" />
          <StatusChip status={book.status} ready={book.ready} syncStatus={book.syncStatus} size="sm" />
        </span>
        {book.hasPhoto ? (
          <span className="cover-card__note is-photo">
            <CheckCircle2 size={13} aria-hidden /> Photo set · replaces the Shopify image
          </span>
        ) : store ? (
          <span className="cover-card__note is-store">
            <Store size={13} aria-hidden /> In the Shopify store · its image is kept
          </span>
        ) : (
          <span className="cover-card__note">No photo · the fetched cover is used</span>
        )}
      </div>
      <Button as="label" size="sm" icon={Camera} disabled={busy} className="cover-card__btn">
        {book.hasPhoto ? 'Change photo' : 'Choose photo'}
        <input type="file" accept="image/*" onChange={choose} hidden disabled={busy} />
      </Button>
    </div>
  )
}
