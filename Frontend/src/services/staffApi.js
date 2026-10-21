import { HttpError, request } from './apiClient'

/**
 * Staff portal API (Django `staff_api`). Every call needs a signed-in Staff user.
 * Responses are mapped to the shape the staff screens already render: camelCase keys and
 * timestamps as milliseconds (what utils/format.js expects).
 */

const NETWORK_DOWN = 'Cannot reach the server. Check your connection and try again.'

const ms = (iso) => (iso ? Date.parse(iso) : null)

/** The first message in a DRF error body, however deeply nested ({field: ['…']} or {field: {0: ['…']}}). */
function firstMessage(value) {
  if (typeof value === 'string') return value
  const items = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []
  for (const item of items) {
    const found = firstMessage(item)
    if (found) return found
  }
  return null
}

/** Gives backend errors the `code` the screens check (e.g. 'not_found', 'network') and a readable message. */
function staffError(error) {
  if (!(error instanceof HttpError)) return error
  if (error.status === 0) return Object.assign(new HttpError(0, NETWORK_DOWN, error.data), { code: 'network' })
  const data = error.data || {}
  const fieldMessage = data.detail ? null : firstMessage(data)
  const out = new HttpError(error.status, data.detail || fieldMessage || 'Something went wrong. Please try again.', data)
  out.code = data.code
  return out
}

async function call(path, options) {
  try {
    return await request(path, options)
  } catch (error) {
    throw staffError(error)
  }
}

function mapMatch(m) {
  if (!m) return null
  return { itemId: m.item_id, title: m.title, author: m.author, isbn: m.isbn, shelfId: m.shelf_id, quantity: m.quantity, status: m.status }
}

/** A submission row from the backend -> the item shape used by SubmissionCard / SubmissionDetail. */
function mapItem(r) {
  return {
    id: r.id,
    isbn: r.isbn,
    title: r.title,
    author: r.author,
    publisher: r.publisher,
    year: r.year ?? '',
    pages: r.pages ?? '',
    source: r.source,
    subjects: r.subjects,
    coverUrl: r.cover_url,
    coverPhotoUrl: r.cover_photo_url || null, // staff photo; BookCover shows it instead of the Open Library cover
    editedFields: r.edited_fields,
    edited: (r.edited_fields || []).length > 0, // details, ISBN or photo changed from what was fetched
    missingFields: r.missing_fields,
    shelfId: r.shelf_id,
    quantity: r.quantity,
    stock: r.stock,
    status: r.status,
    ready: r.ready,
    linked: r.linked ? { id: r.linked.id, shelfId: r.linked.shelf_id, status: r.linked.status, stock: r.linked.stock, quantity: r.linked.quantity } : null,
    match: mapMatch(r.match),
    submittedAt: ms(r.submitted_at),
    submittedByName: r.submitted_by_name,
    approvedAt: ms(r.approved_at),
    approvedByName: r.approved_by_name,
    rejectedAt: ms(r.rejected_at),
    rejectedBy: r.auto_rejected ? 'system' : r.rejected_by_name,
    rejectedByName: r.rejected_by_name,
    rejectReason: r.reject_reason,
    rejectNote: r.reject_note,
    waitingReadyAt: ms(r.waiting_ready_at),
    stockOutAt: ms(r.stock_out_at),
    closedAt: ms(r.closed_at),
    flags: r.flags,
    flagHold: r.flag_hold,
  }
}

/**
 * GET /api/staff/isbn/<isbn>/ -> { isbn, title, author, publisher, year, pages, subjects, coverUrl, source, fallback, missing }
 * Errors carry `code`: 'invalid_isbn' | 'not_found' | 'service_unavailable' | 'network'.
 * (The second argument is accepted for the existing Retry calls; every call is a real lookup.)
 */
export async function lookupIsbn(isbn13) {
  const m = await call(`/api/staff/isbn/${encodeURIComponent(isbn13)}/`)
  return {
    isbn: m.isbn,
    title: m.title,
    author: m.author,
    publisher: m.publisher,
    year: m.year ?? '',
    pages: m.pages ?? '',
    subjects: m.subjects,
    coverUrl: m.cover_url,
    source: m.source,
    fallback: m.fallback,
    missing: m.missing,
  }
}

/**
 * GET /api/staff/book-search/?title=&author= -> [{ title, author, publisher, year, pages, coverUrl }]
 * Google Books matches for a typed title, for staff to pick from. Never contains an ISBN: the scanned one is kept.
 */
export async function searchBooks({ title, author = '' }) {
  const query = new URLSearchParams({ title, author })
  const res = await call(`/api/staff/book-search/?${query}`)
  return res.results.map((r) => ({
    title: r.title,
    author: r.author,
    publisher: r.publisher,
    year: r.year ?? '',
    pages: r.pages ?? '',
    coverUrl: r.cover_url,
  }))
}

// Shelves are loaded once and kept, so the shelf step opens instantly; every load refreshes the copy.
let shelfCache = null

/** The last loaded list of active shelves ([{ id, code, zone, status }]), or null if not loaded yet. */
export function getCachedShelves() {
  return shelfCache
}

/** GET /api/staff/shelves/ -> active shelves, sorted by code. */
export async function loadShelves() {
  shelfCache = await call('/api/staff/shelves/')
  return shelfCache
}

/**
 * POST /api/staff/submissions/ -> { result: 'pending' | 'waiting' | 'rejected', match, ready, flags, flagHold, item, key }
 * `draft` is what the Review screen sends: { isbn, title, author, publisher, year, pages, source, subjects, fetched, photo, shelfId, quantity }.
 * `fetched.isbn` is the ISBN first scanned/typed (a corrected ISBN counts as an edit); `photo` is a JPEG data URL.
 */
export async function submitBook(draft) {
  const res = await call('/api/staff/submissions/', {
    method: 'POST',
    body: {
      isbn: draft.isbn,
      title: draft.title,
      author: draft.author,
      publisher: draft.publisher || '',
      year: draft.year ?? '',
      pages: draft.pages ?? '',
      source: draft.source || 'manual',
      subjects: draft.subjects || [],
      fetched: draft.fetched || null,
      cover_photo: draft.photo || '',
      shelf_id: draft.shelfId,
      quantity: Number(draft.quantity),
    },
  })
  return { result: res.result, match: mapMatch(res.match), ready: res.ready, flags: res.flags, flagHold: res.flag_hold, item: mapItem(res.item), key: res.key }
}

/** GET /api/staff/home/ -> { today: { scanned, pending, approved, waiting }, recent: [item] } */
export async function getStaffHome() {
  const res = await call('/api/staff/home/')
  return { today: res.today, recent: res.recent.map(mapItem) }
}

/** GET /api/staff/submissions/?status=&limit= -> { rows, total, counts } ("Show more" asks for a bigger pageSize). */
export async function getMySubmissions({ status = 'all', pageSize = 12 } = {}) {
  const query = new URLSearchParams({ status, limit: String(pageSize) })
  const res = await call(`/api/staff/submissions/?${query}`)
  return { rows: res.results.map(mapItem), total: res.count, counts: res.counts }
}

/** GET /api/staff/submissions/<id>/ -> one of your own submissions. */
export async function getSubmission(id) {
  return mapItem(await call(`/api/staff/submissions/${encodeURIComponent(id)}/`))
}
