import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, LayoutDashboard, Lock, Mail, Smartphone } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/Button'
import { Checkbox, Field } from '../../components/ui/Form'
import { Barcode } from '../../components/ui/Misc'
import { DemoBadge } from '../../components/layout/DemoControls'
import OtpStep from './OtpStep'

// Time is read outside the component (React's purity rule).
const inSeconds = (seconds) => Date.now() + seconds * 1000

export default function Login() {
  const { user, signIn, signInWithPassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [otp, setOtp] = useState(null) // set when a code was emailed to the Super Admin

  if (user && !busy) {
    const from = location.state?.from
    return <Navigate to={from && from.startsWith(`/${user.role}`) ? from : user.role === 'admin' ? '/admin' : '/staff'} replace />
  }

  const go = async (opts, key) => {
    setBusy(key)
    setError('')
    try {
      const u = await signIn({ ...opts, remember })
      const from = location.state?.from
      navigate(from && from.startsWith(`/${u.role}`) ? from : u.role === 'admin' ? '/admin' : '/staff', { replace: true })
    } catch (e) {
      setError(e.message)
      setBusy('')
    }
  }

  const finish = (u) => {
    const from = location.state?.from
    navigate(from && from.startsWith(`/${u.role}`) ? from : u.role === 'admin' ? '/admin' : '/staff', { replace: true })
  }

  // The sign-in cannot continue (wrong code too often, code expired...): back to the password step.
  const restart = (message) => {
    setOtp(null)
    setPassword('')
    setBusy('')
    setError(message)
  }

  // Real sign-in: email + password checked by the Django backend; the role comes from the account.
  const submit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy('form')
    setError('')
    try {
      const result = await signInWithPassword({ email: username, password, remember })
      if (result.otpRequired) {
        // Super Admin: the code was emailed, ask for it before signing in.
        setOtp({ challenge: result.challenge, emailHint: result.emailHint, expiresAt: inSeconds(result.expiresIn) })
        setBusy('')
        return
      }
      finish(result)
    } catch (e) {
      setError(e.message)
      setBusy('')
    }
  }

  return (
    <div className="login">
      <section className="login__brand" aria-hidden>
        <div className="login__bolt" />
        <div className="login__brand-inner">
          <img src="/logo-512.webp" alt="" width={196} height={196} className="login__logo" />
          <h2 className="login__headline">
            Every book.
            <br />
            Scanned, shelved
            <br />
            and <span>live.</span>
          </h2>
          <ul className="login__steps">
            <li>
              <span>01</span> Scan the ISBN
            </li>
            <li>
              <span>02</span> Check &amp; correct metadata
            </li>
            <li>
              <span>03</span> Pick the shelf, enter quantity
            </li>
            <li>
              <span>04</span> Admin approves — live on Shopify
            </li>
          </ul>
          <div className="login__barcode">
            <Barcode value="9780141182636" height={26} />
          </div>
        </div>
      </section>

      <section className="login__panel">
        <div className="login__top">
          <span className="login__mobile-logo">
            <img src="/logo.webp" alt="BookHero" width={56} height={56} />
          </span>
          <DemoBadge />
        </div>
        {otp && <OtpStep {...otp} remember={remember} onDone={finish} onRestart={restart} />}
        <div className="login__form-wrap" hidden={!!otp}>
          <h1 className="login__title">Sign in to BookHero</h1>
          <p className="login__sub">Inventory automation for physical books.</p>

          <form className="login__form" onSubmit={submit} noValidate>
            <Field label="Email" htmlFor="u">
              <div className="input-icon">
                <Mail size={16} aria-hidden />
                <input id="u" className="input" type="email" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="you@bookhero.com" />
              </div>
            </Field>
            <Field label="Password" htmlFor="p">
              <div className="input-icon">
                <Lock size={16} aria-hidden />
                <input id="p" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
            </Field>
            <div className="login__row">
              <Checkbox label="Remember me" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <button type="button" className="login__forgot" onClick={() => setError('Password reset is handled by your admin in this release.')}>
                Forgot password?
              </button>
            </div>
            {error && (
              <p className="login__error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" variant="dark" size="lg" block iconRight={ArrowRight} loading={busy === 'form'}>
              Sign in
            </Button>
          </form>

          <div className="login__divider">
            <span>Demo access — no password needed</span>
          </div>
          <div className="login__demo">
            <button className="login__demo-btn" onClick={() => go({ role: 'admin' }, 'admin')} disabled={!!busy}>
              <span className="login__demo-icon">
                <LayoutDashboard size={20} />
              </span>
              <span>
                <strong>Continue as Admin</strong>
                <em>Rachel Morgan · Super Admin · dashboard</em>
              </span>
              {busy === 'admin' ? <span className="spinner" /> : <ArrowRight size={17} />}
            </button>
            <button className="login__demo-btn" onClick={() => go({ role: 'staff' }, 'staff')} disabled={!!busy}>
              <span className="login__demo-icon login__demo-icon--staff">
                <Smartphone size={20} />
              </span>
              <span>
                <strong>Continue as Staff</strong>
                <em>Sarah Wilson · mobile scanning app</em>
              </span>
              {busy === 'staff' ? <span className="spinner" /> : <ArrowRight size={17} />}
            </button>
          </div>
        </div>
        <p className="login__foot">© BookHero · Prototype build for client review</p>
      </section>
    </div>
  )
}
