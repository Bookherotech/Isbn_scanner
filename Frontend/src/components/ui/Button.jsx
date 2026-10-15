import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../utils/format'

/**
 * variant: primary (hero yellow) | dark (ink) | secondary (outlined) | ghost | danger | danger-ghost
 * size: sm | md | lg | xl
 */
export const Button = forwardRef(function Button(
  { as, to, variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading = false, block = false, className, children, disabled, ...rest },
  ref,
) {
  const cls = cn('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', loading && 'is-loading', !children && 'btn--icon', className)
  const content = (
    <>
      {loading ? <span className="spinner" aria-hidden /> : Icon && <Icon size={size === 'sm' ? 15 : 17} aria-hidden strokeWidth={2.1} />}
      {children && <span className="btn__label">{children}</span>}
      {IconRight && !loading && <IconRight size={size === 'sm' ? 15 : 17} aria-hidden strokeWidth={2.1} />}
    </>
  )
  if (to) {
    return (
      <Link ref={ref} to={to} className={cls} {...rest}>
        {content}
      </Link>
    )
  }
  const Comp = as || 'button'
  return (
    <Comp ref={ref} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...(Comp === 'button' ? { type: rest.type || 'button' } : {})} {...rest}>
      {content}
    </Comp>
  )
})

export function IconButton({ icon: Icon, label, className, badge, size = 18, ...rest }) {
  return (
    <button type="button" className={cn('icon-btn', className)} aria-label={label} title={label} {...rest}>
      <Icon size={size} aria-hidden strokeWidth={2} />
      {badge ? <span className="icon-btn__badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  )
}
