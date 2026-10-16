import { useState } from 'react'
import { BadgeCheck, Pencil, Send } from 'lucide-react'
import { confirmEmailChange, confirmEmailVerification, sendEmailVerification, startEmailChange } from '../../services/authApi'
import { useCountdown } from '../../hooks/useCountdown'
import { Field, Input } from '../../components/ui/Form'
import { Button } from '../../components/ui/Button'
import { CodeInput } from '../../components/ui/CodeInput'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESEND_WAIT_SECONDS = 30
// Time is read outside the component (React's purity rule): the moment `seconds` from now.
const inSeconds = (seconds) => Date.now() + seconds * 1000
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// Backend codes that mean "this code is finished, ask for a new one".
const FINISHED = ['otp_locked', 'otp_expired', 'otp_invalid_challenge']

/**
 * The email row of the Edit dialog. The email is locked; the pencil starts a two-code change:
 *   1. type the new email and press Send OTP: a code goes to the ADMIN's own inbox
 *   2. enter it: the email changes, and a second code goes to the NEW address
 *   3. enter that one too: it proves the new address is real
 */
export default function StaffEmailChange({ staff, onChanged }) {
  const [step, setStep] = useState('idle') // idle | enter | approve | verify | resend-verify
  const [newEmail, setNewEmail] = useState('')
  const [challenge, setChallenge] = useState(null) // { token, hint, expiresAt }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [codeKey, setCodeKey] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const secondsLeft = useCountdown(challenge?.expiresAt ?? 0)
  const resendIn = useCountdown(resendAt)
  const expired = !!challenge && secondsLeft === 0

  const reset = () => {
    setStep('idle')
    setNewEmail('')
    setChallenge(null)
    setError('')
  }

  const fail = (e) => {
    const code = e.data?.code
    if (code === 'otp_incorrect') {
      const left = e.data.attempts_left
      setError(`That code is not correct. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`)
      setCodeKey((k) => k + 1)
    } else if (FINISHED.includes(code)) {
      setError(`${e.message} Send a new code.`)
      setCodeKey((k) => k + 1)
      setChallenge(null)
      setResendAt(0)
    } else if (code === 'otp_resend_cooldown') {
      setResendAt(inSeconds(e.data.retry_after || RESEND_WAIT_SECONDS))
      setError(e.message)
    } else {
      setError(e.status === 0 ? 'Cannot reach the server. Check your connection and try again.' : e.data?.new_email?.[0] || e.message)
    }
  }

  const begin = (data, nextStep) => {
    setChallenge({ token: data.challenge, hint: data.email_hint, expiresAt: inSeconds(data.expires_in) })
    setResendAt(inSeconds(RESEND_WAIT_SECONDS))
    setCodeKey((k) => k + 1)
    setStep(nextStep)
  }

  // Step 1: ask for the admin's code.
  const sendApprovalCode = async () => {
    const email = newEmail.trim()
    if (!EMAIL_PATTERN.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    setBusy(true)
    setError('')
    try {
      begin(await startEmailChange(staff.id, email), 'approve')
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  // Step 2: the admin's code changes the email; a second code goes to the new address.
  const approve = async (otp) => {
    setBusy(true)
    setError('')
    try {
      const { user, verification } = await confirmEmailChange(staff.id, { challenge: challenge.token, otp })
      onChanged(user)
      if (verification) begin({ challenge: verification.challenge, email_hint: verification.email_hint, expires_in: verification.expires_in }, 'verify')
      else {
        setChallenge(null)
        setStep('resend-verify')
        setError('The email was changed, but we could not email the new address. Send the code again.')
      }
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  // Step 3: the new address's code proves it is real.
  const verify = async (otp) => {
    setBusy(true)
    setError('')
    try {
      onChanged(await confirmEmailVerification(staff.id, { challenge: challenge.token, otp }))
      reset()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  // (Re)send the code to the address that is already saved but not verified yet.
  const sendVerificationCode = async () => {
    setBusy(true)
    setError('')
    try {
      begin(await sendEmailVerification(staff.id), 'verify')
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const resend = step === 'approve' ? sendApprovalCode : sendVerificationCode
  const resendLabel = resendIn > 0 ? `Send again in ${clock(resendIn)}` : 'Send again'

  if (step === 'idle')
    return (
      <Field label="Email" htmlFor="edit-staff-email" hint="Changing the email needs a code from you and a code from the new address.">
        <div className="email-change__row">
          <Input id="edit-staff-email" type="email" value={staff.email} disabled readOnly />
          <Button size="sm" icon={Pencil} onClick={() => setStep('enter')}>
            Edit
          </Button>
        </div>
        {!staff.email_verified && (
          <p className="email-change__links">
            <span className="email-unverified">Not verified yet</span>
            <Button size="sm" icon={Send} onClick={sendVerificationCode} loading={busy}>
              Send verification code
            </Button>
          </p>
        )}
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </Field>
    )

  return (
    <div className="email-change">
      <strong>Change email for {staff.full_name || staff.email}</strong>

      {step === 'enter' && (
        <>
          <Field label="New email" htmlFor="edit-staff-new-email" error={error}>
            <Input id="edit-staff-new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@bookhero.store" autoComplete="off" data-autofocus />
          </Field>
          <p className="email-change__text">We will send a code to <strong>your</strong> email to approve this change.</p>
          <div className="email-change__links">
            <Button size="sm" onClick={reset} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" variant="dark" icon={Send} onClick={sendApprovalCode} loading={busy}>
              Send OTP
            </Button>
          </div>
        </>
      )}

      {(step === 'approve' || step === 'verify') && (
        <>
          <p className="email-change__text">
            {step === 'approve' ? (
              <>
                Step 1 of 2: enter the code sent to <strong>{challenge?.hint ?? 'your email'}</strong> (your email) to approve changing it to <strong>{newEmail.trim().toLowerCase()}</strong>.
              </>
            ) : (
              <>
                Step 2 of 2: the email is changed. Now enter the code sent to <strong>{challenge?.hint ?? 'the new address'}</strong> to confirm it is real. Ask {staff.full_name || 'the staff member'} for it.
              </>
            )}
          </p>
          {challenge && !expired && <CodeInput key={codeKey} compact onComplete={step === 'approve' ? approve : verify} disabled={busy} hasError={!!error} label="Confirmation code" />}
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <p className="email-change__text">{!challenge || expired ? 'This code has expired.' : `Code expires in ${clock(secondsLeft)}`}</p>
          <div className="email-change__links">
            <Button size="sm" onClick={reset} disabled={busy}>
              {step === 'verify' ? 'Do this later' : 'Cancel'}
            </Button>
            <Button size="sm" icon={Send} onClick={resend} disabled={busy || (resendIn > 0 && !!challenge && !expired)}>
              {challenge && !expired ? resendLabel : 'Send a new code'}
            </Button>
          </div>
        </>
      )}

      {step === 'resend-verify' && (
        <>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <div className="email-change__links">
            <Button size="sm" onClick={reset}>
              Do this later
            </Button>
            <Button size="sm" variant="dark" icon={BadgeCheck} onClick={sendVerificationCode} loading={busy}>
              Send the code
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
