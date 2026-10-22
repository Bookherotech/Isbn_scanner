import { useState } from 'react'
import { createStaff } from '../../services/authApi'
import { COUNTRY_CODES } from '../../utils/countryCodes'
import { Field, Input } from '../../components/ui/Form'
import { PasswordInput } from '../../components/ui/PasswordInput'
import { Button } from '../../components/ui/Button'
import PhoneField from './PhoneField'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const first = (messages) => (Array.isArray(messages) ? messages[0] : messages)

/** The "Add staff" form: name, phone (with country code), email, password and re-entered password. */
export default function AddStaffForm({ onCreated, onClose }) {
  const [form, setForm] = useState({ fullName: '', countryCode: COUNTRY_CODES[0].code, phone: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const validate = () => {
    const found = {}
    const national = form.phone.replace(/^0+/, '')
    if (!form.fullName.trim()) found.fullName = 'Enter the staff member’s name.'
    if (national.length < 6 || national.length > 13) found.phone = 'Enter a valid phone number (digits only, without the country code).'
    if (!EMAIL_PATTERN.test(form.email.trim())) found.email = 'Enter a valid email address.'
    if (!form.password) found.password = 'Enter a password.'
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
        <PasswordInput id="staff-password" value={form.password} onChange={set('password')} autoComplete="new-password" />
      </Field>
      <Field label="Re-enter password" htmlFor="staff-confirm" error={errors.confirmPassword}>
        <PasswordInput id="staff-confirm" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />
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
