/**
 * Duplicate key = normalized TITLE + AUTHOR (never ISBN — the same book from a
 * different publisher has a different ISBN). Exact mirror of
 * Backend/inventory/services/normalize.py.
 */

const stripDiacritics = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

// Any script's letters (Arabic, Hindi, Cyrillic, CJK...) and their combining marks stay.
const NOT_LETTER_OR_DIGIT = /[^\p{L}\p{M}\p{N}\s]/gu
const NOT_LETTER = /[^\p{L}\p{M}\s]/gu

// A subtitle starting with "a"/"an" is a tagline ("A Novel", "A Fable About...") — same book, dropped.
// Any other subtitle names a different book ("Wimpy Kid: Rodrick Rules" vs ": The Last Straw") — kept.
const TAGLINE = /^\s*(a|an)\s/

export function normalizeTitle(title = '') {
  const raw = String(title ?? '')
  let s = stripDiacritics(raw).toLowerCase()
  const colon = s.indexOf(':')
  if (colon !== -1 && TAGLINE.test(s.slice(colon + 1))) s = s.slice(0, colon)
  s = s.replace(/&/g, ' and ').replace(NOT_LETTER_OR_DIGIT, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^(the|a|an)\s+/, '') // ignore leading article
  return s || raw.toLowerCase().replace(/\s+/g, ' ').trim() // only symbols: compare as typed, never empty
}

export function normalizeAuthor(author = '') {
  const s = stripDiacritics(String(author ?? '')).toLowerCase()
  // "Fitzgerald, F. Scott" and "F. Scott Fitzgerald" → same token set; Latin initials ignored.
  const tokens = s
    .replace(NOT_LETTER, ' ')
    .split(/\s+/)
    .filter((t) => (t.length > 1 || /[^\x00-\x7f]/.test(t)) && t !== 'and')
  return [...new Set(tokens)].sort().join(' ')
}

export function duplicateKey(title, author) {
  return `${normalizeTitle(title)}|${normalizeAuthor(author)}`
}
