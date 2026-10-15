import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, CircleAlert, Info } from 'lucide-react'
import { checkIsbn } from '../../services/isbn'
import { DEMO_ISBNS } from '../../services/catalog'
import { useDraft } from '../../hooks/useDraft'
import { FlowHeader, BottomBar } from '../../components/staff/StaffBits'
import { Button } from '../../components/ui/Button'
import { cn } from '../../utils/format'

export default function ManualIsbn() {
  const navigate = useNavigate()
  const { setDraft } = useDraft()
  const [raw, setRaw] = useState('')
  const [touched, setTouched] = useState(false)
  const check = checkIsbn(raw)
  const ok = check.state === 'valid' || check.state === 'converted'
  const showError = check.state === 'invalid' || (touched && check.state === 'typing')

  const submit = (e) => {
    e?.preventDefault()
    setTouched(true)
    if (!ok) return
    setDraft(null)
    navigate(`/staff/book/${check.isbn13}`)
  }

  return (
    <div className="flow">
      <FlowHeader title="Enter ISBN" onBack={() => navigate('/staff')} close />
      <form className="flow__body manual" onSubmit={submit} noValidate>
        <label htmlFor="isbn" className="manual__label">
          ISBN
        </label>
        <input
          id="isbn"
          className={cn('manual__input mono', showError && 'is-invalid', ok && 'is-valid')}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="9780141182636"
          value={raw}
          maxLength={17}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-describedby="isbn-help"
          aria-invalid={showError}
        />
        <p id="isbn-help" className={cn('manual__help', ok && 'is-ok', showError && 'is-bad')}>
          {ok ? <CheckCircle2 size={15} aria-hidden /> : showError ? <CircleAlert size={15} aria-hidden /> : <Info size={15} aria-hidden />}
          {check.message}
        </p>

        <div className="manual__demo">
          <p className="eyebrow">Demo ISBNs — tap to fill</p>
          <ul>
            {DEMO_ISBNS.map((d) => (
              <li key={d.isbn}>
                <button
                  type="button"
                  onClick={() => {
                    setRaw(d.isbn)
                    setTouched(true)
                  }}
                >
                  <span className="mono">{d.isbn}</span>
                  <span>
                    <strong>{d.label}</strong> {d.note}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </form>
      <BottomBar>
        <Button variant="primary" size="xl" block iconRight={ArrowRight} disabled={!ok} onClick={submit}>
          Find book
        </Button>
      </BottomBar>
    </div>
  )
}
