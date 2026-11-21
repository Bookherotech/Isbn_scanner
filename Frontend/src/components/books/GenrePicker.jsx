import { Check } from 'lucide-react'
import { Field, Select } from '../ui/Form'
import { withCurrent } from '../../services/genres'
import { cn } from '../../utils/format'

/**
 * Genre and its categories (any number): the Shopify tags that put the book in the store's collections.
 * The languages (Arabic, French, Spanish) are choices in the Genre list too: picking one sets `language` and no
 * genre, picking a genre clears the language. value = { genre, subgenres, language }; onChange(patch) gets the
 * changed keys. Changing the genre clears the categories, which belong to the old genre. `badge` marks a value that
 * was filled in (from Shopify or guessed). `className` goes on both blocks (e.g. to span a two-column form).
 */
export function GenrePicker({ lists, value, onChange, idPrefix, badge, dirty = [], className }) {
  const genre = value.language ? null : lists.genres.find((g) => g.name === value.genre)
  const subs = withCurrentAll(genre?.subs || [], genre ? value.subgenres : [])
  const selected = value.subgenres || []
  const toggle = (sub) => onChange({ subgenres: selected.includes(sub) ? selected.filter((s) => s !== sub) : [...selected, sub] })
  const languages = withCurrent(lists.languages, value.language)
  const pick = (v) => onChange(languages.includes(v) ? { genre: '', subgenres: [], language: v } : { genre: v, subgenres: [], language: '' })

  return (
    <>
      <div className={cn('genre-picker__row', className)}>
        <Field label="Genre" htmlFor={`${idPrefix}-genre`} optional badge={badge}>
          <Select id={`${idPrefix}-genre`} value={value.language || value.genre || ''} onChange={(e) => pick(e.target.value)} className={cn((dirty.includes('genre') || dirty.includes('language')) && 'is-dirty')}>
            <option value="">Not set</option>
            {[...withCurrent(lists.genres.map((g) => g.name), value.genre), ...languages].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {subs.length > 0 && (
        <div className={cn('field genre-picker__subs', dirty.includes('subgenres') && 'is-dirty', className)} role="group" aria-label={`${value.genre} categories`}>
          <span className="field__label">
            {value.genre} categories <span className="field__optional">choose any</span>
          </span>
          <div className="genre-chips">
            {subs.map((sub) => {
              const on = selected.includes(sub)
              return (
                <button key={sub} type="button" className={cn('chip-btn genre-chip', on && 'is-on')} aria-pressed={on} onClick={() => toggle(sub)}>
                  {on && <Check size={13} aria-hidden strokeWidth={2.4} />}
                  {sub}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

function withCurrentAll(list, values) {
  const extra = (values || []).filter((v) => !list.includes(v))
  return extra.length ? [...list, ...extra] : list
}
