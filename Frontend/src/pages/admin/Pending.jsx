import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { listItems } from '../../services/mockApi'
import { useDebounce, useQuery, useTicker } from '../../hooks/useStore'
import { DataTable, Pagination } from '../../components/ui/Data'
import { PageHeader } from '../../components/ui/Misc'
import { SearchInput, Select } from '../../components/ui/Form'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/Feedback'
import { FlagChips, ShelfTag, StatusChip } from '../../components/ui/Status'
import { BookCell } from '../../components/books/BookCover'
import { SourceBadge } from '../../components/books/BookBits'
import { Person, ShelfFilter, StaffFilter } from '../../components/inventory/Filters'
import { formatDateTime, timeAgo } from '../../utils/format'

export default function Pending() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [shelf, setShelf] = useState('')
  const [staff, setStaff] = useState('')
  const [source, setSource] = useState('')
  const [sort, setSort] = useState('oldest')
  const [page, setPage] = useState(1)
  const dq = useDebounce(q)
  const { data, loading, error, reload, refreshing } = useQuery(
    () => listItems({ statuses: ['pending'], q: dq, shelf, staff, source, sort, page, pageSize: 15 }),
    [dq, shelf, staff, source, sort, page],
  )
  useTicker()
  const filtered = dq || shelf || staff || source
  const reset = (fn) => (v) => {
    fn(v)
    setPage(1)
  }

  const columns = [
    { key: 'book', header: 'Book', card: 'title', render: (r) => <BookCell item={r} sub={r.editedFields?.length ? `Staff edited ${r.editedFields.join(', ')}` : <SourceBadge source={r.source} className="source--bare" />} /> },
    { key: 'author', header: 'Author', card: 'meta', render: (r) => <span className="td-clip">{r.author}</span> },
    { key: 'isbn', header: 'ISBN', card: 'meta', render: (r) => <span className="td-mono">{r.isbn}</span> },
    { key: 'shelf', header: 'Shelf', card: 'meta', render: (r) => <ShelfTag id={r.shelfId} size="sm" /> },
    { key: 'qty', header: 'Qty', align: 'right', card: 'meta', render: (r) => <span className="num td-strong">{r.quantity}</span> },
    { key: 'by', header: 'Submitted by', card: 'meta', render: (r) => <Person id={r.submittedBy} name={r.submittedByName} /> },
    { key: 'at', header: 'Submitted', card: 'meta', render: (r) => <span className="td-muted" title={formatDateTime(r.submittedAt)}>{timeAgo(r.submittedAt)}</span> },
    {
      key: 'status',
      header: 'Status',
      card: 'badge',
      render: (r) => (
        <span className="cell-stack cell-stack--col">
          <StatusChip status="pending" size="sm" />
          {r.flagHold && <FlagChips flags={r.flags.filter((f) => f.mode === 'hold')} size="sm" max={1} />}
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      card: 'action',
      render: (r) => (
        <Button size="sm" variant="dark" iconRight={ArrowRight} onClick={() => navigate(`/admin/pending/${r.id}`)}>
          Review
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Pending review"
        description="Submitted by staff and passed the duplicate check (no same title + author on any shelf). Verify each book, edit if needed, then approve to create the Shopify product."
      />
      <div className="toolbar">
        <SearchInput value={q} onChange={reset(setQ)} placeholder="Search title, author, ISBN or shelf" />
        <ShelfFilter value={shelf} onChange={reset(setShelf)} />
        <StaffFilter value={staff} onChange={reset(setStaff)} />
        <Select value={source} onChange={(e) => reset(setSource)(e.target.value)} aria-label="Metadata source">
          <option value="">Any source</option>
          <option value="google">Google Books</option>
          <option value="openlibrary">Open Library</option>
          <option value="manual">Manual entry</option>
        </Select>
        <span className="toolbar__spacer" />
        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
          <option value="title">Title A–Z</option>
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={data?.rows}
        loading={loading}
        error={error}
        onRetry={reload}
        refreshing={refreshing}
        onRowClick={(r) => navigate(`/admin/pending/${r.id}`)}
        caption="Books pending review"
        empty={
          filtered ? (
            <EmptyState art="search" title="No books found" action={<Button onClick={() => { setQ(''); setShelf(''); setStaff(''); setSource('') }}>Clear filters</Button>}>
              No pending book matches these filters.
            </EmptyState>
          ) : (
            <EmptyState art="check" title="No books waiting for approval">
              Everything submitted by staff has been reviewed. New scans will appear here.
            </EmptyState>
          )
        }
      />
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="pending books" />}
    </div>
  )
}
