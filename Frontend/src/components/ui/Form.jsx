import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Minus, Plus, Search, X } from 'lucide-react'
import { cn } from '../../utils/format'
import { ShelfTag } from './Status'

export function Field({ label, hint, error, children, className, optional, badge, htmlFor }) {
  return (
    <div className={cn('field', error && 'has-error', className)}>
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
          {optional && <span className="field__optional">optional</span>}
          {badge}
        </label>
      )}
      {children}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ className, mono, size, ...rest }) {
  return <input className={cn('input', mono && 'mono', size === 'lg' && 'input--lg', className)} {...rest} />
}

export function Textarea({ className, ...rest }) {
  return <textarea className={cn('input textarea', className)} {...rest} />
}

export function Select({ className, children, ...rest }) {
  return (
    <div className={cn('select', className)}>
      <select {...rest}>{children}</select>
      <ChevronDown size={15} aria-hidden className="select__chev" />
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search', className, autoFocus, shortcut, inputRef, ...rest }) {
  return (
    <div className={cn('search', className)}>
      <Search size={16} aria-hidden className="search__icon" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        {...rest}
      />
      {value ? (
        <button type="button" className="search__clear" onClick={() => onChange('')} aria-label="Clear search">
          <X size={14} />
        </button>
      ) : shortcut ? (
        <kbd className="kbd">{shortcut}</kbd>
      ) : null}
    </div>
  )
}

export function QuantityStepper({ value, onChange, min = 1, max = 999, size = 'md', id }) {
  const n = Number(value) || 0
  const set = (v) => onChange(Math.max(min, Math.min(max, v)))
  return (
    <div className={cn('stepper', size === 'lg' && 'stepper--lg')}>
      <button type="button" onClick={() => set(n - 1)} disabled={n <= min} aria-label="Decrease quantity">
        <Minus size={size === 'lg' ? 22 : 16} />
      </button>
      <input
        id={id}
        className="num"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '')
          onChange(v === '' ? '' : Math.min(max, Number(v)))
        }}
        onBlur={() => (value === '' || n < min) && set(min)}
        aria-label="Quantity"
      />
      <button type="button" onClick={() => set(n + 1)} disabled={n >= max} aria-label="Increase quantity">
        <Plus size={size === 'lg' ? 22 : 16} />
      </button>
    </div>
  )
}

/** Searchable shelf dropdown (admin forms). Staff get a full-screen list instead. */
export function ShelfPicker({ shelves, value, onChange, id, invalid }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef(null)
  const listId = useId()
  const filtered = useMemo(() => shelves.filter((s) => s.code.toLowerCase().includes(q.toLowerCase().trim())), [shelves, q])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])

  const choose = (code) => {
    onChange(code)
    setOpen(false)
    setQ('')
  }

  return (
    <div className={cn('combo', open && 'is-open', invalid && 'is-invalid')} ref={ref}>
      <button
        type="button"
        id={id}
        className="combo__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((o) => !o)
          setActive(0)
        }}
      >
        {value ? <ShelfTag id={value} /> : <span className="muted">Select shelf</span>}
        <ChevronDown size={15} aria-hidden />
      </button>
      {open && (
        <div className="combo__pop">
          <div className="combo__search">
            <Search size={15} aria-hidden />
            <input
              autoFocus
              value={q}
              placeholder="Search shelf, e.g. B-0"
              onChange={(e) => {
                setQ(e.target.value)
                setActive(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActive((a) => Math.min(a + 1, filtered.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActive((a) => Math.max(a - 1, 0))
                } else if (e.key === 'Enter' && filtered[active]) {
                  e.preventDefault()
                  choose(filtered[active].code)
                } else if (e.key === 'Escape') setOpen(false)
              }}
              aria-label="Search shelves"
              aria-activedescendant={filtered[active] ? `${listId}-${filtered[active].code}` : undefined}
            />
          </div>
          <ul className="combo__list" role="listbox" id={listId}>
            {filtered.length === 0 && <li className="combo__empty">No shelf matches “{q}”</li>}
            {filtered.map((s, i) => (
              <li
                key={s.code}
                id={`${listId}-${s.code}`}
                role="option"
                aria-selected={s.code === value}
                className={cn('combo__opt', i === active && 'is-active')}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(s.code)}
              >
                <ShelfTag id={s.code} size="sm" />
                {s.units != null && <span className="muted num">{s.units} units</span>}
                {s.code === value && <Check size={15} className="combo__check" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function Segmented({ options, value, onChange, label, className }) {
  return (
    <div className={cn('segmented', className)} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={cn('segmented__opt', value === o.value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null && <span className="segmented__count num">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Checkbox({ label, ...rest }) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...rest} />
      <span className="checkbox__box" aria-hidden>
        <Check size={12} strokeWidth={3} />
      </span>
      {label}
    </label>
  )
}
