import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Flag, Pencil, Plus, ShieldCheck, Tag, X } from 'lucide-react'
import { getFlagCategories, getFlaggedItems, reviewFlag, saveFlagCategory, setFlagCategoryEnabled } from '../../services/mockApi'
import { useQuery, useTicker } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { DataTable } from '../../components/ui/Data'
import { PageHeader } from '../../components/ui/Misc'
import { Field, Input, Segmented, Select, Textarea } from '../../components/ui/Form'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { Modal } from '../../components/ui/Overlay'
import { FlagChips, ShelfTag, StatusChip } from '../../components/ui/Status'
import { BookCell } from '../../components/books/BookCover'
import { Person } from '../../components/inventory/Filters'
import { cn, timeAgo } from '../../utils/format'

export default function Flags() {
  const [tab, setTab] = useState('review')
  const [category, setCategory] = useState('')
  const cats = useQuery(() => getFlagCategories(), [])
  const items = useQuery(() => getFlaggedItems({ tab: tab === 'categories' ? 'all' : tab, category }), [tab, category])
  const counts = items.data?.counts

  return (
    <div>
      <PageHeader
        title="Content flags"
        eyebrow="Inventory"
        description="Admin-defined categories matched against each book’s subjects and title. “Hold for review” sends matching books here before approval; “Label only” just tags them. A flag never rejects a book — the admin decides."
      />
      <div className="toolbar">
        <Segmented
          label="Flags view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'review', label: 'Needs review', count: counts?.review },
            { value: 'reviewed', label: 'Reviewed & labelled', count: counts?.reviewed },
            { value: 'categories', label: 'Categories', count: cats.data?.length },
          ]}
        />
        {tab !== 'categories' && cats.data && (
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {cats.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      {tab === 'categories' ? <Categories query={cats} /> : <FlaggedBooks query={items} tab={tab} />}
    </div>
  )
}

function FlaggedBooks({ query, tab }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [busy, setBusy] = useState('')
  useTicker()
  const { data, loading, error, reload, refreshing } = query

  const columns = [
    { key: 'book', header: 'Book', width: '24%', card: 'title', render: (r) => <BookCell item={r} /> },
    { key: 'flags', header: 'Flags', card: 'meta', render: (r) => <FlagChips flags={r.flags} size="sm" reviewed={!r.flagHold} /> },
    {
      key: 'matched',
      header: 'Matched on',
      card: 'meta',
      render: (r) => <span className="td-muted td-clip">{[...new Set(r.flags.map((f) => f.matched))].join(', ')}</span>,
    },
    { key: 'shelf', header: 'Shelf', card: 'meta', render: (r) => <ShelfTag id={r.shelfId} size="sm" /> },
    { key: 'by', header: 'Submitted by', card: 'meta', render: (r) => <Person id={r.submittedBy} name={r.submittedByName} /> },
    {
      key: 'review',
      header: tab === 'review' ? 'Submitted' : 'Reviewed',
      card: 'meta',
      render: (r) =>
        r.flagReviewedAt ? (
          <span className="td-muted" title={`${r.flagReviewedByName} · ${r.flagNote}`}>
            {timeAgo(r.flagReviewedAt)}
          </span>
        ) : r.flagHold ? (
          <span className="td-muted">{timeAgo(r.submittedAt)}</span>
        ) : (
          <span className="td-muted">Label only</span>
        ),
    },
    { key: 'status', header: 'Status', card: 'badge', render: (r) => <StatusChip status={r.status} ready={r.ready} size="sm" /> },
    {
      key: 'action',
      header: '',
      align: 'right',
      card: 'action',
      render: (r) =>
        r.flagHold ? (
          <span className="row-actions">
            <Button
              size="sm"
              icon={Check}
              loading={busy === r.id}
              onClick={async () => {
                setBusy(r.id)
                await reviewFlag(r.id, 'Reviewed — fine to list')
                setBusy('')
                toast({ title: 'Flag reviewed', description: `“${r.title}” can continue to approval.` })
              }}
            >
              Mark reviewed
            </Button>
            {r.status === 'pending' && (
              <Button size="sm" variant="dark" onClick={() => navigate(`/admin/pending/${r.id}`)}>
                Open review
              </Button>
            )}
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => navigate(r.status === 'pending' ? `/admin/pending/${r.id}` : `/admin/books/${r.id}`)}>
            View
          </Button>
        ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={data?.rows}
      loading={loading}
      error={error}
      onRetry={reload}
      refreshing={refreshing}
      onRowClick={(r) => navigate(r.status === 'pending' ? `/admin/pending/${r.id}` : `/admin/books/${r.id}`)}
      caption="Flagged books"
      empty={
        tab === 'review' ? (
          <EmptyState art="check" title="No flagged books waiting">
            Books matching a “Hold for review” category will appear here when staff submit them.
          </EmptyState>
        ) : (
          <EmptyState art="search" title="No flagged books">
            No books currently match an enabled flag category.
          </EmptyState>
        )
      }
    />
  )
}

function Categories({ query }) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(null)
  const { data, loading, error, reload } = query
  if (loading) return <Skeleton h={320} r={10} />
  if (error) return <ErrorState error={error} onRetry={reload} />
  return (
    <>
      <div className="flagcats">
        {data.map((c) => (
          <article key={c.id} className={cn('flagcat', !c.enabled && 'is-off')} style={{ '--fh': c.hue }}>
            <header className="flagcat__head">
              <span className="flagcat__icon" aria-hidden>
                <Flag size={16} />
              </span>
              <div>
                <h3>{c.name}</h3>
                <span className={cn('flagcat__mode', c.mode === 'hold' ? 'is-hold' : 'is-label')}>
                  {c.mode === 'hold' ? <ShieldCheck size={12} aria-hidden /> : <Tag size={12} aria-hidden />}
                  {c.mode === 'hold' ? 'Hold for review' : 'Label only'}
                </span>
              </div>
              <label className="switch" title={c.enabled ? 'Disable category' : 'Enable category'}>
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={async (e) => {
                    await setFlagCategoryEnabled(c.id, e.target.checked)
                    toast({ title: `${c.name} ${e.target.checked ? 'enabled' : 'disabled'}`, tone: 'info', duration: 2200 })
                  }}
                  aria-label={`${c.name} enabled`}
                />
                <span aria-hidden />
              </label>
            </header>
            {c.description && <p className="flagcat__desc">{c.description}</p>}
            <ul className="flagcat__keys" aria-label="Keywords">
              {c.keywords.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
            <footer className="flagcat__foot">
              <span>
                {c.enabled ? `${c.matches} book${c.matches === 1 ? '' : 's'} match` : `Would match ${c.matches}`}
                {c.awaiting > 0 && <strong> · {c.awaiting} awaiting review</strong>}
              </span>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(c)}>
                Edit
              </Button>
            </footer>
          </article>
        ))}
        <button className="flagcat flagcat--add" onClick={() => setEditing({})}>
          <Plus size={20} aria-hidden />
          <strong>Add category</strong>
          <span>Match by subject keywords, e.g. “true crime”, “erotica”</span>
        </button>
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit “${editing.name}”` : 'Add flag category'} description="Keywords are matched against the subjects returned by Google Books / Open Library and the title." size="md">
        {editing && <CategoryForm key={editing.id || 'new'} cat={editing} onClose={() => setEditing(null)} onSaved={(name) => toast({ title: editing.id ? 'Category updated' : `${name} added`, description: 'Applied to all current and new books.' })} />}
      </Modal>
    </>
  )
}

function CategoryForm({ cat, onClose, onSaved }) {
  const [name, setName] = useState(cat.name || '')
  const [description, setDescription] = useState(cat.description || '')
  const [keywords, setKeywords] = useState(cat.keywords || [])
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState(cat.mode || 'hold')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const addKeyword = () => {
    const parts = draft.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
    if (parts.length) setKeywords((k) => [...new Set([...k, ...parts])])
    setDraft('')
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await saveFlagCategory({ id: cat.id, name, description, keywords: [...keywords, ...draft.split(',')], mode, enabled: cat.enabled ?? true })
      onSaved(name)
      onClose()
    } catch (x) {
      setErr(x.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <Field label="Category name" htmlFor="fc-name">
        <Input id="fc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Graphic violence" data-autofocus />
      </Field>
      <Field label="Description" optional htmlFor="fc-desc">
        <Textarea id="fc-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this category covers" style={{ minHeight: 60 }} />
      </Field>
      <Field label="Keywords / subjects" htmlFor="fc-key" hint="Press Enter or comma to add. Whole-word, case-insensitive match." error={err}>
        <div className="keyinput">
          {keywords.map((k) => (
            <span key={k} className="keyinput__chip">
              {k}
              <button type="button" aria-label={`Remove ${k}`} onClick={() => setKeywords((x) => x.filter((y) => y !== k))}>
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            id="fc-key"
            value={draft}
            onChange={(e) => {
              const parts = e.target.value.split(',')
              if (parts.length > 1) {
                const done = parts.slice(0, -1).map((k) => k.trim().toLowerCase()).filter(Boolean)
                setKeywords((k) => [...new Set([...k, ...done])])
              }
              setDraft(parts[parts.length - 1])
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addKeyword()
              } else if (e.key === 'Backspace' && !draft && keywords.length) setKeywords((x) => x.slice(0, -1))
            }}
            onBlur={addKeyword}
            placeholder={keywords.length ? '' : 'e.g. lgbtq, queer'}
          />
        </div>
      </Field>
      <fieldset className="reasons">
        <legend className="field__label">When a book matches</legend>
        {[
          ['hold', 'Hold for review', 'Shows in Needs review; the admin marks it reviewed before or while approving.'],
          ['label', 'Label only', 'Adds a label to the book. No extra review step.'],
        ].map(([v, l, d]) => (
          <label key={v} className={cn('reason reason--two', mode === v && 'is-active')}>
            <input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} />
            <span className="reason__dot" aria-hidden />
            <span>
              <strong>{l}</strong>
              <em>{d}</em>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="form-actions">
        <span style={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="dark" loading={busy}>
          {cat.id ? 'Save category' : 'Add category'}
        </Button>
      </div>
    </form>
  )
}
