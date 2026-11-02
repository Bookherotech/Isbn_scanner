import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { approveAllPending, rejectAllPending } from '../../services/adminApi'
import { useToast } from '../../hooks/useToast'
import { Button } from '../../components/ui/Button'
import { Field, Textarea } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { cn } from '../../utils/format'

const REASONS = ['Incorrect metadata', 'Damaged book', 'Invalid shelf', 'Other']

const books = (n) => `${n} ${n === 1 ? 'book' : 'books'}`

/** The result message: how many were done, and any that were skipped or are left for another run. */
function report(verb, { done, skipped, remaining }) {
  const notes = []
  if (skipped) notes.push(`${books(skipped)} skipped because ${skipped === 1 ? 'it' : 'they'} changed meanwhile.`)
  if (remaining) notes.push(`${books(remaining)} still pending: run it again for the rest.`)
  return { title: `${books(done)} ${verb}`, description: notes.join(' ') || undefined }
}

const scope = (filtered, total) => (filtered ? `the ${books(total)} matching your filters` : `all ${books(total)} in this list`)

export function ApproveAllDialog({ open, onClose, total, filtered, filters }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    setBusy(true)
    try {
      toast(report('approved', await approveAllPending(filters)))
      onClose()
    } catch (e) {
      toast({ title: 'Couldn’t approve', description: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={`Approve ${books(total)}?`}
      description={`This approves ${scope(filtered, total)}. They go live, staff are notified, and they go to Shopify over the next few minutes.`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon={Check} loading={busy} onClick={confirm} data-autofocus>
            Approve all
          </Button>
        </>
      }
    >
      <p className="field__hint">Books flagged for review are not included. Approval can’t be undone from here.</p>
    </Modal>
  )
}

export function RejectAllDialog({ open, onClose, total, filtered, filters }) {
  const { toast } = useToast()
  const [reason, setReason] = useState(REASONS[0])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const needsNote = reason === 'Other'
  const confirm = async () => {
    setBusy(true)
    try {
      toast(report('rejected', await rejectAllPending(filters, { reason, note: note.trim() })))
      setNote('')
      onClose()
    } catch (e) {
      toast({ title: 'Couldn’t reject', description: e.data?.note?.[0] || e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={`Reject ${books(total)}?`}
      description={`This rejects ${scope(filtered, total)} with the same reason, and notifies the staff who submitted them. Rejection can’t be undone.`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" icon={X} loading={busy} disabled={needsNote && !note.trim()} onClick={confirm}>
            Reject all
          </Button>
        </>
      }
    >
      <fieldset className="reasons">
        <legend className="field__label">Reason</legend>
        {REASONS.map((r, i) => (
          <label key={r} className={cn('reason', reason === r && 'is-active')}>
            <input type="radio" name="bulk-reason" value={r} checked={reason === r} onChange={() => setReason(r)} data-autofocus={i === 0 ? '' : undefined} />
            <span className="reason__dot" aria-hidden />
            {r}
          </label>
        ))}
      </fieldset>
      <Field label="Note" optional={!needsNote} htmlFor="bulk-reject-note" hint="Shown to the staff members.">
        <Textarea id="bulk-reject-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? 'Describe the reason' : ''} />
      </Field>
    </Modal>
  )
}
