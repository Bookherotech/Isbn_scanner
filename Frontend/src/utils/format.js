import { selectors } from '../services/mockApi'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const cn = (...parts) => parts.filter(Boolean).join(' ')

/** "Now" respects the demo clock (fast-forward 24h control). */
export const clockNow = () => selectors.clock()

export function timeAgo(t, now = clockNow()) {
  if (!t) return '—'
  const d = Math.max(0, now - t)
  if (d < 45_000) return 'just now'
  if (d < HOUR) return `${Math.round(d / MIN)} min ago`
  if (d < DAY) return `${Math.floor(d / HOUR)} h ago`
  if (d < 2 * DAY) return 'yesterday'
  if (d < 7 * DAY) return `${Math.floor(d / DAY)} days ago`
  return formatDate(t)
}

export function formatTime(t) {
  if (!t) return '—'
  return new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(t, opts = {}) {
  if (!t) return '—'
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...opts })
}

export function formatDateTime(t, now = clockNow()) {
  if (!t) return '—'
  const sameDay = new Date(t).toDateString() === new Date(now).toDateString()
  const yesterday = new Date(t).toDateString() === new Date(now - DAY).toDateString()
  if (sameDay) return `Today, ${formatTime(t)}`
  if (yesterday) return `Yesterday, ${formatTime(t)}`
  return `${formatDate(t)}, ${formatTime(t)}`
}

export function weekday(t) {
  return new Date(t).toLocaleDateString('en-GB', { weekday: 'short' })
}

export function longDate(t) {
  return new Date(t).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function greeting(t = clockNow()) {
  const h = new Date(t).getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'))

export function initials(name = '') {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export const firstName = (name = '') => name.split(' ')[0]

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

export const SOURCE_LABEL = { google: 'Google Books', openlibrary: 'Open Library', manual: 'Manual entry' }

export function downloadCsv(filename, rows) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
