import { COUNTRY_CODES } from '../../utils/countryCodes'
import { Field, Input, Select } from '../../components/ui/Form'

/** Country-code dropdown + number box, shared by the Add and Edit staff forms. The parent owns the values. */
export default function PhoneField({ id, code, number, onCode, onNumber, error, hint }) {
  return (
    <Field label="Phone number" htmlFor={id} hint={hint} error={error}>
      <div className="phone-row">
        <Select aria-label="Country code" value={code} onChange={(e) => onCode(e.target.value)}>
          {!code && <option value="">Other</option>}
          {COUNTRY_CODES.map((c) => (
            <option key={c.code + c.name} value={c.code} title={c.name}>
              {c.code} {c.name}
            </option>
          ))}
        </Select>
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          value={number}
          onChange={(e) => onNumber(e.target.value.replace(/\D/g, ''))}
          placeholder="98765 43210"
        />
      </div>
    </Field>
  )
}
