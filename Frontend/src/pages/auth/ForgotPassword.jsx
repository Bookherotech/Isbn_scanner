import { useState } from 'react'
import { ArrowLeft, ArrowRight, KeyRound, Lock, Mail, MailCheck } from 'lucide-react'
import { confirmPasswordReset, requestPasswordReset, verifyPasswordResetCode } from '../../services/authApi'
import { useCountdown } from '../../hooks/useCountdown'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Form'
import { CodeInput } from '../../components/ui/CodeInput'
import { cn } from '../../utils/format'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESEND_WAIT_SECONDS = 30
// Backend codes that mean "this code is finished": start again from the email step.
const RESTART_CODES = ['otp_locked', 'otp_expired', 'otp_invalid_challenge']

// Time is read outside the component (React's purity rule): the moment `seconds` from now.
const inSeconds = (seconds) => Date.now() + seconds * 1000
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
const first = (messages) => (Array.isArray(messages) ? messages[0] : messages)

/**
 * "Forgot password", three steps: the email (prefilled from the sign-in form) -> the 4-digit code
 * that was emailed -> the new password. onDone(message) goes back to sign-in; onBack() leaves.
 */
export default function ForgotPassword({ initialEmail, onBack, onDone }) {
  const [step, setStep] = useState('email') // email | code | password
  const [email, setEmail] = useState(initialEmail || '')
  const [challenge, setChallenge] = useState(null) // { token, hint, expiresAt }
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [codeKey, setCodeKey] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const secondsLeft = useCountdown(challenge?.expiresAt ?? 0)
  const resendIn = useCountdown(resendAt)
  const expired = !!challenge && secondsLeft === 0

  const backToEmail = (message) => {
    setStep('email')
    setChallenge(null)
    setResetToken('')
    setErrors(message ? { form: message } : {})
  }

  const networkOr = (e, fallback) => (e.status === 0 ? 'Cannot reach the server. Check your connection and try again.' : fallback)

  // Step 1: email a code (also used by "Send again").
  const sendCode = async (e) => {
    e?.preventDefault()
    if (!EMAIL_PATTERN.test(email.trim())) {
      setErrors({ email: 'Enter a valid email address.' })
      return
    }
    setBusy(true)
    setErrors({})
    try {
      const data = await requestPasswordReset(email)
      setChallenge({ token: data.challenge, hint: data.email_hint, expiresAt: inSeconds(data.expires_in) })
      setResendAt(inSeconds(RESEND_WAIT_SECONDS))
      setCodeKey((k) => k + 1)
      setStep('code')
    } catch (error) {
      const code = error.data?.code
      if (code === 'no_account') setErrors({ email: 'No account found with this email.' })
      else if (code === 'otp_resend_cooldown') {
        setResendAt(inSeconds(error.data.retry_after || RESEND_WAIT_SECONDS))
        setErrors({ form: `A code was just sent. Check your inbox, or try again in ${error.data.retry_after || RESEND_WAIT_SECONDS} seconds.` })
      } else setErrors({ form: networkOr(error, error.message) })
    } finally {
      setBusy(false)
    }
  }

  // Step 2: the code from the email.
  const checkCode = async (otp) => {
    setBusy(true)
    setErrors({})
    try {
      const { reset_token: token } = await verifyPasswordResetCode({ challenge: challenge.token, otp })
      setResetToken(token)
      setStep('password')
    } catch (error) {
      const code = error.data?.code
      if (code === 'otp_incorrect') {
        const left = error.data.attempts_left
        setErrors({ form: `That code is not correct. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.` })
        setCodeKey((k) => k + 1)
      } else if (RESTART_CODES.includes(code)) backToEmail(`${error.message} Please start again.`)
      else setErrors({ form: networkOr(error, error.message) })
    } finally {
      setBusy(false)
    }
  }

  // Step 3: the new password.
  const changePassword = async (e) => {
    e.preventDefault()
    const found = {}
    if (!password) found.password = 'Enter a new password.'
    if (!confirmPassword) found.confirmPassword = 'Re-enter the new password.'
    else if (password !== confirmPassword) found.confirmPassword = 'Passwords do not match.'
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      await confirmPasswordReset({ resetToken, password, confirmPassword })
      onDone('Password changed. Sign in with your new password.')
    } catch (error) {
      const data = error.data || {}
      if (data.code === 'reset_token_invalid') {
        backToEmail('This reset session has expired. Please start again.')
        return
      }
      const server = { password: first(data.password), confirmPassword: first(data.confirm_password) }
      setErrors({ ...server, form: Object.values(server).some(Boolean) ? '' : networkOr(error, error.message) })
    } finally {
      setBusy(false)
    }
  }

  const formError = errors.form && (
    <p className="login__error" role="alert">
      {errors.form}
    </p>
  )

  if (step === 'email')
    return (
      <div className="login__form-wrap">
        <span className="otp__badge">
          <KeyRound size={22} aria-hidden />
        </span>
        <h1 className="login__title">Forgot your password?</h1>
        <p className="login__sub">Enter the email of your account and we will send you a 4-digit code.</p>
        <form className="login__form" onSubmit={sendCode} noValidate>
          <Field label="Email" htmlFor="fp-email" error={errors.email}>
            <div className="input-icon">
              <Mail size={16} aria-hidden />
              <input id="fp-email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@bookhero.com" autoFocus />
            </div>
          </Field>
          {formError}
          <Button type="submit" variant="dark" size="lg" block iconRight={ArrowRight} loading={busy}>
            Next
          </Button>
        </form>
        <div className="otp__links">
          <button type="button" className="login__forgot" onClick={onBack}>
            <ArrowLeft size={13} aria-hidden /> Back to sign in
          </button>
        </div>
      </div>
    )

  if (step === 'code')
    return (
      <div className="login__form-wrap">
        <span className="otp__badge">
          <MailCheck size={22} aria-hidden />
        </span>
        <h1 className="login__title">Check your email</h1>
        <p className="login__sub">
          We sent a 4-digit code to <strong>{challenge?.hint}</strong>. Enter it to reset your password.
        </p>
        {!expired && <CodeInput key={codeKey} onComplete={checkCode} disabled={busy} hasError={!!errors.form} />}
        {formError}
        <p className={cn('otp__timer', expired && 'is-expired')}>{expired ? 'This code has expired.' : `Code expires in ${clock(secondsLeft)}`}</p>
        <div className="otp__links">
          <button type="button" className="login__forgot" onClick={() => backToEmail('')}>
            <ArrowLeft size={13} aria-hidden /> Change email
          </button>
          <button type="button" className="login__forgot" onClick={sendCode} disabled={busy || (resendIn > 0 && !expired)}>
            {expired ? 'Send a new code' : resendIn > 0 ? `Resend code in ${clock(resendIn)}` : 'Resend code'}
          </button>
        </div>
      </div>
    )

  return (
    <div className="login__form-wrap">
      <span className="otp__badge">
        <KeyRound size={22} aria-hidden />
      </span>
      <h1 className="login__title">Choose a new password</h1>
      <p className="login__sub">Your code was correct. Set a new password for {email.trim().toLowerCase()}.</p>
      <form className="login__form" onSubmit={changePassword} noValidate>
        <Field label="New password" htmlFor="fp-password" error={errors.password}>
          <div className="input-icon">
            <Lock size={16} aria-hidden />
            <input id="fp-password" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoFocus />
          </div>
        </Field>
        <Field label="Re-enter new password" htmlFor="fp-password-2" error={errors.confirmPassword}>
          <div className="input-icon">
            <Lock size={16} aria-hidden />
            <input id="fp-password-2" className="input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
          </div>
        </Field>
        {formError}
        <Button type="submit" variant="dark" size="lg" block iconRight={ArrowRight} loading={busy}>
          Change password
        </Button>
      </form>
      <div className="otp__links">
        <button type="button" className="login__forgot" onClick={() => backToEmail('')}>
          <ArrowLeft size={13} aria-hidden /> Start again
        </button>
      </div>
    </div>
  )
}
