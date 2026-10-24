import { getFilterOptions, hueOf } from '../../services/adminApi'
import { useQuery } from '../../hooks/useStore'
import { Select } from '../ui/Form'
import { Avatar } from '../ui/Misc'

export function ShelfFilter({ value, onChange, label = 'All shelves' }) {
  const { data } = useQuery(() => getFilterOptions(), [], { mock: false })
  const shelves = data?.shelves ?? []
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
  const { data } = useQuery(() => getFilterOptions(), [], { mock: false })
  const staff = data?.staff ?? []
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
      <Avatar name={name} hue={hueOf(name)} size={size} />
      <span>{name}</span>
    </span>
  )
}
