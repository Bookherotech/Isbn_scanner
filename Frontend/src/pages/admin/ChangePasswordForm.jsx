import { useState } from 'react'
import { changeStaffPassword } from '../../services/authApi'
import { Field } from '../../components/ui/Form'
import { PasswordInput } from '../../components/ui/PasswordInput'
import { Button } from '../../components/ui/Button'

const first = (messages) => (Array.isArray(messages) ? messages[0] : messages)

/** Admin sets a new password for a staff member: new password and re-entered password. */
export default function ChangePasswordForm({ staff, onDone, onClose }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const found = {}
    if (!password) found.password = 'Enter the new password.'
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
        <PasswordInput id="staff-new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" data-autofocus />
      </Field>
      <Field label="Re-enter new password" htmlFor="staff-new-password-2" error={errors.confirmPassword}>
        <PasswordInput id="staff-new-password-2" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
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
