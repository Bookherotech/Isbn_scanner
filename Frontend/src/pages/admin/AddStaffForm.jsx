import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { createStaff } from '../../services/authApi'
import { COUNTRY_CODES } from '../../utils/countryCodes'
import { Field, Input } from '../../components/ui/Form'
import { PasswordInput } from '../../components/ui/PasswordInput'
import { Button } from '../../components/ui/Button'
import PhoneField from './PhoneField'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const first = (messages) => (Array.isArray(messages) ? messages[0] : messages)

// Live password checks while typing (the server checks again on save, incl. very common passwords).
function passwordChecks(password, { fullName, email }) {
  const lower = password.toLowerCase()
  const nameParts = fullName.toLowerCase().split(/\s+/).filter((p) => p.length >= 3)
  const emailName = email.trim().toLowerCase().split('@')[0]
  const similar = (emailName.length >= 3 && lower.includes(emailName)) || nameParts.some((p) => lower.includes(p))
  return [
    { ok: password.length >= 8, label: 'At least 8 characters' },
    { ok: password.length > 0 && !/^\d+$/.test(password), label: 'Not only numbers' },
    { ok: password.length > 0 && !similar, label: 'Not similar to their name or email' },
  ]
}

function LiveCheck({ ok, children }) {
  const Icon = ok ? Check : X
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: ok ? 'var(--success)' : 'var(--muted)' }}>
      <Icon size={13} strokeWidth={2.6} aria-hidden />
      {children}
    </li>
  )
}

/** The "Add staff" form: name, phone (with country code), email, password and re-entered password. */
export default function AddStaffForm({ onCreated, onClose }) {
  const [form, setForm] = useState({ fullName: '', countryCode: COUNTRY_CODES[0].code, phone: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    if (errors[key]) setErrors((all) => ({ ...all, [key]: undefined })) // typing clears the old message
  }
  const checks = passwordChecks(form.password, form)
  const matches = form.confirmPassword.length > 0 && form.password === form.confirmPassword

  const validate = () => {
    const found = {}
    const national = form.phone.replace(/^0+/, '')
    if (!form.fullName.trim()) found.fullName = 'Enter the staff member’s name.'
    if (national.length < 6 || national.length > 13) found.phone = 'Enter a valid phone number (digits only, without the country code).'
    if (!EMAIL_PATTERN.test(form.email.trim())) found.email = 'Enter a valid email address.'
    if (!form.password) found.password = 'Enter a password.'
    else if (checks.some((c) => !c.ok)) found.password = 'The password does not meet the rules below.'
    if (!form.confirmPassword) found.confirmPassword = 'Re-enter the password.'
    else if (form.password !== form.confirmPassword) found.confirmPassword = 'Passwords do not match.'
    return found
  }

  const submit = async (e) => {
    e.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      const user = await createStaff({
        fullName: form.fullName.trim(),
        phoneNumber: `${form.countryCode}${form.phone.replace(/^0+/, '')}`,
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
      })
      onCreated(user)
    } catch (error) {
      const data = error.data || {}
      const server = {
        fullName: first(data.full_name),
        phone: first(data.phone_number),
        email: first(data.email),
        password: first(data.password),
        confirmPassword: first(data.confirm_password),
      }
      const hasFieldError = Object.values(server).some(Boolean)
      setErrors({
        ...server,
        form: hasFieldError
          ? ''
          : error.status === 0
            ? 'Cannot reach the server. Check your connection and try again.'
            : error.status === 403
              ? 'Only an admin can add staff.'
              : data.detail || 'Could not add the staff member. Please try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="form-stack" noValidate>
      <Field label="Full name" htmlFor="staff-name" error={errors.fullName}>
        <Input id="staff-name" value={form.fullName} onChange={set('fullName')} placeholder="e.g. Priya Shah" autoComplete="off" data-autofocus />
      </Field>
      <PhoneField
        id="staff-phone"
        code={form.countryCode}
        number={form.phone}
        onCode={(countryCode) => setForm((f) => ({ ...f, countryCode }))}
        onNumber={(phone) => setForm((f) => ({ ...f, phone }))}
        hint="Pick the country code, then the number."
        error={errors.phone}
      />
      <Field label="Email" htmlFor="staff-email" error={errors.email}>
        <Input id="staff-email" type="email" value={form.email} onChange={set('email')} placeholder="priya@bookhero.store" autoComplete="off" />
      </Field>
      <Field label="Password" htmlFor="staff-password" error={errors.password}>
        <PasswordInput id="staff-password" value={form.password} onChange={set('password')} autoComplete="new-password" aria-describedby="staff-password-checks" />
        {form.password && (
          <ul id="staff-password-checks" aria-live="polite" style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'grid', gap: 3 }}>
            {checks.map((c) => (
              <LiveCheck key={c.label} ok={c.ok}>
                {c.label}
              </LiveCheck>
            ))}
          </ul>
        )}
      </Field>
      <Field label="Re-enter password" htmlFor="staff-confirm" error={errors.confirmPassword}>
        <PasswordInput id="staff-confirm" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" aria-describedby="staff-confirm-check" />
        {form.confirmPassword && !errors.confirmPassword && (
          <ul id="staff-confirm-check" aria-live="polite" style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
            <LiveCheck ok={matches}>{matches ? 'Passwords match' : 'Passwords do not match yet'}</LiveCheck>
          </ul>
        )}
      </Field>
      <p className="field__hint">They sign in to the Staff app with this email and password. No verification code is needed.</p>
      {errors.form && (
        <p className="field__error" role="alert">
          {errors.form}
        </p>
      )}
      <div className="form-actions">
        <span style={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="dark" loading={busy}>
          Add staff
        </Button>
      </div>
    </form>
  )
}
