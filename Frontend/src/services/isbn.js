/** ISBN helpers — validation, ISBN-10 → ISBN-13 conversion, display formatting. */

export function cleanIsbn(raw = '') {
  return String(raw).toUpperCase().replace(/[^0-9X]/g, '')
}

export function isValidIsbn13(s) {
  if (!/^97[89]\d{10}$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === Number(s[12])
}

export function isValidIsbn10(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i)
  return sum % 11 === 0
}

export function isbn10to13(s) {
  const core = '978' + s.slice(0, 9)
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1)
  return core + ((10 - (sum % 10)) % 10)
}

/**
 * Returns { state, isbn13, message } where state is
 * 'empty' | 'typing' | 'valid' | 'converted' | 'invalid'
 */
export function checkIsbn(raw) {
  const s = cleanIsbn(raw)
  if (!s) return { state: 'empty', isbn13: null, message: 'ISBN-10 or ISBN-13' }
  if (s.length === 13) {
    if (!/^97[89]/.test(s)) return { state: 'invalid', isbn13: null, message: 'ISBN-13 must start with 978 or 979' }
    return isValidIsbn13(s)
      ? { state: 'valid', isbn13: s, message: 'Valid ISBN-13' }
      : { state: 'invalid', isbn13: null, message: "Check digit doesn't match — re-check the last digit" }
  }
  if (s.length === 10) {
    return isValidIsbn10(s)
      ? { state: 'converted', isbn13: isbn10to13(s), message: `ISBN-10 converted to ${isbn10to13(s)}` }
      : { state: 'invalid', isbn13: null, message: "Check digit doesn't match — re-check the last digit" }
  }
  if (s.length < 13) return { state: 'typing', isbn13: null, message: `${s.length} of 10 or 13 digits` }
  return { state: 'invalid', isbn13: null, message: 'Too many digits — an ISBN has 10 or 13' }
}

/** 9780141182636 → 978-0-14-118263-6 is publisher-range dependent; use a neutral grouping. */
export function formatIsbn(s = '') {
  if (s.length !== 13) return s
  return `${s.slice(0, 3)}-${s.slice(3, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12)}`
}
