import { useState } from 'react'
import { updateStaff } from '../../services/authApi'
import { splitPhone } from '../../utils/countryCodes'
import { Field, Input } from '../../components/ui/Form'
import { Button } from '../../components/ui/Button'
import PhoneField from './PhoneField'
import StaffEmailChange from './StaffEmailChange'

const first = (messages) => (Array.isArray(messages) ? messages[0] : messages)

/**
 * The "Edit staff" dialog: name and phone are saved with the button below; the email has its own
 * two-code change (the pencil next to it), which saves by itself and reports through onEmailChanged.
 */
export default function EditStaffForm({ staff, onSaved, onClose, onEmailChanged }) {
  const start = splitPhone(staff.phone_number)
  const [name, setName] = useState(staff.full_name || '')
  const [code, setCode] = useState(start.code)
  const [number, setNumber] = useState(start.number)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const national = number.replace(/^0+/, '')
  const phone = code ? `${code}${national}` : national ? `+${national}` : ''
  const nameChanged = name.trim() !== (staff.full_name || '')
  const phoneChanged = phone !== (staff.phone_number || '')
  const dirty = nameChanged || phoneChanged

  const submit = async (e) => {
    e.preventDefault()
    const found = {}
    if (nameChanged && !name.trim()) found.fullName = 'Enter the staff member’s name.'
    if (phoneChanged && (national.length < 6 || national.length > 13)) found.phone = 'Enter a valid phone number (digits only, without the country code).'
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      const user = await updateStaff(staff.id, {
        fullName: nameChanged ? name.trim() : undefined,
        phoneNumber: phoneChanged ? phone : undefined,
      })
      onSaved(user)
    } catch (error) {
      const data = error.data || {}
      const server = { fullName: first(data.full_name), phone: first(data.phone_number) }
      setErrors({
        ...server,
        form: Object.values(server).some(Boolean)
          ? ''
          : error.status === 0
            ? 'Cannot reach the server. Check your connection and try again.'
            : error.status === 404
              ? 'This staff member no longer exists.'
              : data.detail || 'Could not save the changes. Please try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="form-stack" noValidate>
      <Field label="Full name" htmlFor="edit-staff-name" error={errors.fullName}>
        <Input id="edit-staff-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" data-autofocus />
      </Field>
      <PhoneField id="edit-staff-phone" code={code} number={number} onCode={setCode} onNumber={setNumber} error={errors.phone} />
      <StaffEmailChange staff={staff} onChanged={onEmailChanged} />
      {errors.form && (
        <p className="field__error" role="alert">
          {errors.form}
        </p>
      )}
      <div className="form-actions">
        <span style={{ flex: 1 }} />
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button type="submit" variant="dark" loading={busy} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </form>
  )
}
