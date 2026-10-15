import { selectors } from '../../services/mockApi'
import { Select } from '../ui/Form'
import { Avatar } from '../ui/Misc'

export function ShelfFilter({ value, onChange, label = 'All shelves' }) {
  const shelves = selectors.shelfOptions()
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter by shelf">
      <option value="">{label}</option>
      {shelves.map((s) => (
        <option key={s.id} value={s.id}>
          {s.id}
          {s.status === 'inactive' ? ' (inactive)' : ''}
        </option>
      ))}
    </Select>
  )
}

export function StaffFilter({ value, onChange, label = 'All staff' }) {
  const staff = selectors.staffOptions()
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter by staff">
      <option value="">{label}</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  )
}

export function Person({ id, name, size = 22 }) {
  return (
    <span className="person">
      <Avatar name={name} hue={selectors.userHue(id)} size={size} />
      <span>{name}</span>
    </span>
  )
}
