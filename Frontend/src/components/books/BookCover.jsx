import { memo, useState } from 'react'
import { cn } from '../../utils/format'

/**
 * Real cover from Open Library's public covers API when available, layered
 * over a generated typographic cover (always rendered — no layout shift,
 * works offline). Generated covers vary composition + palette per title.
 */
const PALETTES = [
  ['#1f3b2d', '#f2e8d0', '#d9b44a'],
  ['#6d1f22', '#f4e4c8', '#e2a64b'],
  ['#1d2b4a', '#efe6d2', '#e7c75a'],
  ['#e9b730', '#18160f', '#18160f'],
  ['#2f5d62', '#f3ecdc', '#f0c24b'],
  ['#b4532a', '#fbf0de', '#1c1a14'],
  ['#2a2722', '#f6d23a', '#f6d23a'],
  ['#5b3a5e', '#f7dfcf', '#f2b67c'],
  ['#4f5d2f', '#f1ebd6', '#e8c25d'],
  ['#efe6d2', '#1b1a17', '#c7432d'],
  ['#14324a', '#e8f0f2', '#f08a4b'],
  ['#8a6a2f', '#fbf5e4', '#1b1a17'],
]

function hash(s = '') {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const SIZES = { xs: 30, sm: 40, md: 56, lg: 132, xl: 184 }

export const BookCover = memo(function BookCover({ title = '', author = '', isbn, size = 'sm', noRemote = false, className }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const h = hash(title + author)
  const [bg, fg, accent] = PALETTES[h % PALETTES.length]
  const layout = (h >> 4) % 5
  const width = SIZES[size] || SIZES.sm
  const showText = width >= 40
  const remote = !noRemote && isbn && !failed && /^\d{13}$/.test(isbn)

  return (
    <span
      className={cn('cover', `cover--${size}`, `cover--l${layout}`, className)}
      style={{ '--cw': `${width}px`, '--bg': bg, '--fg': fg, '--ac': accent }}
      role="img"
      aria-label={`Cover of ${title}`}
    >
      <span className="cover__gen" aria-hidden>
        <span className="cover__ornament" />
        {showText && (
          <>
            <span className="cover__title">{title}</span>
            <span className="cover__author">{author.split(',')[0]}</span>
          </>
        )}
      </span>
      {remote && (
        <img
          className={cn('cover__img', loaded && 'is-loaded')}
          src={`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`}
          alt=""
          loading="lazy"
          decoding="async"
          width={width}
          height={Math.round(width * 1.5)}
          onLoad={(e) => {
            // Open Library occasionally serves a 1×1 placeholder.
            if (e.currentTarget.naturalWidth > 10) setLoaded(true)
            else setFailed(true)
          }}
          onError={() => setFailed(true)}
        />
      )}
      <span className="cover__spine" aria-hidden />
    </span>
  )
})

export function BookCell({ item, size = 'xs', sub, mono }) {
  return (
    <span className="bookcell">
      <BookCover title={item.title} author={item.author} isbn={item.isbn} size={size} />
      <span className="bookcell__text">
        <span className="bookcell__title">{item.title}</span>
        <span className={cn('bookcell__sub', mono && 'mono')}>{sub ?? item.author}</span>
      </span>
    </span>
  )
}
