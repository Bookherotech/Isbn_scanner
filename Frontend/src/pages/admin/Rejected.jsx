import { useState } from 'react'
import { getRejectionReasons, listItems } from '../../services/adminApi'
import { useDebounce, useQuery, useTicker } from '../../hooks/useStore'
import { DataTable, Pagination } from '../../components/ui/Data'
import { PageHeader } from '../../components/ui/Misc'
import { SearchInput, Select } from '../../components/ui/Form'
import { EmptyState } from '../../components/ui/Feedback'
import { Drawer } from '../../components/ui/Overlay'
import { ShelfTag } from '../../components/ui/Status'
import { BookCell } from '../../components/books/BookCover'
import { Person } from '../../components/inventory/Filters'
import { formatDateTime, timeAgo } from '../../utils/format'

export default function Rejected() {
  const [q, setQ] = useState('')
  const [reason, setReason] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(null)
  const dq = useDebounce(q)
  const { data, loading, error, reload, refreshing } = useQuery(
    () => listItems({ statuses: ['rejected'], q: dq, reason, sort: 'rejected', page, pageSize: 20 }),
    [dq, reason, page],
  )
  const { data: reasons } = useQuery(() => getRejectionReasons(), [], { mock: false })
  useTicker()

  const rejectedBy = (r) => (r.rejectedBy === 'system' ? 'System' : <Person id={r.rejectedBy} name={r.rejectedByName} />)

  const columns = [
    { key: 'book', header: 'Book', card: 'title', render: (r) => <BookCell item={r} /> },
    { key: 'shelf', header: 'Shelf', card: 'meta', render: (r) => <ShelfTag id={r.shelfId} size="sm" variant="muted" /> },
    { key: 'qty', header: 'Qty', align: 'right', card: 'meta', render: (r) => <span className="num">{r.quantity}</span> },
    {
      key: 'reason',
      header: 'Reason',
      card: 'badge',
      render: (r) => (
        <span className="reason-cell">
          <strong>{r.rejectReason}</strong>
          {r.rejectNote && <span className="muted td-clip">{r.rejectNote}</span>}
        </span>
      ),
    },
    { key: 'rejby', header: 'Rejected by', card: 'meta', render: rejectedBy },
    { key: 'sub', header: 'Submitted by', card: 'meta', render: (r) => <Person id={r.submittedBy} name={r.submittedByName} /> },
    { key: 'at', header: 'Rejected', card: 'meta', render: (r) => <span className="td-muted" title={formatDateTime(r.rejectedAt)}>{timeAgo(r.rejectedAt)}</span> },
  ]

  return (
    <div>
      <PageHeader title="Rejected" description="Books an admin rejected during review, with the reason given." />
      <div className="toolbar">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v)
            setPage(1)
          }}
          placeholder="Search title, author, ISBN or shelf"
        />
        <Select
          value={reason}
          onChange={(e) => {
            setReason(e.target.value)
            setPage(1)
          }}
          aria-label="Rejection reason"
        >
          <option value="">All</option>
          {reasons?.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={data?.rows}
        loading={loading}
        error={error}
        onRetry={reload}
        refreshing={refreshing}
        onRowClick={(r) => setOpen(r)}
        caption="Rejected submissions"
        empty={<EmptyState art="check" title="No rejected books">Nothing has been rejected{dq || reason ? ' for this search' : ''}.</EmptyState>}
      />
      {data && data.total > 0 && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="rejections" />}

      <Drawer open={!!open} onClose={() => setOpen(null)} title="Rejected submission" subtitle={open?.title} width={540}>
        {open && (
          <div className="rej">
            <BookCell item={open} size="sm" />
            <dl className="wl__facts">
              <div>
                <dt>Reason</dt>
                <dd>
                  <strong>{open.rejectReason}</strong>
                </dd>
              </div>
              <div>
                <dt>Rejected</dt>
                <dd>{formatDateTime(open.rejectedAt)}</dd>
              </div>
              <div>
                <dt>Shelf · qty</dt>
                <dd>
                  <ShelfTag id={open.shelfId} size="sm" /> · {open.quantity}
                </dd>
              </div>
              <div>
                <dt>Submitted by</dt>
                <dd>
                  <Person id={open.submittedBy} name={open.submittedByName} />
                </dd>
              </div>
            </dl>
            {open.rejectNote && <p className="rej__note">“{open.rejectNote}”</p>}
          </div>
        )}
      </Drawer>
    </div>
  )
}
