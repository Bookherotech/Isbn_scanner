import { Tag } from 'lucide-react'
import { cn } from '../../utils/format'

/**
 * The book's selling price in AED (required). A highlighted box with a large input and the currency in front, so it is
 * never missed among the book details. Used on the staff details screen and the admin review page.
 */
export function PriceBox({ id, value, onChange, error, hint, dirty, className }) {
  const note = error || hint
  return (
    <div className={cn('pricebox', error && 'has-error', className)}>
      <label className="pricebox__label" htmlFor={id}>
        <Tag size={16} aria-hidden />
        Selling price
        <span className="pricebox__req">Required</span>
      </label>
      <div className={cn('pricebox__field', dirty && 'is-dirty')}>
        <span className="pricebox__cur" aria-hidden>
          AED
        </span>
        <input
          id={id}
          className="pricebox__input"
          inputMode="decimal"
          autoComplete="off"
          value={value ?? ''}
          onChange={onChange}
          placeholder="0.00"
          required
          aria-invalid={Boolean(error)}
          aria-describedby={note ? `${id}-note` : undefined}
          aria-label="Selling price in AED"
        />
      </div>
      {note && (
        <p id={`${id}-note`} className={error ? 'pricebox__error' : 'pricebox__hint'} role={error ? 'alert' : undefined}>
          {note}
        </p>
      )}
    </div>
  )
}
