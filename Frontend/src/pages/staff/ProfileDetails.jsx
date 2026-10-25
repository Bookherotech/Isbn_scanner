import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { COUNTRY_CODES, splitPhone } from '../../utils/countryCodes'
import { Field, Input, Select } from '../../components/ui/Form'
import { Button } from '../../components/ui/Button'

const first = (messages) => (Array.isArray(messages) ? messages[0] : messages)

/** The signed-in user's own details. Press Edit to change name and phone; the email is always locked. */
export default function ProfileDetails() {
  const { user, updateProfile } = useAuth()
  const { toast } = useToast()

  const saved = splitPhone(user.phone)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name || '')
  const [code, setCode] = useState(saved.code)
  const [number, setNumber] = useState(saved.number)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const national = number.replace(/^0+/, '')
  const phone = code ? `${code}${national}` : national ? `+${national}` : ''
  const nameChanged = name.trim() !== (user.name || '')
  const phoneChanged = phone !== (user.phone || '')

  const cancel = () => {
    setName(user.name || '')
    setCode(saved.code)
    setNumber(saved.number)
    setErrors({})
    setEditing(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    const found = {}
    if (nameChanged && !name.trim()) found.name = 'Enter your name.'
    if (phoneChanged && (national.length < 6 || national.length > 13)) found.phone = 'Enter a valid phone number (digits only, without the country code).'
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      if (nameChanged || phoneChanged) await updateProfile({ fullName: nameChanged ? name.trim() : undefined, phoneNumber: phoneChanged ? phone : undefined })
      setEditing(false)
      if (nameChanged || phoneChanged) toast({ title: 'Profile updated' })
    } catch (error) {
      const data = error.data || {}
      const fieldError = first(data.full_name) || first(data.phone_number)
      setErrors({
        name: first(data.full_name),
        phone: first(data.phone_number),
        form: fieldError ? '' : error.status === 0 ? 'Cannot reach the server. Check your connection and try again.' : data.detail || 'Could not save your changes. Please try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="profile__form" onSubmit={submit} noValidate>
      {!editing && (
        <div className="profile__form-head">
          <Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      )}
      <Field label="Full name" htmlFor="me-name" error={errors.name} className="profile__half">
        <Input id="me-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!editing} autoComplete="name" data-autofocus />
      </Field>
      <Field label="Phone number" htmlFor="me-phone" error={errors.phone} className="profile__half">
        <div className="phone-row">
          <Select aria-label="Country code" value={code} onChange={(e) => setCode(e.target.value)} disabled={!editing}>
            {!code && <option value="">Other</option>}
            {COUNTRY_CODES.map((c) => (
              <option key={c.code + c.name} value={c.code} title={c.name}>
                {c.code} {c.name}
              </option>
            ))}
          </Select>
          <Input
            id="me-phone"
            type="tel"
            inputMode="numeric"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
            placeholder={editing ? '98765 43210' : '—'}
            disabled={!editing}
            autoComplete="tel-national"
          />
        </div>
      </Field>
      <Field label="Email" htmlFor="me-email" hint={user.role === 'admin' ? 'This is the email you sign in with and receive codes at.' : 'Contact your admin to change your email.'}>
        <Input id="me-email" type="email" value={user.email || ''} placeholder="—" disabled readOnly />
      </Field>
      {errors.form && (
        <p className="field__error" role="alert">
          {errors.form}
        </p>
      )}
      {editing && (
        <div className="form-actions">
          <span style={{ flex: 1 }} />
          <Button onClick={cancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="dark" loading={busy} disabled={!nameChanged && !phoneChanged}>
            Save changes
          </Button>
        </div>
      )}
    </form>
  )
}
