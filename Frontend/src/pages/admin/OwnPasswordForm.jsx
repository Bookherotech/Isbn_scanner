import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { changeOwnPassword } from '../../services/authApi'
import { updateAuth } from '../../services/authStorage'
import { useToast } from '../../hooks/useToast'
import { Field } from '../../components/ui/Form'
import { PasswordInput } from '../../components/ui/PasswordInput'
import { Button } from '../../components/ui/Button'

const first = (messages) => (Array.isArray(messages) ? messages[0] : messages)
const EMPTY = { current: '', password: '', confirm: '' }

/** The signed-in Super Admin changes their own password. Other devices are signed out; this one stays signed in. */
export default function OwnPasswordForm() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const close = () => {
    setOpen(false)
    setForm(EMPTY)
    setErrors({})
  }

  const submit = async (e) => {
    e.preventDefault()
    const found = {}
    if (!form.current) found.current = 'Enter your current password.'
    if (!form.password) found.password = 'Enter a new password.'
    if (!form.confirm) found.confirm = 'Re-enter the new password.'
    else if (form.password !== form.confirm) found.confirm = 'Passwords do not match.'
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      const { access, refresh, user } = await changeOwnPassword({ currentPassword: form.current, password: form.password, confirmPassword: form.confirm })
      updateAuth({ access, refresh, user }) // this browser keeps working with the new tokens
      toast({ title: 'Password changed', description: 'You were signed out on your other devices.' })
      close()
    } catch (error) {
      const data = error.data || {}
      const fields = { current: first(data.current_password), password: first(data.password), confirm: first(data.confirm_password) }
      const any = Object.values(fields).some(Boolean)
      setErrors({ ...fields, form: any ? '' : error.status === 0 ? 'Cannot reach the server. Check your connection and try again.' : error.message })
    } finally {
      setBusy(false)
    }
  }

  if (!open)
    return (
      <div className="own-password__closed">
        <p>Change the password you use to sign in. You will stay signed in here; other devices are signed out.</p>
        <Button size="sm" icon={KeyRound} onClick={() => setOpen(true)}>
          Change password
        </Button>
      </div>
    )

  return (
    <form className="own-password" onSubmit={submit} noValidate>
      <Field label="Current password" htmlFor="own-current" error={errors.current}>
        <PasswordInput id="own-current" value={form.current} onChange={set('current')} autoComplete="current-password" autoFocus />
      </Field>
      <Field label="New password" htmlFor="own-new" error={errors.password} className="profile__half">
        <PasswordInput id="own-new" value={form.password} onChange={set('password')} autoComplete="new-password" />
      </Field>
      <Field label="Re-enter new password" htmlFor="own-confirm" error={errors.confirm} className="profile__half">
        <PasswordInput id="own-confirm" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
      </Field>
      {errors.form && (
        <p className="field__error" role="alert">
          {errors.form}
        </p>
      )}
      <div className="form-actions">
        <span style={{ flex: 1 }} />
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="dark" loading={busy}>
          Save new password
        </Button>
      </div>
    </form>
  )
}
