import { useEffect, useRef, useState } from 'react'
import { cn, initials } from '../../utils/format'

export function Avatar({ name, hue = 40, size = 32, className }) {
  return (
    <span
      className={cn('avatar', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, '--h': hue }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

/* ---------- EAN-13 barcode (real encoding — scannable) ---------- */
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

function ean13Bits(code) {
  if (!/^\d{13}$/.test(code)) return null
  const d = code.split('').map(Number)
  let bits = '101'
  const par = PARITY[d[0]]
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? L : G)[d[i]]
  bits += '01010'
  for (let i = 7; i <= 12; i++) bits += R[d[i]]
  return bits + '101'
}

export function Barcode({ value, height = 34, className, showText = true }) {
  const bits = ean13Bits(value)
  if (!bits) return null
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94])
  return (
    <svg className={cn('barcode', className)} viewBox={`0 0 ${bits.length + 10} ${height + (showText ? 9 : 0)}`} role="img" aria-label={`Barcode ${value}`} preserveAspectRatio="none">
      {bits.split('').map((b, i) =>
        b === '1' ? <rect key={i} x={i + 5} y={0} width={1} height={guard.has(i) ? height + 4 : height} fill="currentColor" /> : null,
      )}
      {showText && (
        <text x={(bits.length + 10) / 2} y={height + 8.5} textAnchor="middle" fontSize="7.5" fontFamily="var(--font-mono)" fill="currentColor" letterSpacing="1.4">
          {value}
        </text>
      )}
    </svg>
  )
}

/** Simple accessible dropdown menu (avatar menu, row actions). */
export function Menu({ trigger, children, align = 'end', className }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className={cn('menu', className)} ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o), props: { 'aria-haspopup': 'menu', 'aria-expanded': open } })}
      {open && (
        <div className={cn('menu__pop', `menu__pop--${align}`)} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ icon: Icon, children, danger, ...rest }) {
  return (
    <button type="button" role="menuitem" className={cn('menu__item', danger && 'is-danger')} {...rest}>
      {Icon && <Icon size={16} aria-hidden />}
      {children}
    </button>
  )
}

export function Kpi({ label, value, sub, tone, children }) {
  return (
    <div className={cn('kpi', tone && `kpi--${tone}`)}>
      <span className="kpi__label">{label}</span>
      <span className="kpi__value num">{value}</span>
      {sub && <span className="kpi__sub">{sub}</span>}
      {children}
    </div>
  )
}

export function Panel({ title, eyebrow, action, children, className, flush, id }) {
  return (
    <section className={cn('panel', flush && 'panel--flush', className)} aria-labelledby={title && id ? id : undefined}>
      {(title || action) && (
        <header className="panel__head">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && (
              <h2 className="panel__title" id={id}>
                {title}
              </h2>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ title, description, actions, eyebrow, children }) {
  return (
    <header className="page-head">
      <div className="page-head__text">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
      {children}
    </header>
  )
}
