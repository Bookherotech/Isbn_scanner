import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Camera, Check, CircleAlert, Flag, Hourglass, PencilLine, RefreshCw, Save, ShieldCheck, Store, Trash2, X } from 'lucide-react'
import { approveItem, getFilterOptions, getGenres, getItem, listItems, refreshIsbnDetails, rejectItem, updateItem } from '../../services/adminApi'
import { useQuery, useTicker } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { BookCover } from '../../components/books/BookCover'
import { GenreFact, SourceBadge } from '../../components/books/BookBits'
import { FlagReviewCard } from '../../components/books/FlagReview'
import { Barcode } from '../../components/ui/Misc'
import { Button } from '../../components/ui/Button'
import { Field, Input, QuantityStepper, Select, ShelfPicker, Textarea } from '../../components/ui/Form'
import { GenrePicker } from '../../components/books/GenrePicker'
import { PhotoDrop } from '../../components/books/PhotoDrop'
import { FORMATS, useGenres, withCurrent } from '../../services/genres'
import { shrinkPhoto } from '../../services/photo'
import { ErrorState, Skeleton, StageList, useStages } from '../../components/ui/Feedback'
import { Modal } from '../../components/ui/Overlay'
import { ShelfTag, StatusChip } from '../../components/ui/Status'
import { Person } from '../../components/inventory/Filters'
import { cn, formatDateTime, formatPrice, PRICE_PATTERN, timeAgo } from '../../utils/format'

const FIELDS = ['isbn', 'title', 'author', 'publisher', 'year', 'pages', 'format', 'dimensions', 'price', 'description', 'genre', 'subgenres', 'language', 'shelfId', 'quantity']
const EDITABLE = ['pending', 'waiting'] // a waiting-list entry is edited here too; it is approved from the Waiting list
const REASONS = ['Incorrect metadata', 'Damaged book', 'Invalid shelf', 'Other']
const REFRESHABLE = ['title', 'author', 'publisher', 'year', 'pages', 'format', 'dimensions', 'description', 'language']
const LABEL = { isbn: 'ISBN', title: 'Title', author: 'Author', publisher: 'Publisher', year: 'Year', pages: 'Pages', format: 'Format', dimensions: 'Dimensions', price: 'Price', description: 'Description', photo: 'Photo', subgenres: 'Categories' }

export default function ReviewBook() {
  const { id } = useParams()
  const { data: item, loading, error, reload } = useQuery(() => getItem(id), [id])
  useTicker()

  if (loading) return <ReviewSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} title="Couldn’t open this submission" />
  return <ReviewBody key={item.id} item={item} />
}

function ReviewBody({ item }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: options } = useQuery(() => getFilterOptions(), [], { mock: false })
  const shelves = useMemo(() => (options?.shelves ?? []).filter((s) => s.status === 'active' || s.id === item.shelfId), [options, item.shelfId])
  const initial = useMemo(() => Object.fromEntries(FIELDS.map((k) => [k, item[k] ?? ''])), [item])
  const [values, setValues] = useState(initial)
  const genreLists = useGenres(getGenres)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [done, setDone] = useState(null)
  const [nextId, setNextId] = useState(null)
  const stages = useStages()
  const [photo, setPhoto] = useState(null) // null = unchanged, '' = remove, a JPEG data URL = new photo
  const [photoError, setPhotoError] = useState('')
  const waiting = item.status === 'waiting'

  const dirtyKeys = [...FIELDS.filter((k) => String(values[k]) !== String(initial[k])), ...(photo !== null ? ['coverPhoto'] : [])]
  const dirty = dirtyKeys.length > 0
  const priceError = String(values.price ?? '').trim() && !PRICE_PATTERN.test(String(values.price).trim()) ? 'Enter a price like 45 or 45.50' : ''
  const invalid = !String(values.title).trim() || !String(values.author).trim() || !values.shelfId || !Number(values.quantity) || Boolean(priceError)
  const set = (k) => (v) => {
    setConflict(null)
    setValues((s) => ({ ...s, [k]: v?.target ? v.target.value : v }))
  }

  useEffect(() => {
    listItems({ statuses: ['pending'], hideHeld: true, sort: 'oldest', pageSize: 50 }).then((r) => setNextId(r.rows.find((x) => x.id !== item.id)?.id ?? null))
  }, [item.id, done])

  // "Refresh details": the book sources again (not the saved lookup). Fills only empty fields, and a category the
  // fetched data adds to the same genre; the admin then checks the highlighted fields and saves.
  const [refreshing, setRefreshing] = useState(false)
  const refreshDetails = async () => {
    setRefreshing(true)
    try {
      const fresh = await refreshIsbnDetails(String(values.isbn).trim() || item.isbn)
      const empty = (v) => String(v ?? '').trim() === ''
      const next = { ...values }
      const changed = REFRESHABLE.filter((k) => empty(values[k]) && !empty(fresh[k]))
      changed.forEach((k) => (next[k] = fresh[k]))
      if (empty(values.genre) && fresh.genre) {
        Object.assign(next, { genre: fresh.genre, subgenres: fresh.subgenres })
        changed.push('genre')
      } else if (fresh.genre && fresh.genre.toLowerCase() === String(values.genre).toLowerCase()) {
        const have = values.subgenres || []
        const added = fresh.subgenres.filter((s) => !have.some((h) => h.toLowerCase() === s.toLowerCase()))
        if (added.length) {
          next.subgenres = [...have, ...added]
          changed.push('subgenres')
        }
      }
      setConflict(null)
      setValues(next)
      toast(
        changed.length
          ? { title: 'Details refreshed', description: `Filled ${changed.map((k) => (LABEL[k] || k).toLowerCase()).join(', ')}. Check them, then save.` }
          : { title: 'Nothing new found', description: 'The book sources have nothing for the empty fields. Fields already filled were kept.', tone: 'info' },
      )
    } catch (e) {
      toast({ title: 'Couldn’t refresh the details', description: e.message, tone: 'error' })
    } finally {
      setRefreshing(false)
    }
  }

  const patch = () =>
    Object.fromEntries(
      dirtyKeys.map((k) => [k, k === 'coverPhoto' ? photo : Array.isArray(values[k]) ? values[k] : k === 'quantity' || k === 'year' || k === 'pages' ? (values[k] === '' ? '' : Number(values[k])) : String(values[k]).trim()]),
    )

  const save = async () => {
    setSaving(true)
    try {
      const res = await updateItem(item.id, patch())
      setPhoto(null) // the saved photo now comes with the item
      handleOutcome(res)
      if (res.outcome === 'saved') toast({ title: 'Changes saved', description: res.changes.length ? `Updated ${res.changes.map((k) => LABEL[k] || (k === 'shelfId' ? 'shelf' : k)).join(', ')}.` : undefined })
      return res
    } catch (e) {
      if (e.code === 'duplicate_same_shelf') setConflict(e)
      else toast({ title: 'Couldn’t save', description: e.message, tone: 'error' })
      throw e
    } finally {
      setSaving(false)
    }
  }

  const handleOutcome = (res) => {
    if (res.outcome === 'moved_to_waiting') {
      toast({ title: 'Moved to waiting list', description: `Same title + author is already on ${res.match.shelfId}. This entry now waits for that stock to sell out.`, tone: 'warning' })
      navigate('/admin/waiting-list')
    }
    if (res.outcome === 'moved_to_pending') {
      toast({ title: 'Moved to pending', description: 'No other copy of this title + author is active any more, so the entry can be approved now.', tone: 'info' })
    }
  }

  const choosePhoto = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // the same file can be chosen again
    if (file) takePhoto(file)
  }
  const takePhoto = async (file) => {
    setPhotoError('')
    try {
      setPhoto(await shrinkPhoto(file))
    } catch (error) {
      setPhotoError(error.message)
    }
  }
  const shownPhoto = photo === null ? item.coverPhotoUrl : photo || null
  const canRemovePhoto = photo ? true : photo === null && item.hasPhoto

  const approve = async () => {
    if (invalid) return
    try {
      if (dirty) {
        const r = await save()
        if (r.outcome !== 'saved') return
      }
    } catch {
      return
    }
    try {
      const res = await stages.run(['Approving', 'Creating Shopify product', 'Updating inventory', 'Book is now Live'], () => approveItem(item.id), { stepMs: 300 })
      setDone(res)
    } catch (e) {
      toast({ title: 'Approval failed', description: e.message, tone: 'error' })
      stages.reset()
    }
  }

  const reject = async (reason, note) => {
    await rejectItem(item.id, { reason, note })
    setRejectOpen(false)
    toast({ title: 'Submission rejected', description: `“${item.title}” — ${reason.toLowerCase()}. ${item.submittedByName.split(' ')[0]} has been notified.`, tone: 'info' })
    navigate(nextId ? `/admin/pending/${nextId}` : '/admin/pending')
  }

  const notPending = !EDITABLE.includes(item.status) && !done

  return (
    <div className="review">
      <div className="review__nav">
        {waiting ? (
          <Link to="/admin/waiting-list" className="backlink">
            <ArrowLeft size={16} aria-hidden /> Waiting list
          </Link>
        ) : (
          <Link to="/admin/pending" className="backlink">
            <ArrowLeft size={16} aria-hidden /> Pending review
          </Link>
        )}
        {nextId && !done && (
          <Link to={`/admin/pending/${nextId}`} className="backlink">
            Next pending <ArrowRight size={16} aria-hidden />
          </Link>
        )}
      </div>

      <div className="review__grid">
        {/* ---------- Editorial: the book as fetched/submitted ---------- */}
        <article className="review__book">
          <PhotoDrop className="review__cover" onFile={takePhoto} disabled={notPending || done}>
            <BookCover title={values.title || item.title} author={values.author || item.author} isbn={item.isbn} photo={shownPhoto} size="xl" />
            {!notPending && !done && (
              <div className="review__photo-actions">
                <Button as="label" size="sm" icon={Camera}>
                  {shownPhoto ? 'Change photo' : 'Add photo'}
                  <input type="file" accept="image/*" onChange={choosePhoto} hidden />
                </Button>
                {canRemovePhoto && (
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setPhoto('')}>
                    Remove photo
                  </Button>
                )}
                {photo !== null && <span className="unsaved">{photo ? 'New photo, not saved' : 'Photo will be removed'}</span>}
                <span className="photo-drop__hint">or drag an image onto the cover</span>
                {photoError && (
                  <p className="field__error" role="alert">
                    {photoError}
                  </p>
                )}
              </div>
            )}
          </PhotoDrop>
          <div className="review__ident">
            <SourceBadge source={item.source} />
            <h1 className="review__title">{values.title || item.title}</h1>
            <p className="review__author">by {values.author || item.author}</p>
            <dl className="review__facts">
              <div>
                <dt>Publisher</dt>
                <dd>{values.publisher || <span className="muted">—</span>}</dd>
              </div>
              <div>
                <dt>Published</dt>
                <dd className="num">{values.year || <span className="muted">—</span>}</dd>
              </div>
              <div>
                <dt>Pages</dt>
                <dd className="num">{values.pages || <span className="muted">—</span>}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{values.format || <span className="muted">—</span>}</dd>
              </div>
              <div>
                <dt>Dimensions</dt>
                <dd className="num">{values.dimensions ? `${values.dimensions} mm` : <span className="muted">—</span>}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd className="num">{formatPrice(values.price) || <span className="muted">—</span>}</dd>
              </div>
            </dl>
            <div className="review__barcode">
              <Barcode value={item.isbn} height={34} />
            </div>
          </div>

          <section className="review__card">
            <h2 className="review__h">Submission</h2>
            <div className="review__sub">
              <Person id={item.submittedBy} name={item.submittedByName} size={26} />
              <span className="muted" title={formatDateTime(item.submittedAt)}>
                {timeAgo(item.submittedAt)}
              </span>
            </div>
            <div className="review__sub">
              <span>
                Shelf <ShelfTag id={item.shelfId} />
              </span>
              <span>
                Quantity <strong className="num">{item.quantity}</strong>
              </span>
            </div>
            {item.editedFields?.length > 0 && item.fetched && (
              <ul className="review__edits">
                {item.editedFields.map((k) => (
                  <li key={k}>
                    <PencilLine size={13} aria-hidden /> Staff changed {LABEL[k]?.toLowerCase() ?? k}: <s>{String(item.fetched[k])}</s> → <strong>{String(item[k])}</strong>
                  </li>
                ))}
              </ul>
            )}
            {item.missingFields?.length > 0 && (
              <p className="review__missing">
                <CircleAlert size={13} aria-hidden /> Not found by lookup: {item.missingFields.join(', ')} — entered manually
              </p>
            )}
          </section>

          <section className="review__card review__dup">
            <h2 className="review__h">
              <ShieldCheck size={15} aria-hidden /> Duplicate check
            </h2>
            {item.duplicateCheck.matches.length === 0 ? (
              <p>
                <Check size={14} className="ok" aria-hidden /> No other entry with this title + author on any shelf.
              </p>
            ) : (
              <ul className="review__matches">
                {item.duplicateCheck.matches.map((m) => (
                  <li key={m.itemId}>
                    <ShelfTag id={m.shelfId} size="sm" /> <StatusChip status={m.status} syncStatus={m.syncStatus} size="sm" /> qty <span className="num">{m.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="review__key">
              key <span className="mono">{item.duplicateCheck.key.title}</span> + <span className="mono">{item.duplicateCheck.key.author}</span>
            </p>
          </section>
          <FlagReviewCard item={item} />
        </article>

        {/* ---------- Decision panel ---------- */}
        <section className="review__panel" aria-label="Verify and decide">
          {done ? (
            <ApprovedCard item={done} nextId={nextId} />
          ) : notPending ? (
            <div className="review__closed">
              <StatusChip status={item.status} ready={item.ready} syncStatus={item.syncStatus} />
              <p>This entry can no longer be edited here.</p>
              <Button to={`/admin/books/${item.id}`}>Open book detail</Button>
            </div>
          ) : (
            <>
              <header className="review__panel-head">
                <h2>Verify &amp; edit</h2>
                <span className="review__panel-tools">
                  {dirty && <span className="unsaved">Unsaved changes</span>}
                  <Button variant="ghost" size="sm" icon={RefreshCw} loading={refreshing} disabled={stages.active} onClick={refreshDetails}>
                    Refresh details
                  </Button>
                </span>
              </header>
              <div className="callout callout--note">
                <PencilLine size={16} aria-hidden />
                <p>
                  Metadata was fetched automatically and may be wrong. Compare it with the physical book — <strong>every field is editable</strong>.
                </p>
              </div>
              {conflict && (
                <div className="callout callout--danger" role="alert">
                  <CircleAlert size={16} aria-hidden />
                  <p>
                    <strong>{conflict.message}</strong> Same-shelf duplicates are rejected — change the shelf or title/author, or reject this submission.
                  </p>
                </div>
              )}
              {waiting && (
                <div className="callout callout--note">
                  <Hourglass size={16} aria-hidden />
                  <p>
                    This entry is on the <strong>waiting list</strong>. Edit and save it here; approve or reject it from the Waiting list.
                  </p>
                </div>
              )}
              <div className="review__form">
                <Field label="ISBN" htmlFor="r-isbn" hint="ISBN-10 or ISBN-13">
                  <Input id="r-isbn" mono inputMode="numeric" maxLength={17} value={values.isbn} onChange={set('isbn')} className={cn(dirtyKeys.includes('isbn') && 'is-dirty')} />
                </Field>
                <Field label="Title" htmlFor="r-title" error={!String(values.title).trim() && 'Required'}>
                  <Input id="r-title" value={values.title} onChange={set('title')} className={cn(dirtyKeys.includes('title') && 'is-dirty')} />
                </Field>
                <Field label="Author" htmlFor="r-author" error={!String(values.author).trim() && 'Required'}>
                  <Input id="r-author" value={values.author} onChange={set('author')} className={cn(dirtyKeys.includes('author') && 'is-dirty')} />
                </Field>
                <Field label="Publisher" htmlFor="r-pub">
                  <Input id="r-pub" value={values.publisher} onChange={set('publisher')} className={cn(dirtyKeys.includes('publisher') && 'is-dirty')} />
                </Field>
                <div className="review__row2">
                  <Field label="Publication year" htmlFor="r-year">
                    <Input id="r-year" inputMode="numeric" value={values.year} onChange={set('year')} className={cn(dirtyKeys.includes('year') && 'is-dirty')} />
                  </Field>
                  <Field label="Page count" htmlFor="r-pages">
                    <Input id="r-pages" inputMode="numeric" value={values.pages} onChange={set('pages')} className={cn(dirtyKeys.includes('pages') && 'is-dirty')} />
                  </Field>
                </div>
                <GenrePicker lists={genreLists} idPrefix="r" value={values} onChange={(patch) => Object.entries(patch).forEach(([k, v]) => set(k)(v))} dirty={dirtyKeys} />
                <div className="review__row2">
                  <Field label="Format" htmlFor="r-format" optional>
                    <Select id="r-format" value={values.format || ''} onChange={set('format')} className={cn(dirtyKeys.includes('format') && 'is-dirty')}>
                      <option value="">Not set</option>
                      {withCurrent(FORMATS, values.format).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Dimensions" htmlFor="r-dimensions" optional hint="mm: width x height x thickness">
                    <Input id="r-dimensions" value={values.dimensions} onChange={set('dimensions')} placeholder="126 x 176 x 21" className={cn(dirtyKeys.includes('dimensions') && 'is-dirty')} />
                  </Field>
                </div>
                <Field label="Description" htmlFor="r-description" optional>
                  <Textarea id="r-description" rows={5} maxLength={5000} value={values.description} onChange={set('description')} className={cn(dirtyKeys.includes('description') && 'is-dirty')} />
                </Field>
                <Field label="Price (AED)" htmlFor="r-price" optional error={priceError} hint="Sent to Shopify as the product price on approval">
                  <Input id="r-price" inputMode="decimal" value={values.price} onChange={set('price')} placeholder="e.g. 45" className={cn(dirtyKeys.includes('price') && 'is-dirty')} />
                </Field>
                <div className="review__row2 review__row2--inv">
                  <Field label="Shelf" htmlFor="r-shelf" hint="From the Shelf master">
                    <ShelfPicker id="r-shelf" shelves={shelves} value={values.shelfId} onChange={set('shelfId')} invalid={!!conflict} />
                  </Field>
                  <Field label="Quantity" htmlFor="r-qty" hint="Units on that shelf">
                    <QuantityStepper id="r-qty" value={values.quantity} onChange={set('quantity')} />
                  </Field>
                </div>
              </div>

              {item.flagHold && (
                <div className="callout callout--flag">
                  <Flag size={16} aria-hidden />
                  <p>
                    Flagged: <strong>{item.flags.filter((f) => f.mode === 'hold').map((f) => f.name).join(', ')}</strong>. Check the book, then approve or reject — approving records the flag as reviewed.
                  </p>
                </div>
              )}
              {stages.labels.length > 0 && (
                <div className="processing processing--inline" role="status">
                  <StageList {...stages} />
                </div>
              )}

              {waiting ? (
                <footer className="review__actions">
                  <Button to="/admin/waiting-list">Waiting list</Button>
                  <span className="review__actions-spacer" />
                  <Button variant="primary" icon={Save} onClick={() => save().catch(() => {})} disabled={!dirty || invalid} loading={saving}>
                    Save changes
                  </Button>
                </footer>
              ) : (
                <footer className="review__actions">
                  <Button variant="danger-ghost" icon={X} onClick={() => setRejectOpen(true)} disabled={stages.active}>
                    Reject
                  </Button>
                  <span className="review__actions-spacer" />
                  <Button icon={Save} onClick={() => save().catch(() => {})} disabled={!dirty || stages.active} loading={saving && !stages.active}>
                    Save changes
                  </Button>
                  <Button variant="primary" icon={Check} onClick={approve} disabled={invalid || stages.active} loading={stages.active}>
                    {dirty ? 'Save & approve' : 'Approve'}
                  </Button>
                </footer>
              )}
            </>
          )}
        </section>
      </div>

      <RejectDialog open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={reject} title={item.title} />
    </div>
  )
}

function ApprovedCard({ item, nextId }) {
  return (
    <div className="approved">
      <svg className="approved__check" viewBox="0 0 52 52" aria-hidden>
        <circle cx="26" cy="26" r="24" />
        <path d="M15 27l7 7 15-16" />
      </svg>
      <h2>Approved</h2>
      <p className="approved__lead">Book is now live.</p>
      <dl className="approved__facts">
        <GenreFact item={item} />
        <div>
          <dt>Shopify product</dt>
          <dd className="mono">{item.productId ? `#${item.productId}` : '—'}</dd>
        </div>
        <div>
          <dt>Shelf</dt>
          <dd>
            <ShelfTag id={item.shelfId} />
          </dd>
        </div>
        <div>
          <dt>Inventory</dt>
          <dd className="num">{item.stock} units</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <StatusChip status="live" />
          </dd>
        </div>
      </dl>
      <p className="approved__note">
        <Store size={14} aria-hidden />{' '}
        {item.syncStatus === 'synced'
          ? 'Listed on Shopify with its counted quantity.'
          : item.syncStatus === 'failed'
            ? 'Couldn’t update Shopify. The scheduled sync will try again.'
            : 'Live with its counted quantity. Not on Shopify yet.'}
      </p>
      <div className="approved__actions">
        {nextId ? (
          <Button variant="primary" iconRight={ArrowRight} to={`/admin/pending/${nextId}`}>
            Review next pending
          </Button>
        ) : (
          <Button variant="primary" to="/admin/pending">
            Back to pending
          </Button>
        )}
        <Button to="/admin/live">View live inventory</Button>
      </div>
    </div>
  )
}

function RejectDialog({ open, onClose, onConfirm, title }) {
  const [reason, setReason] = useState(REASONS[0])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()
  const needsNote = reason === 'Other'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reject submission"
      description={`“${title}” will be marked Rejected and the staff member notified.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            icon={X}
            loading={busy}
            disabled={needsNote && !note.trim()}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm(reason, note.trim())
              } catch (err) {
                toast({ title: 'Couldn’t reject', description: err.message, tone: 'error' })
              } finally {
                setBusy(false)
              }
            }}
          >
            Reject
          </Button>
        </>
      }
    >
      <fieldset className="reasons">
        <legend className="field__label">Reason</legend>
        {REASONS.map((r, i) => (
          <label key={r} className={cn('reason', reason === r && 'is-active')}>
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} data-autofocus={i === 0 ? '' : undefined} />
            <span className="reason__dot" aria-hidden />
            {r}
          </label>
        ))}
      </fieldset>
      <Field label="Note" optional={!needsNote} htmlFor="reject-note" hint="Shown to the staff member.">
        <Textarea id="reject-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? 'Describe the reason' : 'e.g. Cover torn — set aside for the damaged bin'} />
      </Field>
    </Modal>
  )
}

function ReviewSkeleton() {
  return (
    <div className="review">
      <Skeleton w={140} h={14} />
      <div className="review__grid" style={{ marginTop: 18 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Skeleton w={184} h={276} r={4} />
          <Skeleton w="70%" h={26} />
          <Skeleton w="40%" h={14} />
          <Skeleton h={120} r={10} />
        </div>
        <Skeleton h={520} r={10} />
      </div>
    </div>
  )
}
