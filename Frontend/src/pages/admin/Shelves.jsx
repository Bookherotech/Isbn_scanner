import { useMemo, useState } from 'react'
import { LayoutGrid, Pencil, Plus, Power, Rows3 } from 'lucide-react'
import { getShelves, saveShelf, setShelfStatus } from '../../services/mockApi'
import { useDebounce, useQuery } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { DataTable } from '../../components/ui/Data'
import { PageHeader } from '../../components/ui/Misc'
import { Field, Input, SearchInput, Segmented } from '../../components/ui/Form'
import { Button, IconButton } from '../../components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { Modal } from '../../components/ui/Overlay'
import { ShelfTag } from '../../components/ui/Status'
import { cn, formatDate } from '../../utils/format'

export default function Shelves() {
  const { toast } = useToast()
  const [view, setView] = useState('map')
  const [q, setQ] = useState('')
  const dq = useDebounce(q, 150)
  const { data, loading, error, reload, refreshing } = useQuery(() => getShelves(), [])
  const [editing, setEditing] = useState(null) // null | {} (new) | shelf
  const [toggling, setToggling] = useState(null)

  const rows = useMemo(() => (data || []).filter((s) => !dq || s.code.toLowerCase().includes(dq.toLowerCase().trim()) || s.note?.toLowerCase().includes(dq.toLowerCase())), [data, dq])
  const zones = useMemo(() => {
    const z = {}
    for (const s of rows) (z[s.zone] ||= []).push(s)
    return Object.entries(z)
  }, [rows])
  const maxUnits = Math.max(1, ...(data || []).map((s) => s.units))
  const totals = data && { active: data.filter((s) => s.status === 'active').length, units: data.reduce((a, s) => a + s.units, 0) }

  const columns = [
    { key: 'code', header: 'Shelf', card: 'title', render: (s) => <ShelfTag id={s.code} variant={s.status === 'active' ? 'solid' : 'muted'} /> },
    { key: 'status', header: 'Status', card: 'badge', render: (s) => <span className={cn('state-pill', s.status === 'active' ? 'is-on' : 'is-off')}>{s.status === 'active' ? 'Active' : 'Inactive'}</span> },
    { key: 'titles', header: 'Books', align: 'right', card: 'meta', render: (s) => <span className="num">{s.titles}</span> },
    { key: 'units', header: 'Quantity', align: 'right', card: 'meta', render: (s) => <span className="num td-strong">{s.units}</span> },
    { key: 'waiting', header: 'Waiting', align: 'right', card: 'meta', render: (s) => <span className="num">{s.waiting || '—'}</span> },
    { key: 'note', header: 'Note', card: 'meta', render: (s) => <span className="td-muted td-clip">{s.note || '—'}</span> },
    { key: 'created', header: 'Created', card: 'meta', render: (s) => <span className="td-muted">{formatDate(s.createdAt, { year: 'numeric' })}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      card: 'action',
      render: (s) => (
        <span className="row-actions">
          <IconButton icon={Pencil} label={`Edit shelf ${s.code}`} size={15} onClick={() => setEditing(s)} />
          <IconButton icon={Power} label={s.status === 'active' ? `Deactivate shelf ${s.code}` : `Activate shelf ${s.code}`} size={15} onClick={() => setToggling(s)} />
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Shelves"
        eyebrow="Masters"
        description="Shelf numbers staff can choose when submitting a book. Inactive shelves are hidden from the staff shelf picker."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
            Add shelf
          </Button>
        }
      />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search shelf, e.g. B-0" />
        {totals && (
          <span className="toolbar__note">
            {totals.active} active shelves · {totals.units} units on Shopify
          </span>
        )}
        <span className="toolbar__spacer" />
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'map', label: <><LayoutGrid size={14} aria-hidden /> Rack map</> },
            { value: 'table', label: <><Rows3 size={14} aria-hidden /> Table</> },
          ]}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : view === 'map' ? (
        loading ? (
          <Skeleton h={360} r={10} />
        ) : rows.length === 0 ? (
          <EmptyState art="shelf" title="No shelves found">
            No shelf matches “{dq}”.
          </EmptyState>
        ) : (
          <div className={cn('rack', refreshing && 'is-refreshing')}>
            {zones.map(([zone, list]) => (
              <section key={zone} className="rack__zone" aria-label={`Zone ${zone}`}>
                <header className="rack__zone-head">
                  <span className="rack__zone-letter">{zone}</span>
                  <span>
                    Zone {zone} · {list.length} shelves · {list.reduce((a, s) => a + s.units, 0)} units
                  </span>
                </header>
                <div className="rack__shelves">
                  {list.map((s) => (
                    <button key={s.id} className={cn('rack__shelf', s.status !== 'active' && 'is-inactive')} onClick={() => setEditing(s)} aria-label={`Shelf ${s.code}, ${s.units} units, ${s.titles} books${s.status !== 'active' ? ', inactive' : ''}`}>
                      <span className="rack__code mono">{s.code}</span>
                      <span className="rack__books" aria-hidden>
                        {Array.from({ length: Math.min(12, s.titles) }, (_, i) => (
                          <i key={i} style={{ height: `${55 + ((i * 37 + s.code.charCodeAt(2) * 11) % 45)}%` }} />
                        ))}
                      </span>
                      <span className="rack__fill" aria-hidden>
                        <span style={{ width: `${(s.units / maxUnits) * 100}%` }} />
                      </span>
                      <span className="rack__meta num">
                        {s.status === 'active' ? `${s.units} units · ${s.titles} books` : 'Inactive'}
                        {s.waiting > 0 && <em> · {s.waiting} waiting</em>}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          refreshing={refreshing}
          caption="Shelves"
          empty={<EmptyState art="shelf" title="No shelves found">No shelf matches “{dq}”.</EmptyState>}
        />
      )}

      <ShelfDialog
        shelf={editing}
        onClose={() => setEditing(null)}
        onSaved={(code, isNew) => toast({ title: isNew ? `Shelf ${code} added` : `Shelf ${code} updated`, description: isNew ? 'Staff can select it right away.' : undefined })}
        onToggle={(s) => {
          setEditing(null)
          setToggling(s)
        }}
      />
      <Modal
        open={!!toggling}
        onClose={() => setToggling(null)}
        size="sm"
        title={toggling?.status === 'active' ? `Deactivate shelf ${toggling?.code}?` : `Activate shelf ${toggling?.code}?`}
        description={
          toggling?.status === 'active'
            ? `Staff will no longer see ${toggling?.code} in the shelf picker.${toggling?.units ? ` ${toggling.units} units currently on this shelf stay live on Shopify.` : ''}`
            : `${toggling?.code} will be available in the staff shelf picker again.`
        }
        footer={
          <>
            <Button onClick={() => setToggling(null)}>Cancel</Button>
            <Button
              variant={toggling?.status === 'active' ? 'danger' : 'dark'}
              icon={Power}
              onClick={async () => {
                const s = toggling
                await setShelfStatus(s.id, s.status === 'active' ? 'inactive' : 'active')
                setToggling(null)
                toast({ title: `Shelf ${s.code} ${s.status === 'active' ? 'deactivated' : 'activated'}`, tone: 'info' })
              }}
            >
              {toggling?.status === 'active' ? 'Deactivate' : 'Activate'}
            </Button>
          </>
        }
      />
    </div>
  )
}

function ShelfDialog({ shelf, onClose, onSaved, onToggle }) {
  const isNew = shelf && !shelf.id
  return (
    <Modal open={!!shelf} onClose={onClose} title={isNew ? 'Add shelf' : `Shelf ${shelf?.code ?? ''}`} description={isNew ? 'Shelf numbers use a zone letter and two digits.' : 'Shelf numbers can’t be renamed once books are assigned.'} size="sm">
      {shelf && <ShelfForm key={shelf.id || 'new'} shelf={shelf} isNew={isNew} onClose={onClose} onSaved={onSaved} onToggle={onToggle} />}
    </Modal>
  )
}

function ShelfForm({ shelf, isNew, onClose, onSaved, onToggle }) {
  const [code, setCode] = useState(shelf.code || '')
  const [note, setNote] = useState(shelf.note || '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await saveShelf({ id: shelf.id, code, note })
      onSaved(r.id, isNew)
      onClose()
    } catch (x) {
      setErr(x.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <Field label="Shelf number" htmlFor="shelf-code" error={err} hint={isNew ? 'e.g. A-13, B-09, D-01' : undefined}>
        <Input id="shelf-code" mono value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} disabled={!isNew} placeholder="A-13" maxLength={4} data-autofocus />
      </Field>
      <Field label="Note" optional htmlFor="shelf-note" hint="Visible to admins only.">
        <Input id="shelf-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bottom row, near packing desk" />
      </Field>
      {!isNew && (
        <dl className="kv kv--inline">
          <div>
            <dt>Books</dt>
            <dd className="num">{shelf.titles}</dd>
          </div>
          <div>
            <dt>Units</dt>
            <dd className="num">{shelf.units}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{shelf.status === 'active' ? 'Active' : 'Inactive'}</dd>
          </div>
        </dl>
      )}
      <div className="form-actions">
        {!isNew && (
          <Button variant="ghost" icon={Power} onClick={() => onToggle(shelf)}>
            {shelf.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
        )}
        <span style={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="dark" loading={busy}>
          {isNew ? 'Add shelf' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
