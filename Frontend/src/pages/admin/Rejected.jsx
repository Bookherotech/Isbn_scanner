import { useState } from 'react'
import { Bot } from 'lucide-react'
import { listItems } from '../../services/mockApi'
import { useDebounce, useQuery, useTicker } from '../../hooks/useStore'
import { DataTable, Pagination } from '../../components/ui/Data'
import { PageHeader } from '../../components/ui/Misc'
import { SearchInput, Segmented } from '../../components/ui/Form'
import { EmptyState } from '../../components/ui/Feedback'
import { Drawer } from '../../components/ui/Overlay'
import { ShelfTag } from '../../components/ui/Status'
import { BookCell } from '../../components/books/BookCover'
import { DuplicateExplainer } from '../../components/books/BookBits'
import { Person } from '../../components/inventory/Filters'
import { formatDateTime, timeAgo } from '../../utils/format'

export default function Rejected() {
  const [q, setQ] = useState('')
  const [by, setBy] = useState('all')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(null)
  const dq = useDebounce(q)
  const { data, loading, error, reload, refreshing } = useQuery(() => listItems({ statuses: ['rejected'], q: dq, sort: 'rejected', page: 1, pageSize: 500 }), [dq])
  useTicker()

  const all = data?.rows ?? []
  const auto = all.filter((r) => r.rejectedBy === 'system')
  const manual = all.filter((r) => r.rejectedBy !== 'system')
  const rows = by === 'system' ? auto : by === 'admin' ? manual : all
  const pageSize = 20
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const visible = rows.slice((page - 1) * pageSize, page * pageSize)

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
          {r.rejectedBy === 'system' ? <span className="muted">Already on {r.match?.shelfId} · qty {r.match?.quantity}</span> : r.rejectNote && <span className="muted td-clip">{r.rejectNote}</span>}
        </span>
      ),
    },
    {
      key: 'rejby',
      header: 'Rejected by',
      card: 'meta',
      render: (r) =>
        r.rejectedBy === 'system' ? (
          <span className="person">
            <span className="actor actor--system" style={{ width: 22, height: 22 }}>
              <Bot size={12} aria-hidden />
            </span>
            Duplicate check
          </span>
        ) : (
          <Person id={r.rejectedBy} name={r.rejectedByName} />
        ),
    },
    { key: 'sub', header: 'Submitted by', card: 'meta', render: (r) => <Person id={r.submittedBy} name={r.submittedByName} /> },
    { key: 'at', header: 'Rejected', card: 'meta', render: (r) => <span className="td-muted" title={formatDateTime(r.rejectedAt)}>{timeAgo(r.rejectedAt)}</span> },
  ]

  return (
    <div>
      <PageHeader title="Rejected" description="Auto-rejected by the duplicate check (same title + author already on the same shelf) or rejected by an admin during review." />
      <div className="toolbar">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search title, author, ISBN or shelf" />
        <Segmented
          label="Rejected by"
          value={by}
          onChange={(v) => {
            setBy(v)
            setPage(1)
          }}
          options={[
            { value: 'all', label: 'All', count: data ? all.length : null },
            { value: 'system', label: 'Duplicate check', count: data ? auto.length : null },
            { value: 'admin', label: 'Admin review', count: data ? manual.length : null },
          ]}
        />
      </div>
      <DataTable
        columns={columns}
        rows={visible}
        loading={loading}
        error={error}
        onRetry={reload}
        refreshing={refreshing}
        onRowClick={(r) => setOpen(r)}
        caption="Rejected submissions"
        empty={<EmptyState art="check" title="No rejected books">Nothing has been rejected{dq ? ' for this search' : ''}.</EmptyState>}
      />
      {data && rows.length > 0 && <Pagination page={page} pages={pages} total={rows.length} pageSize={pageSize} onPage={setPage} noun="rejections" />}

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
            {open.rejectedBy === 'system' && open.match && (
              <>
                <p className="result__strong">
                  Already added on Shelf {open.match.shelfId} with quantity {open.match.quantity}.
                </p>
                <DuplicateExplainer mine={open} match={open.match} />
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
