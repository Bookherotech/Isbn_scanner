import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, RefreshCw } from 'lucide-react'
import { getAuthors, listItems, retrySync, selectors } from '../../services/mockApi'
import { useDebounce, useQuery, useSelector, useTicker } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { DataTable, Pagination } from '../../components/ui/Data'
import { PageHeader } from '../../components/ui/Misc'
import { SearchInput, Select } from '../../components/ui/Form'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/Feedback'
import { ShelfTag, StatusChip, SyncChip } from '../../components/ui/Status'
import { BookCell } from '../../components/books/BookCover'
import { ShelfFilter } from '../../components/inventory/Filters'
import { downloadCsv, formatDateTime, formatTime, timeAgo } from '../../utils/format'

export default function LiveInventory() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('live,out_of_stock')
  const [shelf, setShelf] = useState('')
  const [author, setAuthor] = useState('')
  const [sort, setSort] = useState('title')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [retrying, setRetrying] = useState('')
  const dq = useDebounce(q)
  const shop = useSelector(() => selectors.shopify())
  const statuses = status.split(',')
  const { data, loading, error, reload, refreshing } = useQuery(
    () => listItems({ statuses, q: dq, shelf, author, sort, page, pageSize }),
    [dq, status, shelf, author, sort, page, pageSize],
  )
  const { data: authors } = useQuery(() => getAuthors(['live', 'out_of_stock']), [])
  useTicker()
  const r1 = (fn) => (v) => {
    fn(v?.target ? v.target.value : v)
    setPage(1)
  }

  const exportCsv = async () => {
    const all = await listItems({ statuses, q: dq, shelf, author, sort, page: 1, pageSize: 10_000 })
    downloadCsv(
      'bookhero-live-inventory.csv',
      all.rows.map((r) => ({ Title: r.title, Author: r.author, ISBN: r.isbn, Shelf: r.shelfId, Quantity: r.stock, Status: r.status, 'Shopify product': r.productId, 'Last sync': formatDateTime(r.lastSync) })),
    )
  }

  const columns = [
    { key: 'book', header: 'Book', card: 'title', render: (r) => <BookCell item={r} sub={r.author} /> },
    { key: 'author', header: 'Author', card: 'hide', render: (r) => <span className="td-clip">{r.author}</span> },
    { key: 'isbn', header: 'ISBN', card: 'meta', render: (r) => <span className="td-mono">{r.isbn}</span> },
    { key: 'shelf', header: 'Active shelf', card: 'meta', render: (r) => <ShelfTag id={r.shelfId} size="sm" /> },
    { key: 'qty', header: 'Qty', align: 'right', card: 'meta', render: (r) => <span className={`num td-strong${r.stock === 0 ? ' is-zero' : ''}`}>{r.stock}</span> },
    {
      key: 'sync',
      header: 'Shopify',
      card: 'meta',
      render: (r) =>
        r.syncStatus === 'failed' ? (
          <span className="sync-cell">
            <SyncChip status="failed" />
            <button
              className="linkbtn"
              disabled={retrying === r.id}
              onClick={async (e) => {
                e.stopPropagation()
                setRetrying(r.id)
                await retrySync(r.id)
                setRetrying('')
                toast({ title: 'Sync retried', description: `${r.title} synced with Shopify.` })
              }}
            >
              <RefreshCw size={12} className={retrying === r.id ? 'spin' : ''} aria-hidden /> Retry
            </button>
          </span>
        ) : (
          <SyncChip status={retrying === r.id ? 'syncing' : r.syncStatus} />
        ),
    },
    { key: 'last', header: 'Last sync', card: 'meta', render: (r) => <span className="td-muted" title={formatDateTime(r.lastSync)}>{timeAgo(r.lastSync)}</span> },
    { key: 'status', header: 'Status', card: 'badge', render: (r) => <StatusChip status={r.status} size="sm" /> },
  ]

  return (
    <div>
      <PageHeader
        title="Live inventory"
        description="Books approved and listed on Shopify. Quantities come from the scheduled stock check."
        actions={
          <Button icon={Download} onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />
      <div className="syncstrip">
        <span className="syncstrip__store">
          <span className="live-dot" aria-hidden /> {shop.storeName}
        </span>
        <span>Connected</span>
        <span>
          Last inventory sync <strong className="num">{formatTime(shop.lastPollAt)}</strong>
        </span>
        <span>Stock check every {shop.pollMinutes} min</span>
        <span>Sync health: Healthy</span>
        <span className="syncstrip__mock">Demo / mock integration</span>
      </div>
      <div className="toolbar">
        <SearchInput value={q} onChange={r1(setQ)} placeholder="Search title, author, ISBN or shelf" />
        <Select value={status} onChange={r1(setStatus)} aria-label="Status">
          <option value="live,out_of_stock">Live + out of stock</option>
          <option value="live">Live only</option>
          <option value="out_of_stock">Out of stock</option>
        </Select>
        <ShelfFilter value={shelf} onChange={r1(setShelf)} />
        <Select value={author} onChange={r1(setAuthor)} aria-label="Author" className="select--author">
          <option value="">All authors</option>
          {authors?.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <span className="toolbar__spacer" />
        <Select value={sort} onChange={r1(setSort)} aria-label="Sort">
          <option value="title">Title A–Z</option>
          <option value="newest">Recently added</option>
          <option value="stock">Lowest stock</option>
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={data?.rows}
        loading={loading}
        error={error}
        onRetry={reload}
        refreshing={refreshing}
        onRowClick={(r) => navigate(`/admin/books/${r.id}`)}
        caption="Live inventory"
        dense
        empty={
          <EmptyState art="search" title="No books found">
            No live books match these filters.
          </EmptyState>
        }
      />
      {data && (
        <div className="pager-row">
          <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} />
          <Select value={pageSize} onChange={(e) => r1(setPageSize)(Number(e.target.value))} aria-label="Rows per page" className="select--sm">
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  )
}
