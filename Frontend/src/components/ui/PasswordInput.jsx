import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from './Form'

/** The eye button that shows or hides a password field's text. `controls` is the field's id. */
export function PasswordToggle({ visible, onToggle, controls }) {
  return (
    <button type="button" className="password-toggle" onClick={onToggle} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} aria-controls={controls}>
      {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
    </button>
  )
}

/** A password field with an eye button to show what was typed. Takes the same props as Input. */
export function PasswordInput({ id, ...rest }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="password-input">
      <Input id={id} {...rest} type={visible ? 'text' : 'password'} />
      <PasswordToggle visible={visible} onToggle={() => setVisible((v) => !v)} controls={id} />
    </div>
  )
}
