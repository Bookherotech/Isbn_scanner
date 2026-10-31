import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, Check, Hourglass, Store, X } from 'lucide-react'
import { approveWaitingEntry, getWaitingList, rejectItem } from '../../services/adminApi'
import { useNavCounts } from '../../hooks/useNavCounts'
import { useAutoRefresh, useQuery, useTicker } from '../../hooks/useStore'
import { OutOfStockBoard } from '../../components/inventory/OutOfStockBoard'
import { useToast } from '../../hooks/useToast'
import { DataTable } from '../../components/ui/Data'
import { Menu, MenuItem, PageHeader } from '../../components/ui/Misc'
import { Segmented } from '../../components/ui/Form'
import { Button } from '../../components/ui/Button'
import { EmptyState, StageList, useStages } from '../../components/ui/Feedback'
import { Drawer } from '../../components/ui/Overlay'
import { ShelfTag, StatusChip } from '../../components/ui/Status'
import { BookCell, BookCover } from '../../components/books/BookCover'
import { Person } from '../../components/inventory/Filters'
import { cn, formatDateTime, formatTime, timeAgo } from '../../utils/format'

export default function WaitingList() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'ready'
  const oosCount = useNavCounts().oos
  const { data, loading, error, reload, refresh, refreshing } = useQuery(() => getWaitingList(), [])
  useAutoRefresh(refresh)
  useTicker()
  const reviewId = params.get('review')
  const [picked, setPicked] = useState({}) // book key -> the waiting entry (shelf) chosen in its drop-down
  const books = data ?? []
  const ready = books.filter((g) => g.ready)
  const waiting = books.filter((g) => !g.ready)
  const effectiveTab = tab === 'ready' && data && ready.length === 0 && waiting.length > 0 && !params.get('tab') ? 'waiting' : tab
  const shown = effectiveTab === 'ready' ? ready : effectiveTab === 'waiting' ? waiting : books
  const open = (id) => setParams({ review: id })

  // The entry a book's row shows: the shelf the admin picked, else the one opened from a link, else the oldest ready one, else the oldest.
  const entryOf = (g) => g.entries.find((e) => e.id === picked[g.key]) ?? g.entries.find((e) => String(e.id) === reviewId) ?? g.entries.find((e) => e.ready) ?? g.entries[0]
  const rows = shown.map((g) => {
    const entry = entryOf(g)
    return { ...entry, group: g, __highlight: String(entry.id) === reviewId }
  })
  const reviewing = books.flatMap((g) => g.entries).find((e) => String(e.id) === reviewId) || null

  const columns = [
    { key: 'book', header: 'Book', card: 'title', render: (r) => <BookCell item={r} /> },
    {
      key: 'current',
      header: 'Current shelf',
      card: 'meta',
      render: (r) => (
        <span className="cell-stack">
          <ShelfTag id={r.linked.shelfId} size="sm" variant={r.ready ? 'muted' : 'solid'} />
          <span className={cn('cell-note num', r.ready && 'is-warn')}>{r.ready ? 'Sold out' : `${r.linked.stock} left`}</span>
        </span>
      ),
    },
    {
      key: 'waiting',
      header: 'Waiting shelf',
      card: 'meta',
      render: (r) =>
        r.group.entries.length > 1 ? (
          <span onClick={(e) => e.stopPropagation()}>
            <Menu
              align="start"
              className="shelf-menu"
              trigger={({ open, toggle, props }) => (
                <button type="button" className={cn('shelf-switch', open && 'is-open')} onClick={toggle} aria-label={`Waiting shelf for ${r.title}: ${r.shelfId}. Change shelf`} {...props}>
                  <ShelfTag id={r.shelfId} size="sm" variant="outline" />
                </button>
              )}
            >
              {r.group.entries.map((e) => (
                <MenuItem key={e.id} aria-current={e.id === r.id} onClick={() => setPicked((p) => ({ ...p, [r.group.key]: e.id }))}>
                  <ShelfTag id={e.shelfId} size="sm" variant={e.id === r.id ? 'solid' : 'outline'} />
                </MenuItem>
              ))}
            </Menu>
          </span>
        ) : (
          <ShelfTag id={r.shelfId} size="sm" variant="outline" />
        ),
    },
    { key: 'qty', header: 'Qty', align: 'right', card: 'meta', render: (r) => <span className="num td-strong">{r.quantity}</span> },
    { key: 'by', header: 'Submitted by', card: 'meta', render: (r) => <Person id={r.submittedBy} name={r.submittedByName} /> },
    { key: 'at', header: 'Submitted', card: 'meta', render: (r) => <span className="td-muted" title={formatDateTime(r.submittedAt)}>{timeAgo(r.submittedAt)}</span> },
    { key: 'status', header: 'Status', card: 'badge', render: (r) => <StatusChip status="waiting" ready={r.ready} size="sm" /> },
    {
      key: 'action',
      header: '',
      align: 'right',
      card: 'action',
      render: (r) =>
        r.ready ? (
          <Button size="sm" variant="primary" onClick={() => open(r.id)}>
            Review &amp; approve
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => open(r.id)}>
            Details
          </Button>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Waiting list & stock"
        description="The same title + author is already on another shelf. When that stock sells out, the entry becomes Ready for approval — approving adds its quantity to the same Shopify product and makes its shelf active. Sold-out books are under Out of stock."
      />
      <div className="flowstrip" aria-label="How the waiting list works">
        <span>
          <Hourglass size={14} aria-hidden /> Waiting
        </span>
        <span className="flowstrip__arrow" aria-hidden />
        <span>Stock check finds 0 on Shopify</span>
        <span className="flowstrip__arrow" aria-hidden />
        <span className="flowstrip__hl">Ready for approval · admin notified</span>
        <span className="flowstrip__arrow" aria-hidden />
        <span>Admin approves</span>
        <span className="flowstrip__arrow" aria-hidden />
        <span>+qty on same product · shelf switches</span>
      </div>
      <div className="toolbar">
        <Segmented
          label="Waiting list filter"
          value={effectiveTab}
          onChange={(v) => setParams(v === 'ready' ? {} : { tab: v })}
          options={[
            { value: 'ready', label: 'Ready for approval', count: data ? ready.length : null },
            { value: 'waiting', label: 'Waiting for sell-out', count: data ? waiting.length : null },
            { value: 'all', label: 'All waiting', count: data ? data.length : null },
            { value: 'stock', label: 'Out of stock', count: oosCount },
          ]}
        />
      </div>
      {effectiveTab === 'stock' ? (
        <OutOfStockBoard />
      ) : (
      <DataTable
        columns={columns}
        rows={data ? rows : undefined}
        loading={loading}
        error={error}
        onRetry={reload}
        refreshing={refreshing}
        onRowClick={(r) => open(r.id)}
        caption="Waiting-list entries"
        empty={
          <EmptyState art="shelf" title={effectiveTab === 'ready' ? 'Nothing ready for approval' : 'No waiting-list entries'}>
            {effectiveTab === 'ready'
              ? 'Entries become ready when the current shelf sells out on Shopify. You’ll get a push notification.'
              : 'When staff submit a book that already exists on another shelf, it waits here.'}
          </EmptyState>
        }
      />
      )}
      <WaitingDrawer entry={reviewing} onClose={() => setParams(effectiveTab === 'ready' ? {} : { tab: effectiveTab })} />
    </div>
  )
}

function WaitingDrawer({ entry, onClose }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const stages = useStages()
  const [result, setResult] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const shown = result || entry
  const open = !!shown

  const close = () => {
    stages.reset()
    setResult(null)
    onClose()
  }

  if (!open) return null
  const e = shown
  const from = result ? result.previousShelfId : e.linked?.shelfId
  const productId = result ? result.productId : e.linked?.productId
  const phase = result ? 'done' : stages.active ? 'running' : 'idle'

  const approve = async () => {
    try {
      const res = await stages.run(
        [`Adding ${e.quantity} units to Shopify product${productId ? ` #${productId}` : ''}`, `Switching active shelf ${from} → ${e.shelfId}`, `Closing shelf ${from} entry`, `Live on ${e.shelfId}`],
        () => approveWaitingEntry(e.id),
        { stepMs: 380 },
      )
      setResult(res)
      toast({ title: `${e.title} is live on ${e.shelfId}`, description: `${e.quantity} units added to the same Shopify product.` })
    } catch (err) {
      toast({ title: 'Couldn’t approve', description: err.message, tone: 'error' })
      stages.reset()
    }
  }

  return (
    <Drawer
      open
      onClose={close}
      title={result ? 'Waiting list approved' : 'Review waiting-list entry'}
      subtitle={e.title}
      width={560}
      footer={
        result ? (
          <>
            <Button onClick={() => navigate(`/admin/books/${result.id}`)}>View book</Button>
            <Button variant="dark" onClick={close}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger-ghost" icon={X} loading={rejecting} disabled={stages.active} onClick={async () => {
              setRejecting(true)
              await rejectItem(e.id, { reason: 'Other', note: 'Waiting-list entry removed by admin.' })
              setRejecting(false)
              toast({ title: 'Waiting-list entry rejected', tone: 'info' })
              close()
            }}>
              Reject entry
            </Button>
            <span style={{ flex: 1 }} />
            <Button variant="primary" icon={Check} onClick={approve} disabled={!e.ready || stages.active} loading={stages.active}>
              Approve &amp; switch shelf
            </Button>
          </>
        )
      }
    >
      <div className="wl">
        <div className="wl__book">
          <BookCover title={e.title} author={e.author} isbn={e.isbn} size="md" />
          <div>
            <strong className="serif">{e.title}</strong>
            <span>{e.author}</span>
            <span className="mono muted">{e.isbn}</span>
          </div>
          <StatusChip status={result ? 'live' : 'waiting'} ready={e.ready} />
        </div>

        <div className={cn('transfer', `is-${phase}`)}>
          <div className="transfer__product">
            <Store size={16} aria-hidden />
            <span>
              Shopify product <span className="mono">{productId ? `#${productId}` : '—'}</span>
            </span>
            <em>same product — no new listing</em>
          </div>
          <div className="transfer__lanes">
            <div className="transfer__shelf transfer__shelf--from">
              <span className="transfer__lbl">{phase === 'done' ? 'Closed' : 'Current shelf'}</span>
              <ShelfTag id={from} size="lg" variant={phase === 'done' || e.ready ? 'muted' : 'solid'} strike={phase === 'done'} />
              <span className="transfer__qty num">{e.ready || phase === 'done' ? '0 left · sold out' : `${e.linked.stock} left on Shopify`}</span>
            </div>
            <div className="transfer__arrow" aria-hidden>
              <ArrowDown size={18} />
            </div>
            <div className="transfer__shelf transfer__shelf--to">
              <span className="transfer__lbl">{phase === 'done' ? 'Active shelf' : 'Waiting shelf'}</span>
              <ShelfTag id={e.shelfId} size="lg" variant={phase === 'done' ? 'solid' : 'outline'} />
              <span className="transfer__qty num">{phase === 'done' ? `${e.quantity} units live` : `+${e.quantity} units on approval`}</span>
            </div>
          </div>
        </div>

        {stages.labels.length > 0 && !result && (
          <div className="processing processing--inline">
            <StageList {...stages} />
          </div>
        )}

        {result ? (
          <div className="callout callout--ok">
            <Check size={16} aria-hidden />
            <p>
              Quantity added to the <strong>same Shopify product</strong>. Shelf <strong>{from}</strong> is closed and <strong>{e.shelfId}</strong> is now the active shelf. The 24-hour reminder is cancelled.
            </p>
          </div>
        ) : !e.ready ? (
          <div className="callout callout--note">
            <Hourglass size={16} aria-hidden />
            <p>
              Waiting for shelf <strong>{from}</strong> to sell out ({e.linked.stock} left). The stock check runs every 10 minutes; you’ll get a push when it reaches 0.
            </p>
          </div>
        ) : null}

        <dl className="wl__facts">
          <div>
            <dt>Submitted by</dt>
            <dd>
              <Person id={e.submittedBy} name={e.submittedByName} />
            </dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{formatDateTime(e.submittedAt)}</dd>
          </div>
          {e.linked?.stockOutAt && (
            <div>
              <dt>Stock-out detected</dt>
              <dd>
                {formatTime(e.linked.stockOutAt)} · {timeAgo(e.linked.stockOutAt)}
              </dd>
            </div>
          )}
          <div>
            <dt>Admin notified</dt>
            <dd>{e.ready ? 'Push sent to admin + staff' : 'When stock reaches 0'}</dd>
          </div>
        </dl>
      </div>
    </Drawer>
  )
}
