import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { changeStaffPassword } from '../../services/authApi'
import { Field } from '../../components/ui/Form'
import { PasswordInput } from '../../components/ui/PasswordInput'
import { Button } from '../../components/ui/Button'

const first = (messages) => (Array.isArray(messages) ? messages[0] : messages)

// Live password checks while typing (the server checks again on save, incl. very common passwords).
function passwordChecks(password, { full_name: fullName = '', email = '' }) {
  const lower = password.toLowerCase()
  const nameParts = (fullName || '').toLowerCase().split(/\s+/).filter((p) => p.length >= 3)
  const emailName = (email || '').toLowerCase().split('@')[0]
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

/** Admin sets a new password for a staff member: new password and re-entered password. */
export default function ChangePasswordForm({ staff, onDone, onClose }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const checks = passwordChecks(password, staff)
  const matches = confirmPassword.length > 0 && password === confirmPassword

  const submit = async (e) => {
    e.preventDefault()
    const found = {}
    if (!password) found.password = 'Enter the new password.'
    else if (checks.some((c) => !c.ok)) found.password = 'The password does not meet the rules below.'
    if (!confirmPassword) found.confirmPassword = 'Re-enter the new password.'
    else if (password !== confirmPassword) found.confirmPassword = 'Passwords do not match.'
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      await changeStaffPassword(staff.id, { password, confirmPassword })
      onDone()
    } catch (error) {
      const data = error.data || {}
      const server = { password: first(data.password), confirmPassword: first(data.confirm_password) }
      setErrors({
        ...server,
        form: Object.values(server).some(Boolean)
          ? ''
          : error.status === 0
            ? 'Cannot reach the server. Check your connection and try again.'
            : error.status === 404
              ? 'This staff member no longer exists.'
              : data.detail || 'Could not change the password. Please try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="form-stack" noValidate>
      <Field label="New password" htmlFor="staff-new-password" error={errors.password}>
        <PasswordInput
          id="staff-new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (errors.password) setErrors((all) => ({ ...all, password: undefined })) // typing clears the old message
          }}
          autoComplete="new-password"
          aria-describedby="staff-new-password-checks"
          data-autofocus
        />
        {password && (
          <ul id="staff-new-password-checks" aria-live="polite" style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'grid', gap: 3 }}>
            {checks.map((c) => (
              <LiveCheck key={c.label} ok={c.ok}>
                {c.label}
              </LiveCheck>
            ))}
          </ul>
        )}
      </Field>
      <Field label="Re-enter new password" htmlFor="staff-new-password-2" error={errors.confirmPassword}>
        <PasswordInput
          id="staff-new-password-2"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value)
            if (errors.confirmPassword) setErrors((all) => ({ ...all, confirmPassword: undefined }))
          }}
          autoComplete="new-password"
          aria-describedby="staff-new-password-2-check"
        />
        {confirmPassword && !errors.confirmPassword && (
          <ul id="staff-new-password-2-check" aria-live="polite" style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
            <LiveCheck ok={matches}>{matches ? 'Passwords match' : 'Passwords do not match yet'}</LiveCheck>
          </ul>
        )}
      </Field>
      <p className="field__hint">{staff.full_name || staff.email} will be signed out everywhere and must use this new password. Tell them what it is.</p>
      {errors.form && (
        <p className="field__error" role="alert">
          {errors.form}
        </p>
      )}
      <div className="form-actions">
        <span style={{ flex: 1 }} />
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="dark" loading={busy}>
          Change password
        </Button>
      </div>
    </form>
  )
}
