import { useNavigate, useParams } from 'react-router-dom'
import { getBook } from '../../services/staffApi'
import { useQuery } from '../../hooks/useStore'
import { FlowHeader } from '../../components/staff/StaffBits'
import { BookCover } from '../../components/books/BookCover'
import { ErrorState, Skeleton } from '../../components/ui/Feedback'
import { ShelfTag, StatusChip } from '../../components/ui/Status'
import { Barcode } from '../../components/ui/Misc'

/** Read-only book page, opened from stock alerts: the book may be another staff member's submission. */
export default function BookView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: it, loading, error, reload } = useQuery(() => getBook(id), [id], { mock: false })

  return (
    <div className="flow">
      <FlowHeader title="Book details" onBack={() => navigate('/staff/notifications')} />
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
                <StatusChip status={it.status} />
                <h2 className="serif">{it.title}</h2>
                <p>{it.author}</p>
                {(it.publisher || it.year || it.pages) && <p className="muted">{[it.publisher, it.year, it.pages && `${it.pages} pages`].filter(Boolean).join(' · ')}</p>}
              </div>
            </div>
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
              <div className="subdetail__wide">
                <dt>ISBN</dt>
                <dd>
                  <Barcode value={it.isbn} height={24} />
                </dd>
              </div>
            </dl>
            {it.description && <p className="book-desc">{it.description}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
