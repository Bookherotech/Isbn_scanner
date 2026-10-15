import { useState } from 'react'
import { Check, Flag } from 'lucide-react'
import { reviewFlag } from '../../services/mockApi'
import { useToast } from '../../hooks/useToast'
import { Input } from '../ui/Form'
import { Button } from '../ui/Button'
import { FlagChips } from '../ui/Status'
import { cn, formatDateTime } from '../../utils/format'

/** Flag panel shown on the admin review + book detail screens. */
export function FlagReviewCard({ item, onReviewed }) {
  const { toast } = useToast()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (!item.flags?.length) return null
  return (
    <section className={cn('review__card flagreview', item.flagHold && 'is-hold')}>
      <h2 className="review__h">
        <Flag size={14} aria-hidden /> Content flags
      </h2>
      <FlagChips flags={item.flags} reviewed={!item.flagHold} max={6} />
      <p className="flagreview__why">Matched on {[...new Set(item.flags.map((f) => `“${f.matched}”`))].join(', ')} in the book’s subjects or title.</p>
      {item.flagHold ? (
        <div className="flagreview__act">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (optional)" aria-label="Review note" />
          <Button
            icon={Check}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              await reviewFlag(item.id, note.trim())
              setBusy(false)
              toast({ title: 'Flag reviewed', description: 'Noted in the activity log.' })
              onReviewed?.()
            }}
          >
            Mark reviewed
          </Button>
        </div>
      ) : item.flagReviewedAt ? (
        <p className="flagreview__done">
          <Check size={14} className="ok" aria-hidden /> Reviewed by {item.flagReviewedByName} · {formatDateTime(item.flagReviewedAt)}
          {item.flagNote && <em> — {item.flagNote}</em>}
        </p>
      ) : (
        <p className="flagreview__done">Label only — no review needed.</p>
      )}
    </section>
  )
}
