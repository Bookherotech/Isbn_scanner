import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listItems } from '../../services/mockApi'
import { useDebounce, useQuery, useTicker } from '../../hooks/useStore'
import { DataTable, Pagination } from '../../components/ui/Data'
import { PageHeader } from '../../components/ui/Misc'
import { SearchInput } from '../../components/ui/Form'
import { EmptyState } from '../../components/ui/Feedback'
import { ShelfTag, StatusChip } from '../../components/ui/Status'
import { BookCell } from '../../components/books/BookCover'
import { Person, ShelfFilter, StaffFilter } from '../../components/inventory/Filters'
import { formatDateTime, timeAgo } from '../../utils/format'

export default function Approved() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [shelf, setShelf] = useState('')
  const [staff, setStaff] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounce(q)
  const { data, loading, error, reload, refreshing } = useQuery(
    () => listItems({ statuses: ['live', 'out_of_stock', 'closed'], approvedOnly: true, q: dq, shelf, staff, sort: 'approved', page, pageSize: 20 }),
    [dq, shelf, staff, page],
  )
  useTicker()
  const r1 = (fn) => (v) => {
    fn(v)
    setPage(1)
  }

  const columns = [
    { key: 'book', header: 'Book', card: 'title', render: (r) => <BookCell item={r} /> },
    { key: 'shelf', header: 'Shelf', card: 'meta', render: (r) => <ShelfTag id={r.shelfId} size="sm" variant={r.status === 'closed' ? 'muted' : 'solid'} /> },
    { key: 'qty', header: 'Approved qty', align: 'right', card: 'meta', render: (r) => <span className="num td-strong">{r.quantity}</span> },
    { key: 'by', header: 'Submitted by', card: 'meta', render: (r) => <Person id={r.submittedBy} name={r.submittedByName} /> },
    { key: 'approved', header: 'Approved', card: 'meta', render: (r) => <span className="td-muted" title={formatDateTime(r.approvedAt)}>{timeAgo(r.approvedAt)}</span> },
    { key: 'product', header: 'Shopify product', card: 'meta', render: (r) => <span className="td-mono">#{r.productId}</span> },
    { key: 'status', header: 'Now', card: 'badge', render: (r) => <StatusChip status={r.status} size="sm" /> },
  ]

  return (
    <div>
      <PageHeader title="Approved" description="Approval history — every book an admin approved, with its current state on Shopify." />
      <div className="toolbar">
        <SearchInput value={q} onChange={r1(setQ)} placeholder="Search title, author, ISBN or shelf" />
        <ShelfFilter value={shelf} onChange={r1(setShelf)} />
        <StaffFilter value={staff} onChange={r1(setStaff)} />
      </div>
      <DataTable
        columns={columns}
        rows={data?.rows}
        loading={loading}
        error={error}
        onRetry={reload}
        refreshing={refreshing}
        onRowClick={(r) => navigate(`/admin/books/${r.id}`)}
        caption="Approved books"
        empty={<EmptyState art="search" title="No approved books found">Try a different search or filter.</EmptyState>}
      />
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="approvals" />}
    </div>
  )
}
