import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, CircleAlert, Keyboard, PencilLine, RotateCcw, SearchX, ServerCrash } from 'lucide-react'
import { lookupIsbn } from '../../services/mockApi'
import { useDraft } from '../../hooks/useDraft'
import { FlowHeader, BottomBar } from '../../components/staff/StaffBits'
import { BookCover } from '../../components/books/BookCover'
import { SourceBadge } from '../../components/books/BookBits'
import { Barcode } from '../../components/ui/Misc'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Form'
import { Skeleton } from '../../components/ui/Feedback'
import { cn } from '../../utils/format'

const FIELDS = ['title', 'author', 'publisher', 'year', 'pages']
const EMPTY = { title: '', author: '', publisher: '', year: '', pages: '' }
const pickValues = (m) => Object.fromEntries(FIELDS.map((k) => [k, m?.[k] ?? '']))

export default function BookMetadata() {
  const { isbn } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { draft, setDraft } = useDraft()
  const preset = draft?.isbn === isbn ? draft : null

  const [state, setState] = useState(() =>
    preset?.meta || preset?.manual ? { status: 'ready' } : location.state?.error ? { status: 'error', error: location.state.error } : { status: 'loading' },
  )
  const [meta, setMeta] = useState(preset?.meta ?? null)
  const [manual, setManual] = useState(preset?.manual ?? false)
  const [values, setValues] = useState(() => preset?.values || (preset?.meta ? pickValues(preset.meta) : EMPTY))
  const [showErrors, setShowErrors] = useState(false)

  const load = async (retry = false) => {
    setState({ status: 'loading' })
    try {
      const m = await lookupIsbn(isbn, { retry })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  const edited = (k) => meta && String(meta[k] ?? '') !== String(values[k] ?? '') && String(meta[k] ?? '') !== ''

  const proceed = () => {
    setShowErrors(true)
    if (invalid) return
    setDraft((d) => ({
      ...(d?.isbn === isbn ? d : {}),
      isbn,
      meta,
      manual,
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
              <BookCover title={values.title || 'Untitled'} author={values.author} isbn={meta?.noCover ? null : isbn} size="lg" />
              <div className="meta-hero__info">
                {manual ? <SourceBadge source="manual" /> : <SourceBadge source={meta.source} fallback={meta.fallback} />}
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

            {(missing.length > 0 || manual) && (
              <div className="callout callout--warn">
                <CircleAlert size={17} aria-hidden />
                <p>{manual ? 'Enter the book details from the cover. Title and author are required.' : 'Some information couldn’t be found. Please complete the fields manually.'}</p>
              </div>
            )}
            {!manual && missing.length === 0 && (
              <div className="callout callout--note">
                <PencilLine size={16} aria-hidden />
                <p>Fetched details can be wrong. Check them against the book — every field is editable.</p>
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
                <Input id="m-title" size="lg" value={values.title} onChange={set('title')} className={cn(missing.includes('title') && !values.title && 'is-missing')} />
              </Field>
              <Field label="Author" htmlFor="m-author" error={showErrors && errors.author} badge={edited('author') && <EditedTag />}>
                <Input id="m-author" size="lg" value={values.author} onChange={set('author')} className={cn(missing.includes('author') && !values.author && 'is-missing')} />
              </Field>
              <Field label="Publisher" htmlFor="m-pub" optional badge={edited('publisher') && <EditedTag />}>
                <Input id="m-pub" value={values.publisher} onChange={set('publisher')} className={cn(missing.includes('publisher') && !values.publisher && 'is-missing')} placeholder={missing.includes('publisher') ? 'Not found — add if printed on the book' : ''} />
              </Field>
              <div className="meta-form__row">
                <Field label="Year" htmlFor="m-year" optional error={showErrors && errors.year} badge={edited('year') && <EditedTag />}>
                  <Input id="m-year" inputMode="numeric" value={values.year} onChange={set('year')} className={cn(missing.includes('year') && !values.year && 'is-missing')} />
                </Field>
                <Field label="Pages" htmlFor="m-pages" optional error={showErrors && errors.pages} badge={edited('pages') && <EditedTag />}>
                  <Input id="m-pages" inputMode="numeric" value={values.pages} onChange={set('pages')} className={cn(missing.includes('pages') && !values.pages && 'is-missing')} />
                </Field>
              </div>
              <Field label="ISBN">
                <Input value={isbn} readOnly mono className="input--readonly" aria-readonly />
              </Field>
              <button type="submit" hidden />
            </form>
          </div>
        )}
      </div>
      {state.status === 'ready' && (
        <BottomBar>
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
