import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Camera, Check, CircleAlert, Keyboard, Pencil, PencilLine, RotateCcw, Search, SearchX, ServerCrash, Trash2 } from 'lucide-react'
import { getDescription, loadShelves, lookupIsbn, searchBooks } from '../../services/staffApi'
import { addRecentIsbn, setRecentIsbnTitle } from '../../services/recentIsbns'
import { shrinkPhoto } from '../../services/photo'
import { checkIsbn } from '../../services/isbn'
import { useAuth } from '../../hooks/useAuth'
import { isDraftEdited, useDraft } from '../../hooks/useDraft'
import { useDebounce } from '../../hooks/useStore'
import { FlowHeader, BottomBar } from '../../components/staff/StaffBits'
import { BookCover } from '../../components/books/BookCover'
import { SourceBadge } from '../../components/books/BookBits'
import { Barcode } from '../../components/ui/Misc'
import { Button } from '../../components/ui/Button'
import { Field, Input, Textarea } from '../../components/ui/Form'
import { Skeleton } from '../../components/ui/Feedback'
import { cn } from '../../utils/format'

const FIELDS = ['title', 'author', 'publisher', 'year', 'pages', 'description']
const EMPTY = { title: '', author: '', publisher: '', year: '', pages: '', description: '' }
const pickValues = (m) => Object.fromEntries(FIELDS.map((k) => [k, m?.[k] ?? '']))
const isEmpty = (v) => String(v ?? '').trim() === ''
const MIN_SEARCH = 3 // letters of the title before Google matches are looked up

export default function BookMetadata() {
  const { isbn } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { draft, setDraft } = useDraft()
  const { user } = useAuth()
  const preset = draft?.isbn === isbn ? draft : null

  const [state, setState] = useState(() =>
    preset?.meta || preset?.manual ? { status: 'ready' } : location.state?.error ? { status: 'error', error: location.state.error } : { status: 'loading' },
  )
  const [meta, setMeta] = useState(preset?.meta ?? null)
  const [manual, setManual] = useState(preset?.manual ?? false)
  const [values, setValues] = useState(() => preset?.values || (preset?.meta ? pickValues(preset.meta) : EMPTY))
  const [showErrors, setShowErrors] = useState(false)
  const [descriptionChecked, setDescriptionChecked] = useState(preset?.descriptionChecked ?? null) // the ISBN already asked about: a box staff cleared stays empty
  const [loadingDescription, setLoadingDescription] = useState(false)
  // Found details open locked: staff press Edit to change them. Manual entry is always editable.
  const [editing, setEditing] = useState(false)
  const locked = !manual && !editing

  // Cover photo taken by staff (JPEG data URL), and the ISBN box (editable like the other fields).
  const [photo, setPhoto] = useState(preset?.photo ?? null)
  const [photoError, setPhotoError] = useState('')
  const originalIsbn = preset?.originalIsbn ?? isbn // the ISBN first scanned/typed: a different one counts as an edit
  const [isbnInput, setIsbnInput] = useState(isbn)
  const [isbnError, setIsbnError] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const isbnCheck = checkIsbn(isbnInput)
  const newIsbn = isbnCheck.isbn13 && isbnCheck.isbn13 !== isbn ? isbnCheck.isbn13 : null

  const load = async (retry = false) => {
    setState({ status: 'loading' })
    try {
      const m = await lookupIsbn(isbn, { retry })
      setRecentIsbnTitle(user, isbn, m.title) // name the entry in the "recently entered" list, if it is there
      setMeta(m)
      setValues(pickValues(m))
      setManual(false)
      setState({ status: 'ready' })
    } catch (e) {
      setState({ status: 'error', error: { code: e.code, message: e.message } })
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch when not prefetched by the scanner
    if (state.status === 'loading') load()
    loadShelves().catch(() => {}) // warm the shelf list so the next step opens instantly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The description takes extra provider calls, so it arrives after the other details and only ever fills an empty box.
  useEffect(() => {
    if (state.status !== 'ready' || manual || descriptionChecked === isbn || !values.title.trim()) return undefined
    let alive = true
    const fill = (text) => (v) => (isEmpty(v.description) && text ? { ...v, description: text } : v)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show "looking" while the request runs
    setLoadingDescription(true)
    getDescription({ isbn, title: values.title.trim(), author: values.author.trim() })
      .catch(() => '') // optional: staff can type one, or leave it empty
      .then((text) => {
        // Staff may have pressed Continue meanwhile: the draft gets it too.
        setDraft((d) => (d?.isbn === isbn && d.values ? { ...d, descriptionChecked: isbn, values: fill(text)(d.values) } : d))
        if (!alive) return
        setValues(fill(text))
        setDescriptionChecked(isbn)
        setLoadingDescription(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per book, when its details are on screen
  }, [state.status, manual, isbn, descriptionChecked])

  const goManual = () => {
    setManual(true)
    setMeta(null)
    setValues(EMPTY)
    setState({ status: 'ready' })
  }

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }))
  const errors = {
    title: !values.title.trim() && 'Title is required',
    author: !values.author.trim() && 'Author is required',
    year: values.year && !/^\d{4}$/.test(String(values.year)) && 'Use a 4-digit year',
    pages: values.pages && !/^\d+$/.test(String(values.pages)) && 'Numbers only',
  }
  const invalid = Object.values(errors).some(Boolean)
  const missing = meta?.missing || []
  const filled = meta?.filled || [] // from a Google Books title match, which may be another edition
  const edited = (k) => meta && String(meta[k] ?? '') !== String(values[k] ?? '') && String(meta[k] ?? '') !== ''
  const fieldTag = (k) => (edited(k) ? <EditedTag /> : filled.includes(k) ? <VerifyTag /> : null)
  // Shown next to the source badge (and on Review / Submissions): details, ISBN or photo changed.
  const bookEdited = isDraftEdited({ manual, meta, values, photo, isbn, originalIsbn })
  const lockedClass = locked && 'input--readonly'

  const draftFor = (targetIsbn, extra) => ({ isbn: targetIsbn, originalIsbn, meta, manual, values, photo, descriptionChecked, ...extra })

  const choosePhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // the same file can be picked again
    if (!file) return
    setPhotoError('')
    try {
      setPhoto(await shrinkPhoto(file))
    } catch (error) {
      setPhotoError(error.message)
    }
  }

  /** Fetch the details for a corrected ISBN; the page then shows that book (its address changes too). */
  const lookUpNewIsbn = async () => {
    if (!newIsbn) return
    setIsbnError('')
    setLookingUp(true)
    addRecentIsbn(user, newIsbn)
    try {
      const m = await lookupIsbn(newIsbn)
      setRecentIsbnTitle(user, newIsbn, m.title)
      setDraft(draftFor(newIsbn, { meta: m, manual: false, values: pickValues(m) }))
      navigate(`/staff/book/${newIsbn}`, { replace: true })
    } catch (error) {
      setLookingUp(false)
      setIsbnError(
        error.code === 'not_found'
          ? manual
            ? 'No record for this ISBN. You can keep it and enter the details yourself.'
            : 'No record for this ISBN. Check the number on the book.'
          : error.message,
      )
    }
  }

  // Google Books matches by title: offered when the ISBN was not found (manual entry) or came back with
  // fields missing. Staff pick the matching book; it fills the empty fields. The scanned ISBN is never changed.
  const [suggestions, setSuggestions] = useState([])
  const [pickedTitle, setPickedTitle] = useState(null) // no new search until the title changes after a pick
  const [dismissed, setDismissed] = useState(null)
  // Only while something is still empty: coming back to a filled-in page must not open the list again.
  const fillable = ['author', 'publisher', 'year', 'pages'].some((k) => isEmpty(values[k]))
  const canSuggest = state.status === 'ready' && !locked && (manual || missing.length > 0) && fillable
  const query = canSuggest && values.title.trim().length >= MIN_SEARCH && values.title !== pickedTitle ? values.title.trim() : ''
  const searched = useDebounce(query, 500)

  useEffect(() => {
    let alive = true
    if (!searched) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear old matches when there is nothing to search
      setSuggestions([])
      return undefined
    }
    searchBooks({ title: searched, author: values.author.trim() })
      .then((found) => alive && setSuggestions(found))
      .catch(() => alive && setSuggestions([])) // no matches shown; staff simply keep typing
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search again only when the title changes
  }, [searched])

  const showSuggestions = suggestions.length > 0 && query !== '' && searched === query && dismissed !== query

  const pickSuggestion = (s) => {
    const next = { ...values }
    if (manual || isEmpty(next.title)) next.title = s.title // a typed (maybe partial) title becomes the full one
    for (const k of ['author', 'publisher', 'year', 'pages', 'description']) {
      if (isEmpty(next[k]) && !isEmpty(s[k])) next[k] = String(s[k]) // only empty fields: found values are never overwritten
    }
    setValues(next)
    setPickedTitle(next.title)
    setSuggestions([])
  }

  const proceed = () => {
    setShowErrors(true)
    if (!isbnCheck.isbn13) {
      setIsbnError('Enter a valid ISBN-10 or ISBN-13.')
      setEditing(true)
      return
    }
    if (newIsbn && !manual) {
      setIsbnError('Look up the new ISBN first, so the details match the number.')
      return
    }
    if (invalid) {
      setEditing(true) // e.g. no author found: open the fields so it can be filled in
      return
    }
    const finalIsbn = isbnCheck.isbn13 // manual entry may keep a corrected ISBN without a lookup
    setDraft((d) => ({
      ...(d?.isbn === isbn ? d : {}),
      ...draftFor(finalIsbn),
      values: { ...values, title: values.title.trim(), author: values.author.trim() },
      source: manual ? 'manual' : meta.source,
    }))
    navigate('/staff/shelf')
  }

  return (
    <div className="flow">
      <FlowHeader title="Book details" step={1} onBack={() => navigate('/staff/scan')} />
      <div className="flow__body">
        {state.status === 'loading' && (
          <div className="meta-skel" aria-busy="true" aria-label="Loading book information">
            <div className="meta-hero">
              <Skeleton w={96} h={144} r={4} />
              <div style={{ display: 'grid', gap: 8, alignContent: 'start', flex: 1 }}>
                <Skeleton w="45%" h={20} r={10} />
                <Skeleton w="80%" h={18} />
                <Skeleton w="55%" h={12} />
                <Skeleton w="100%" h={34} r={4} />
              </div>
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'grid', gap: 6 }}>
                <Skeleton w={70} h={10} />
                <Skeleton h={44} r={8} />
              </div>
            ))}
            <p className="meta-skel__note">Looking up Google Books, then Open Library…</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flow-error" role="alert">
            <span className="flow-error__icon">{state.error.code === 'not_found' ? <SearchX size={26} /> : <ServerCrash size={26} />}</span>
            <h2>{state.error.code === 'not_found' ? 'ISBN not found' : 'Metadata service unavailable'}</h2>
            <p className="mono flow-error__isbn">{isbn}</p>
            <p>{state.error.message}</p>
            <p className="muted">
              {state.error.code === 'not_found'
                ? 'Check the number on the book, or enter the details yourself — the admin will review them.'
                : 'This is usually temporary. Retry, or enter the details yourself.'}
            </p>
            <div className="flow-error__actions">
              {state.error.code !== 'not_found' && (
                <Button variant="dark" size="lg" icon={RotateCcw} onClick={() => load(true)}>
                  Retry
                </Button>
              )}
              <Button size="lg" icon={Keyboard} onClick={goManual}>
                Enter details manually
              </Button>
            </div>
          </div>
        )}

        {state.status === 'ready' && (
          <div className="meta">
            <div className="meta-hero">
              <div className="meta-hero__cover">
                <BookCover title={values.title || 'Untitled'} author={values.author} isbn={meta?.noCover ? null : isbn} photo={photo} size="lg" />
                {!locked && (
                  <>
                    <Button as="label" size="sm" icon={Camera} className="meta-hero__photo-btn">
                      {photo || !manual ? 'Change photo' : 'Add photo'}
                      <input type="file" accept="image/*" onChange={choosePhoto} hidden />
                    </Button>
                    {photo && (
                      <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setPhoto(null)}>
                        Remove photo
                      </Button>
                    )}
                  </>
                )}
                {photoError && (
                  <p className="field__error" role="alert">
                    {photoError}
                  </p>
                )}
              </div>
              <div className="meta-hero__info">
                {manual ? (
                  <SourceBadge source="manual" />
                ) : (
                  <span className="meta-hero__badges">
                    <SourceBadge source={meta.source} fallback={meta.fallback} />
                    {bookEdited && <EditedTag />}
                  </span>
                )}
                <p className="meta-hero__found">{manual ? 'Entered manually' : `Metadata found via ${meta.source === 'google' ? 'Google Books' : 'Open Library'}`}</p>
                <div className="meta-hero__code">
                  <Barcode value={isbn} height={26} />
                </div>
                {meta?.subjects?.length > 0 && (
                  <ul className="subjects" aria-label="Subjects from metadata">
                    {meta.subjects.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {!manual && filled.length > 0 && (
              <div className="callout callout--warn" role="note">
                <CircleAlert size={17} aria-hidden />
                <p>
                  <strong>Please verify {filled.join(', ')}.</strong> These came from a Google Books title match and may be from a different edition. Check them against the book.
                </p>
              </div>
            )}
            {(missing.length > 0 || manual) && (
              <div className="callout callout--warn">
                <CircleAlert size={17} aria-hidden />
                <p>{manual ? 'Enter the book details from the cover. Title and author are required.' : 'Some information couldn’t be found. Please complete the fields manually.'}</p>
              </div>
            )}
            {!manual && missing.length === 0 && (
              <div className="callout callout--note">
                <PencilLine size={16} aria-hidden />
                <p>Fetched details can be wrong. Check them against the book — tap Edit to correct them.</p>
              </div>
            )}

            <form
              className="meta-form"
              onSubmit={(e) => {
                e.preventDefault()
                proceed()
              }}
              noValidate
            >
              <Field label="Title" htmlFor="m-title" error={showErrors && errors.title} badge={edited('title') && <EditedTag />}>
                <Input
                  id="m-title"
                  size="lg"
                  value={values.title}
                  onChange={set('title')}
                  readOnly={locked}
                  onKeyDown={(e) => e.key === 'Escape' && setDismissed(query)}
                  className={cn(missing.includes('title') && !values.title && 'is-missing', lockedClass)}
                  aria-controls={showSuggestions ? 'm-title-matches' : undefined}
                />
                {showSuggestions && (
                  <div className="shelf-pop" id="m-title-matches">
                    <ul className="cmd__list" aria-label="Matching books from Google Books">
                      {suggestions.map((s, i) => (
                        <li key={`${s.title}|${s.author}|${s.publisher}|${s.year}|${i}`}>
                          <button type="button" className="cmd__item" onClick={() => pickSuggestion(s)}>
                            <BookCover title={s.title} author={s.author} size="xs" />
                            <span className="cmd__text">
                              <strong>{s.title}</strong>
                              <span>{[s.author, s.publisher, s.year].filter(Boolean).join(' · ')}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Field>
              <Field label="Author" htmlFor="m-author" error={showErrors && errors.author} badge={fieldTag('author')}>
                <Input id="m-author" size="lg" value={values.author} onChange={set('author')} readOnly={locked} className={cn(missing.includes('author') && !values.author && 'is-missing', lockedClass)} />
              </Field>
              <Field label="Publisher" htmlFor="m-pub" optional badge={fieldTag('publisher')}>
                <Input id="m-pub" value={values.publisher} onChange={set('publisher')} readOnly={locked} className={cn(missing.includes('publisher') && !values.publisher && 'is-missing', lockedClass)} placeholder={missing.includes('publisher') ? 'Not found — add if printed on the book' : ''} />
              </Field>
              <div className="meta-form__row">
                <Field label="Year" htmlFor="m-year" optional error={showErrors && errors.year} badge={fieldTag('year')}>
                  <Input id="m-year" inputMode="numeric" value={values.year} onChange={set('year')} readOnly={locked} className={cn(missing.includes('year') && !values.year && 'is-missing', lockedClass)} />
                </Field>
                <Field label="Pages" htmlFor="m-pages" optional error={showErrors && errors.pages} badge={fieldTag('pages')}>
                  <Input id="m-pages" inputMode="numeric" value={values.pages} onChange={set('pages')} readOnly={locked} className={cn(missing.includes('pages') && !values.pages && 'is-missing', lockedClass)} />
                </Field>
              </div>
              <Field label="ISBN" htmlFor="m-isbn" error={isbnError} badge={isbnCheck.isbn13 && isbnCheck.isbn13 !== originalIsbn && !manual && <EditedTag />}>
                <div className="meta-isbn">
                  <Input
                    id="m-isbn"
                    mono
                    inputMode="numeric"
                    maxLength={17}
                    value={isbnInput}
                    readOnly={locked}
                    aria-readonly={locked}
                    onChange={(e) => {
                      setIsbnInput(e.target.value)
                      setIsbnError('')
                    }}
                    aria-invalid={!locked && isbnCheck.state === 'invalid'}
                    className={cn(lockedClass)}
                  />
                  {!locked && newIsbn && (
                    <Button variant="dark" size="lg" icon={Search} onClick={lookUpNewIsbn} loading={lookingUp}>
                      Look up
                    </Button>
                  )}
                </div>
                {!locked && !isbnError && isbnInput !== isbn && <p className="field__hint">{isbnCheck.message}</p>}
              </Field>
              <Field label="Description" htmlFor="m-description" optional className="meta-form__wide" hint={loadingDescription ? 'Looking for a description…' : undefined}>
                <Textarea
                  id="m-description"
                  rows={5}
                  maxLength={5000}
                  value={values.description ?? ''}
                  onChange={set('description')}
                  readOnly={locked}
                  className={cn(lockedClass)}
                  placeholder={loadingDescription ? '' : locked ? 'No description found. Tap Edit to add one.' : 'What is this book about?'}
                />
              </Field>
              <button type="submit" hidden />
            </form>
          </div>
        )}
      </div>
      {state.status === 'ready' && (
        <BottomBar className={cn(!manual && 'bottombar--split')}>
          {!manual && (
            <Button size="xl" block icon={editing ? Check : Pencil} onClick={() => setEditing((on) => !on)} aria-pressed={editing}>
              {editing ? 'Done' : 'Edit'}
            </Button>
          )}
          <Button variant="primary" size="xl" block iconRight={ArrowRight} onClick={proceed}>
            Continue
          </Button>
        </BottomBar>
      )}
    </div>
  )
}

function EditedTag() {
  return <span className="edited-tag">Edited</span>
}

function VerifyTag() {
  return <span className="edited-tag edited-tag--verify">Verify</span>
}
