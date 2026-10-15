import { cn } from '../../utils/format'

export function Logo({ size = 34, withWord = true, tone = 'dark', sub, className }) {
  return (
    <span className={cn('logo', `logo--${tone}`, className)}>
      <img src="/logo.webp" width={size} height={size} alt="" className="logo__mark" />
      {withWord && (
        <span className="logo__word">
          <span className="logo__name">
            <span className="logo__hash" aria-hidden>
              #
            </span>
            BookHero
          </span>
          {sub && <span className="logo__sub">{sub}</span>}
        </span>
      )}
    </span>
  )
}
