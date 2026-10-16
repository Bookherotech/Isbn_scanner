import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, MailCheck } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useCountdown } from '../../hooks/useCountdown'
import { resendOtp } from '../../services/authApi'
import { Button } from '../../components/ui/Button'
import { cn } from '../../utils/format'

const LENGTH = 4
const RESEND_WAIT_SECONDS = 30
// Backend codes that mean "this sign-in is over, start again from the password step".
const RESTART_CODES = ['otp_locked', 'otp_expired', 'otp_invalid_challenge']

// Time is read outside the component (React's purity rule); this is the moment `seconds` from now.
const inSeconds = (seconds) => Date.now() + seconds * 1000
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/**
 * Second sign-in step for the Super Admin: the 4-digit code that was emailed.
 * onDone(user) after a correct code; onRestart(message) when the sign-in must begin again.
 */
export default function OtpStep({ challenge, emailHint, expiresAt: firstExpiry, remember, onDone, onRestart }) {
  const { signInWithOtp } = useAuth()
  const [digits, setDigits] = useState(() => Array(LENGTH).fill(''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [expiresAt, setExpiresAt] = useState(firstExpiry)
  const [resendAt, setResendAt] = useState(() => inSeconds(RESEND_WAIT_SECONDS))
  const [focusTick, setFocusTick] = useState(0)
  const boxes = useRef([])
  const secondsLeft = useCountdown(expiresAt)
  const resendIn = useCountdown(resendAt)
  const expired = secondsLeft === 0

  const focusBox = (index) => boxes.current[index]?.focus()
  const clearBoxes = () => {
    setDigits(Array(LENGTH).fill(''))
    setFocusTick((tick) => tick + 1)
  }

  // Put the cursor back on the first box once a clear has been rendered (the boxes are enabled again by then).
  useEffect(() => {
    if (focusTick) boxes.current[0]?.focus()
  }, [focusTick])

  const verify = async (code) => {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      onDone(await signInWithOtp({ challenge, otp: code, remember }))
    } catch (e) {
      const left = e.data?.attempts_left
      if (RESTART_CODES.includes(e.data?.code) || left === 0) {
        onRestart(left === 0 ? 'Too many incorrect codes. Please sign in again.' : e.message)
        return
      }
      setError(e.data?.code === 'otp_incorrect' ? `That code is not correct. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.` : e.message)
      setBusy(false)
      clearBoxes()
    }
  }

  const change = (index, value) => {
    const entered = value.replace(/\D/g, '')
    const next = [...digits]
    if (!entered) {
      next[index] = ''
      setDigits(next)
      return
    }
    // A paste (or fast typing) can bring several digits at once: spread them over the next boxes.
    entered
      .slice(0, LENGTH - index)
      .split('')
      .forEach((digit, offset) => {
        next[index + offset] = digit
      })
    setDigits(next)
    focusBox(Math.min(index + entered.length, LENGTH - 1))
    if (next.every(Boolean)) verify(next.join(''))
  }

  const keyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) focusBox(index - 1)
    if (e.key === 'ArrowLeft' && index > 0) focusBox(index - 1)
    if (e.key === 'ArrowRight' && index < LENGTH - 1) focusBox(index + 1)
  }

  const submit = (e) => {
    e.preventDefault()
    if (digits.every(Boolean) && !busy && !expired) verify(digits.join(''))
  }

  const resend = async () => {
    setError('')
    setInfo('')
    try {
      const { expires_in: expiresIn } = await resendOtp({ challenge })
      setExpiresAt(inSeconds(expiresIn))
      setResendAt(inSeconds(RESEND_WAIT_SECONDS))
      setInfo('A new code is on its way to your email.')
      clearBoxes()
    } catch (e) {
      const code = e.data?.code
      if (code === 'otp_resend_cooldown') setResendAt(inSeconds(e.data.retry_after || RESEND_WAIT_SECONDS))
      if (['otp_expired', 'otp_invalid_challenge', 'otp_resend_limit'].includes(code)) onRestart(e.message)
      else setError(e.message)
    }
  }

  return (
    <div className="login__form-wrap">
      <span className="otp__badge">
        <MailCheck size={22} aria-hidden />
      </span>
      <h1 className="login__title">Check your email</h1>
      <p className="login__sub">
        We sent a {LENGTH}-digit code to <strong>{emailHint}</strong>. Enter it to finish signing in as Super Admin.
      </p>

      <form onSubmit={submit} noValidate>
        <div className={cn('otp', error && 'has-error')} role="group" aria-label="Verification code">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                boxes.current[index] = el
              }}
              className={cn('otp__box', digit && 'is-filled')}
              value={digit}
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              aria-label={`Digit ${index + 1} of ${LENGTH}`}
              autoFocus={index === 0}
              disabled={busy || expired}
              onChange={(e) => change(index, e.target.value)}
              onKeyDown={(e) => keyDown(index, e)}
              onFocus={(e) => e.target.select()}
            />
          ))}
        </div>

        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}
        {info && !error && (
          <p className="login__note" role="status">
            {info}
          </p>
        )}
        <p className={cn('otp__timer', expired && 'is-expired')}>{expired ? 'This code has expired. Sign in again to get a new one.' : `Code expires in ${clock(secondsLeft)}`}</p>

        {expired ? (
          <Button type="button" variant="dark" size="lg" block iconRight={ArrowRight} onClick={() => onRestart('')}>
            Sign in again
          </Button>
        ) : (
          <Button type="submit" variant="dark" size="lg" block iconRight={ArrowRight} loading={busy} disabled={!digits.every(Boolean)}>
            Verify and sign in
          </Button>
        )}
      </form>

      <div className="otp__links">
        <button type="button" className="login__forgot" onClick={() => onRestart('')}>
          <ArrowLeft size={13} aria-hidden /> Back to sign in
        </button>
        {!expired && (
          <button type="button" className="login__forgot" onClick={resend} disabled={busy || resendIn > 0}>
            {resendIn > 0 ? `Resend code in ${clock(resendIn)}` : 'Resend code'}
          </button>
        )}
      </div>
    </div>
  )
}
