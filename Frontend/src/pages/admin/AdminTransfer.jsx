import { useState } from 'react'
import { Crown, Send, ShieldAlert } from 'lucide-react'
import { approveAdminTransfer, completeAdminTransfer, resendAdminTransferCode, startAdminTransfer } from '../../services/authApi'
import { useCountdown } from '../../hooks/useCountdown'
import { Button } from '../../components/ui/Button'
import { CodeInput } from '../../components/ui/CodeInput'

const RESEND_WAIT_SECONDS = 30
// Time is read outside the component (React's purity rule): the moment `seconds` from now.
const inSeconds = (seconds) => Date.now() + seconds * 1000
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// Backend codes that mean "this code is finished, ask for a new one".
const FINISHED = ['otp_locked', 'otp_expired', 'otp_invalid_challenge']

/**
 * Make a staff member the Super Admin. Two codes are needed:
 *   1. a code sent to YOUR email approves the transfer
 *   2. a code sent to THEIR email proves their account is real
 * Then they become the Super Admin and you become a staff account (onDone signs you out).
 */
export default function AdminTransfer({ staff, onDone, onClose }) {
  const name = staff.full_name || staff.email
  const [step, setStep] = useState('intro') // intro | admin | staff
  const [challenge, setChallenge] = useState(null) // { token, hint, expiresAt }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [codeKey, setCodeKey] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const secondsLeft = useCountdown(challenge?.expiresAt ?? 0)
  const resendIn = useCountdown(resendAt)
  const expired = !!challenge && secondsLeft === 0

  const begin = (data, nextStep) => {
    setChallenge({ token: data.challenge, hint: data.email_hint, expiresAt: inSeconds(data.expires_in) })
    setResendAt(inSeconds(RESEND_WAIT_SECONDS))
    setCodeKey((k) => k + 1)
    setStep(nextStep)
  }

  const fail = (e) => {
    const code = e.data?.code
    if (code === 'otp_incorrect') {
      const left = e.data.attempts_left
      setError(`That code is not correct. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`)
      setCodeKey((k) => k + 1)
    } else if (FINISHED.includes(code)) {
      setError(`${e.message} Send a new code.`)
      setChallenge(null)
      setResendAt(0)
    } else if (code === 'otp_resend_cooldown') {
      setResendAt(inSeconds(e.data.retry_after || RESEND_WAIT_SECONDS))
      setError(e.message)
    } else if (code === 'transfer_not_approved') {
      setStep('intro')
      setChallenge(null)
      setError(e.message)
    } else {
      setError(e.status === 0 ? 'Cannot reach the server. Check your connection and try again.' : e.message)
    }
  }

  const run = async (work) => {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  // Step 1: a code to your own email.
  const sendAdminCode = () => run(async () => begin(await startAdminTransfer(staff.id), 'admin'))
  // Step 2: your code approves; a second code goes to the staff member.
  const approve = (otp) => run(async () => begin(await approveAdminTransfer(staff.id, { challenge: challenge.token, otp }), 'staff'))
  const sendStaffCode = () => run(async () => begin(await resendAdminTransferCode(staff.id), 'staff'))
  // Step 3: their code completes the transfer.
  const complete = (otp) => run(async () => onDone(await completeAdminTransfer(staff.id, { challenge: challenge.token, otp })))

  if (step === 'intro')
    return (
      <div className="transfer">
        <div className="transfer__warn">
          <ShieldAlert size={18} aria-hidden />
          <div>
            <strong>{name} will become the Super Admin.</strong>
            <span>You will become a staff account and be signed out. Only the new Super Admin can make you admin again.</span>
          </div>
        </div>
        <ol className="transfer__steps">
          <li>We send a code to <strong>your</strong> email to approve it.</li>
          <li>We send a code to <strong>{staff.email}</strong>. Ask {name} for it.</li>
        </ol>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <span style={{ flex: 1 }} />
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="dark" icon={Send} onClick={sendAdminCode} loading={busy}>
            Send code to my email
          </Button>
        </div>
      </div>
    )

  const resend = step === 'admin' ? sendAdminCode : sendStaffCode
  return (
    <div className="transfer">
      <p className="transfer__text">
        {step === 'admin' ? (
          <>
            Step 1 of 2: enter the code sent to <strong>{challenge?.hint ?? 'your email'}</strong> (your email) to approve the transfer.
          </>
        ) : (
          <>
            Step 2 of 2: enter the code sent to <strong>{challenge?.hint ?? staff.email}</strong>. Ask {name} for it.
          </>
        )}
      </p>
      {challenge && !expired && <CodeInput key={codeKey} compact onComplete={step === 'admin' ? approve : complete} disabled={busy} hasError={!!error} label="Confirmation code" />}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <p className="transfer__text transfer__text--muted">{!challenge || expired ? 'This code has expired.' : `Code expires in ${clock(secondsLeft)}`}</p>
      <div className="form-actions">
        <Button size="sm" icon={Send} onClick={resend} disabled={busy || (resendIn > 0 && !!challenge && !expired)}>
          {challenge && !expired ? (resendIn > 0 ? `Send again in ${clock(resendIn)}` : 'Send again') : 'Send a new code'}
        </Button>
        <span style={{ flex: 1 }} />
        <Button size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
      {step === 'staff' && (
        <p className="transfer__text transfer__text--muted">
          <Crown size={13} aria-hidden /> When this code is right, {name} becomes the Super Admin right away.
        </p>
      )}
    </div>
  )
}
