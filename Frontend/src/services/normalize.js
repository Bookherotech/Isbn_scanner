/**
 * Duplicate key = normalized TITLE + AUTHOR (never ISBN — the same book from a
 * different publisher has a different ISBN). Mirrors Section 04 of the plan.
 */

const stripDiacritics = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

export function normalizeTitle(title = '') {
  let s = stripDiacritics(String(title)).toLowerCase()
  s = s.split(':')[0] // compare main title only — subtitle after ":" stripped
  s = s.replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^(the|a|an)\s+/, '') // ignore leading article
  return s
}

export function normalizeAuthor(author = '') {
  const s = stripDiacritics(String(author)).toLowerCase()
  // "Fitzgerald, F. Scott" and "F. Scott Fitzgerald" → same token set; initials ignored.
  const tokens = s
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && t !== 'and')
  return [...new Set(tokens)].sort().join(' ')
}

export function duplicateKey(title, author) {
  return `${normalizeTitle(title)}|${normalizeAuthor(author)}`
}
