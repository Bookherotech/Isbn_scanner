import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, LayoutDashboard, Lock, Smartphone, User } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/Button'
import { Checkbox, Field } from '../../components/ui/Form'
import { Barcode } from '../../components/ui/Misc'
import { DemoBadge } from '../../components/layout/DemoControls'

export default function Login() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  if (user && !busy) return <Navigate to={user.role === 'admin' ? '/admin' : '/staff'} replace />

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

  const submit = (e) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Enter your username and password.')
      return
    }
    go({ username, role: username.toLowerCase().includes('rachel') || username.toLowerCase().includes('admin') ? 'admin' : 'staff' }, 'form')
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
        <div className="login__form-wrap">
          <h1 className="login__title">Sign in to BookHero</h1>
          <p className="login__sub">Inventory automation for physical books.</p>

          <form className="login__form" onSubmit={submit} noValidate>
            <Field label="Email or username" htmlFor="u">
              <div className="input-icon">
                <User size={16} aria-hidden />
                <input id="u" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="sarah.wilson" />
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
