import { useMemo, useState } from 'react'
import { Ban, Plus, Search, Trash2 } from 'lucide-react'
import { addBlockedBook, deleteBlockedBook, getBlockedBooks, lookupBlockIsbn } from '../../services/adminApi'
import { checkIsbn } from '../../services/isbn'
import { useDebounce, useQuery } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { DataTable } from '../../components/ui/Data'
import { PageHeader } from '../../components/ui/Misc'
import { Field, Input, SearchInput } from '../../components/ui/Form'
import { Button, IconButton } from '../../components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { Modal } from '../../components/ui/Overlay'
import { BookCell, BookCover } from '../../components/books/BookCover'
import { Person } from '../../components/inventory/Filters'
import { formatDate } from '../../utils/format'

const asItem = (b) => ({ title: b.title || 'Untitled', author: b.author, isbn: b.isbn, coverPhotoUrl: b.coverUrl || null })

export default function BlockedBooks() {
  const { toast } = useToast()
  const [q, setQ] = useState('')
  const dq = useDebounce(q, 150)
  const { data, loading, error, reload, refreshing } = useQuery(() => getBlockedBooks(), [])
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(() => {
    const text = dq.trim().toLowerCase()
    return (data || []).filter((b) => !text || [b.isbn, b.title, b.author, b.reason].some((v) => v?.toLowerCase().includes(text)))
  }, [data, dq])

  const remove = async () => {
    const b = deleting
    setBusy(true)
    try {
      await deleteBlockedBook(b.id)
      setDeleting(null)
      toast({ title: `${b.title || b.isbn} unblocked`, description: 'Staff can submit it again.', tone: 'info' })
    } catch (err) {
      toast({ title: 'Couldn’t remove', description: err.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'book', header: 'Book', card: 'title', render: (b) => <BookCell item={asItem(b)} /> },
    { key: 'isbn', header: 'ISBN', card: 'meta', render: (b) => <span className="mono">{b.isbn}</span> },
    { key: 'reason', header: 'Reason', card: 'meta', render: (b) => <span className="td-clip">{b.reason || <span className="td-muted">—</span>}</span> },
    { key: 'by', header: 'Added by', card: 'meta', render: (b) => <Person name={b.addedByName} /> },
    { key: 'added', header: 'Added', card: 'meta', render: (b) => <span className="td-muted">{formatDate(b.createdAt, { year: 'numeric' })}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      card: 'action',
      render: (b) => (
        <span className="row-actions">
          <IconButton icon={Trash2} label={`Unblock ${b.title || b.isbn}`} size={15} onClick={() => setDeleting(b)} />
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Blocked books"
        eyebrow="Masters"
        description="Books the store doesn’t take. When staff scan one of these ISBNs it is rejected right away, before it goes on a shelf."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
            Add book
          </Button>
        }
      />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search ISBN, title, author" />
        {data && <span className="toolbar__note">{data.length} blocked</span>}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          refreshing={refreshing}
          caption="Blocked books"
          empty={
            <EmptyState title={dq ? 'No blocked book found' : 'No blocked books'}>
              {dq ? `Nothing matches “${dq}”.` : 'Add a book by its ISBN. Staff scanning it are told it isn’t accepted.'}
            </EmptyState>
          }
        />
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add blocked book" description="Enter the ISBN. The details are fetched the same way as a staff scan." size="sm">
        {adding && (
          <AddForm
            onClose={() => setAdding(false)}
            onSaved={(b) => toast({ title: `${b.title || b.isbn} blocked`, description: 'Staff scanning it will be told it isn’t accepted.' })}
          />
        )}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        size="sm"
        title={`Unblock “${deleting?.title || deleting?.isbn || ''}”?`}
        description="It is removed from the list, and staff can scan and submit this ISBN again. Books already rejected stay rejected."
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" icon={Trash2} loading={busy} onClick={remove}>
              Unblock
            </Button>
          </>
        }
      />
    </div>
  )
}

function AddForm({ onClose, onSaved }) {
  const [isbn, setIsbn] = useState('')
  const [found, setFound] = useState(null) // the looked-up book (or {isbn, manual: true} when no record exists)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [looking, setLooking] = useState(false)
  const [saving, setSaving] = useState(false)
  const check = checkIsbn(isbn)

  const lookUp = async (e) => {
    e?.preventDefault()
    if (!check.isbn13) {
      setErr('Enter a valid ISBN-10 or ISBN-13.')
      return
    }
    setErr('')
    setFound(null)
    setLooking(true)
    try {
      const m = await lookupBlockIsbn(check.isbn13)
      if (m.blocked) setErr('This ISBN is already blocked.')
      else {
        setFound(m)
        setTitle(m.title)
        setAuthor(m.author)
      }
    } catch (x) {
      if (x.code === 'not_found') {
        setFound({ isbn: check.isbn13, manual: true })
        setTitle('')
        setAuthor('')
      } else setErr(x.message)
    } finally {
      setLooking(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setErr('')
    try {
      const saved = await addBlockedBook({ ...found, title: title.trim(), author: author.trim(), reason: reason.trim() })
      onSaved(saved)
      onClose()
    } catch (x) {
      setErr(x.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="form-stack">
      <form onSubmit={lookUp} className="blocked-lookup">
        <Field label="ISBN" htmlFor="blocked-isbn" error={!found ? err : ''} hint="ISBN-10 or ISBN-13, from the barcode on the back cover.">
          <Input
            id="blocked-isbn"
            mono
            inputMode="numeric"
            value={isbn}
            onChange={(e) => {
              setIsbn(e.target.value)
              setFound(null)
              setErr('')
            }}
            placeholder="978…"
            maxLength={17}
            data-autofocus
          />
        </Field>
        <Button type="submit" icon={Search} loading={looking} disabled={!isbn.trim()}>
          Fetch details
        </Button>
      </form>

      {looking && <Skeleton h={96} r={8} />}

      {found && (
        <>
          <div className="blocked-preview">
            <BookCover title={title || 'Untitled'} author={author} isbn={found.isbn} photo={found.coverUrl || null} size="md" />
            <div className="blocked-preview__info">
              {found.manual ? (
                <p className="field__hint">No record for this ISBN in Google Books or Open Library. You can still block it — add a title so it’s easy to find.</p>
              ) : (
                <>
                  <strong>{found.title}</strong>
                  <span>{found.author || 'Unknown author'}</span>
                  <span className="td-muted">{[found.publisher, found.year].filter(Boolean).join(' · ')}</span>
                </>
              )}
              <span className="mono td-muted">{found.isbn}</span>
            </div>
          </div>
          {found.manual && (
            <>
              <Field label="Title" optional htmlFor="blocked-title">
                <Input id="blocked-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
              </Field>
              <Field label="Author" optional htmlFor="blocked-author">
                <Input id="blocked-author" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={255} />
              </Field>
            </>
          )}
          <Field label="Reason" optional htmlFor="blocked-reason" hint="Shown to staff when they scan it." error={err}>
            <Input id="blocked-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Not sold in this store" />
          </Field>
        </>
      )}

      <div className="form-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="danger" icon={Ban} loading={saving} disabled={!found} onClick={save}>
          Block book
        </Button>
      </div>
    </div>
  )
}
