import { HttpError, request } from './apiClient'
import { bump } from './store'

/**
 * Admin portal API (Django `book_admin`, mounted at /api/admin/). Every call needs a signed-in Admin.
 * Responses are mapped to the shape the admin screens render: camelCase keys and timestamps as
 * milliseconds (what utils/format.js expects). Book ids are numbers.
 * After a change the mock store version is bumped, so every open query refetches (lists, counts, the sidebar).
 */

const NETWORK_DOWN = 'Cannot reach the server. Check your connection and try again.'
const ms = (iso) => (iso ? Date.parse(iso) : null)

/** The first message in a DRF error body, however deeply nested. */
function firstMessage(value) {
  if (typeof value === 'string') return value
  const items = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []
  for (const item of items) {
    const found = firstMessage(item)
    if (found) return found
  }
  return null
}

/** Gives backend errors the `code` the screens check ('not_found', 'duplicate_same_shelf', 'network', ...) and a readable message. */
function adminError(error) {
  if (!(error instanceof HttpError)) return error
  if (error.status === 0) return Object.assign(new HttpError(0, NETWORK_DOWN, error.data), { code: 'network' })
  const data = error.data || {}
  const out = new HttpError(error.status, data.detail || firstMessage(data) || 'Something went wrong. Please try again.', data)
  out.code = data.code || (error.status === 404 ? 'not_found' : undefined)
  out.details = data.match ? mapMatch(data.match) : undefined
  return out
}

async function call(path, options) {
  try {
    return await request(path, options)
  } catch (error) {
    throw adminError(error)
  }
}

async function change(path, options) {
  const res = await call(path, options)
  bump()
  return res
}

const query = (params) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null && v !== false) q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** A stable avatar colour from a name (the backend has no colour for people). */
export function hueOf(key = '') {
  let h = 0
  for (let i = 0; i < String(key).length; i++) h = (h * 31 + String(key).charCodeAt(i)) % 360
  return h
}

function mapMatch(m) {
  if (!m) return null
  return { itemId: m.item_id, title: m.title, author: m.author, isbn: m.isbn, shelfId: m.shelf_id, quantity: m.quantity, status: m.status }
}

const mapWaitingEntry = (w) => ({ id: w.id, shelfId: w.shelf_id, quantity: w.quantity, submittedBy: w.submitted_by, submittedByName: w.submitted_by_name, submittedAt: ms(w.submitted_at) })

/** A book row from the backend -> the item shape used by the admin screens. */
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
    coverPhotoUrl: r.cover_photo_url || null,
    fetched: r.fetched,
    editedFields: r.edited_fields,
    missingFields: r.missing_fields,
    shelfId: r.shelf_id,
    previousShelfId: r.previous_shelf_id,
    quantity: r.quantity,
    stock: r.stock,
    status: r.status,
    ready: r.ready,
    linked: r.linked ? { id: r.linked.id, shelfId: r.linked.shelf_id, status: r.linked.status, stock: r.linked.stock, quantity: r.linked.quantity, productId: r.linked.product_id, stockOutAt: ms(r.linked.stock_out_at) } : null,
    match: mapMatch(r.match),
    submittedBy: r.submitted_by,
    submittedByName: r.submitted_by_name,
    submittedAt: ms(r.submitted_at),
    approvedBy: r.approved_by,
    approvedByName: r.approved_by_name,
    approvedAt: ms(r.approved_at),
    rejectedBy: r.auto_rejected ? 'system' : r.rejected_by,
    rejectedByName: r.rejected_by_name,
    rejectedAt: ms(r.rejected_at),
    rejectReason: r.reject_reason,
    rejectNote: r.reject_note,
    waitingReadyAt: ms(r.waiting_ready_at),
    productId: r.product_id,
    syncStatus: r.sync_status,
    lastSync: ms(r.last_sync_at),
    syncError: r.sync_error,
    stockOutAt: ms(r.stock_out_at),
    closedAt: ms(r.closed_at),
    closedReason: r.closed_reason,
    flags: r.flags,
    flagHold: r.flag_hold,
    flagReviewedAt: ms(r.flag_reviewed_at),
    flagReviewedByName: r.flag_reviewed_by_name,
    flagNote: r.flag_note,
    waitingEntries: (r.waiting_entries || []).map(mapWaitingEntry),
    shelfHistory: (r.shelf_history || []).map((h) => ({ id: h.id, shelfId: h.shelf_id, status: h.status, quantity: h.quantity, stock: h.stock, approvedAt: ms(h.approved_at), closedAt: ms(h.closed_at) })),
    duplicateCheck: r.duplicate_check && { key: r.duplicate_check.key, matches: r.duplicate_check.matches.map(mapMatch) },
    activity: (r.activity || []).map(mapActivity),
  }
}

const mapShelf = (s) => ({ id: s.id, code: s.code, zone: s.zone, status: s.status, note: s.note, createdAt: ms(s.created_at), titles: s.titles, units: s.units, waiting: s.waiting, pending: s.pending })

// --------------------------------------------------------------------------
// Dashboard, counts, search, filter options
// --------------------------------------------------------------------------
export async function getDashboard() {
  const d = await call('/api/admin/dashboard/')
  const k = d.kpis
  return {
    kpis: {
      pending: k.pending, waiting: k.waiting, ready: k.ready, liveTitles: k.live_titles, liveUnits: k.live_units, outOfStock: k.out_of_stock,
      addedToday: k.added_today, addedYesterday: k.added_yesterday, approvedToday: k.approved_today,
    },
    added7: d.added7.map((x) => ({ date: Date.parse(`${x.date}T00:00:00`), count: x.count, approved: x.approved })),
    status: d.status,
    shelves: d.shelves.map((s) => ({ shelfId: s.shelf_id, units: s.units, titles: s.titles })),
    shelfCount: d.shelf_count,
    attention: {
      ready: d.attention.ready.map(mapItem),
      failed: d.attention.failed.map(mapItem),
      flagged: d.attention.flagged.map(mapItem),
      oldestPending: d.attention.oldest_pending.map(mapItem),
    },
    activity: d.activity.map(mapActivity),
    staffToday: d.staff_today.map((s) => ({ id: s.id, name: s.name, hue: hueOf(s.name), submitted: s.submitted, approved: s.approved })),
    now: ms(d.now),
  }
}

export async function getNavCounts() {
  return call('/api/admin/nav-counts/')
}

export async function globalSearch(q) {
  if (!q || q.trim().length < 2) return []
  return (await call(`/api/admin/search/${query({ q: q.trim() })}`)).map(mapItem)
}

let optionsPromise = null
/** Shelves and staff for the filter drop-downs; loaded once, refreshed after a shelf changes. */
export function getFilterOptions() {
  if (!optionsPromise) {
    optionsPromise = call('/api/admin/options/')
      .then((o) => ({ shelves: o.shelves.map((s) => ({ id: s.id, code: s.id, status: s.status })), staff: o.staff.map((u) => ({ id: u.id, name: u.name, hue: hueOf(u.name) })) }))
      .catch((error) => {
        optionsPromise = null
        throw error
      })
  }
  return optionsPromise
}

// --------------------------------------------------------------------------
// Books
// --------------------------------------------------------------------------
/** `statuses`: array of statuses. Returns { rows, total, page, pages, pageSize }. */
export async function listItems({ statuses, q = '', shelf = '', staff = '', source = '', author = '', approvedOnly = false, reason = '', sort = 'newest', page = 1, pageSize = 20 } = {}) {
  const res = await call(
    `/api/admin/books/${query({ status: statuses?.join(','), q, shelf, staff, source, author, approved_only: approvedOnly, reason, sort, page, page_size: pageSize })}`,
  )
  return { rows: res.results.map(mapItem), total: res.total, page: res.page, pages: res.pages, pageSize: res.page_size }
}

/** The reasons for rejecting a book (the Rejected page dropdown). */
export async function getRejectionReasons() {
  return call('/api/admin/rejection-reasons/')
}

export async function getAuthors(statuses) {
  return call(`/api/admin/authors/${query({ status: statuses?.join(',') })}`)
}

export async function getItem(id) {
  return mapItem(await call(`/api/admin/books/${encodeURIComponent(id)}/`))
}

const PATCH_KEYS = { shelfId: 'shelf_id' }
const CHANGE_KEYS = { shelf_id: 'shelfId' }

/** Saves edits (title, author, publisher, year, pages, shelfId, quantity). -> { outcome, match, changes, item }; a clash on the same shelf throws code 'duplicate_same_shelf'. */
export async function updateItem(id, patch) {
  const body = Object.fromEntries(Object.entries(patch).map(([k, v]) => [PATCH_KEYS[k] || k, v]))
  const res = await change(`/api/admin/books/${id}/`, { method: 'PATCH', body })
  return { outcome: res.outcome, match: mapMatch(res.match), changes: res.changes.map((k) => CHANGE_KEYS[k] || k), item: mapItem(res.item) }
}

export async function approveItem(id) {
  return mapItem(await change(`/api/admin/books/${id}/approve/`, { method: 'POST' }))
}

export async function rejectItem(id, { reason, note = '' }) {
  return mapItem(await change(`/api/admin/books/${id}/reject/`, { method: 'POST', body: { reason, note } }))
}

// --------------------------------------------------------------------------
// Waiting list + out of stock
// --------------------------------------------------------------------------
/** One row per book: { key, isbn, title, author, ready, entries: [item, oldest first] }. Each entry is a waiting shelf. */
export async function getWaitingList() {
  const res = await call('/api/admin/waiting-list/')
  return res.results.map((g) => ({ key: g.key, isbn: g.isbn, title: g.title, author: g.author, ready: g.ready, entries: g.entries.map(mapItem) }))
}

/** -> the entry that went live, plus previousShelfId / productId of the entry it replaced. */
export async function approveWaitingEntry(id) {
  const res = await change(`/api/admin/waiting-list/${id}/approve/`, { method: 'POST' })
  const item = mapItem(res.item)
  return { ...item, previousShelfId: res.closed.shelf_id, productId: res.closed.product_id }
}

export async function getOutOfStock() {
  return (await call('/api/admin/out-of-stock/')).map(mapItem)
}

// --------------------------------------------------------------------------
// Shelves
// --------------------------------------------------------------------------
export async function getShelves() {
  return (await call('/api/admin/shelves/')).map(mapShelf)
}

/** Adds a shelf, or (with `id`) edits its note. -> { id } */
export async function saveShelf({ id, code, note = '' }) {
  const shelf = id
    ? await change(`/api/admin/shelves/${encodeURIComponent(id)}/`, { method: 'PATCH', body: { note } })
    : await change('/api/admin/shelves/', { method: 'POST', body: { code: code.trim().toUpperCase(), note } })
  optionsPromise = null
  return { id: shelf.id }
}

export async function setShelfStatus(id, status) {
  await change(`/api/admin/shelves/${encodeURIComponent(id)}/`, { method: 'PATCH', body: { status } })
  optionsPromise = null
}

// --------------------------------------------------------------------------
// Reports
// --------------------------------------------------------------------------
export async function getReports({ days = 14, shelf = '', staff = '', status = '' } = {}) {
  const r = await call(`/api/admin/reports/${query({ days, shelf, staff, status })}`)
  const row = (x) => ({ id: x.id, title: x.title, author: x.author, isbn: x.isbn, shelf: x.shelf, quantity: x.quantity, submittedBy: x.submitted_by, submittedAt: ms(x.submitted_at) })
  return {
    series: r.series.map((x) => ({ date: Date.parse(`${x.date}T00:00:00`), added: x.added, approved: x.approved, rejected: x.rejected })),
    totals: { added: r.totals.added, approved: r.totals.approved, rejected: r.totals.rejected, autoRejected: r.totals.auto_rejected, waiting: r.totals.waiting, outOfStock: r.totals.out_of_stock },
    byShelf: r.by_shelf.map(mapShelf),
    staffRows: r.staff_rows.map((s) => ({ id: s.id, name: s.name, hue: hueOf(s.name), status: s.is_active ? 'active' : 'inactive', submitted: s.submitted, approved: s.approved, rejected: s.rejected, waiting: s.waiting, rate: s.rate })),
    lists: {
      added: r.lists.added.map((x) => ({ ...row(x), status: x.status })),
      approved: r.lists.approved.map((x) => ({ ...row(x), approvedAt: ms(x.approved_at), productId: x.product_id })),
      rejected: r.lists.rejected.map((x) => ({ ...row(x), reason: x.reason, by: x.by, rejectedAt: ms(x.rejected_at) })),
      waiting: r.lists.waiting.map((x) => ({ ...row(x), currentShelf: x.current_shelf, currentStock: x.current_stock, ready: x.ready })),
      outOfStock: r.lists.out_of_stock.map((x) => ({ ...row(x), stockOutAt: ms(x.stock_out_at), waitingEntries: x.waiting_entries })),
    },
    reasons: r.reasons,
  }
}

// --------------------------------------------------------------------------
// Activity log
// --------------------------------------------------------------------------
export function mapActivity(a) {
  return {
    id: a.id,
    at: ms(a.created_at),
    actor: a.actor_type === 'user' ? a.actor : a.actor_type, // a user id, 'system' or 'shopify'
    actorName: a.actor_name,
    action: a.action,
    object: a.object,
    detail: a.detail,
    type: a.kind,
    result: a.result,
    itemId: a.book_id,
  }
}

/** `actor`: a user id, 'system' or 'shopify'. Returns { rows, total, page, pages, pageSize } (newest first). */
export async function getActivity({ q = '', type = '', actor = '', page = 1, pageSize = 30 } = {}) {
  const res = await call(`/api/admin/activity/${query({ q, type, actor, page, page_size: pageSize })}`)
  return { rows: res.results.map(mapActivity), total: res.total, page: res.page, pages: res.pages, pageSize: res.page_size }
}

// --------------------------------------------------------------------------
// Settings
// --------------------------------------------------------------------------
const mapSettings = (s) => ({
  storeName: s.store_name,
  domain: s.store_domain,
  location: s.store_location,
  connected: s.shopify_connected,
  pollMinutes: s.stock_poll_minutes,
  reminderHours: s.reminder_after_hours,
  lastPollAt: ms(s.last_stock_check_at),
  health: s.shopify_connected ? 'healthy' : 'disconnected',
})

let settingsPromise = null
/** The store settings; shared by the sidebar, dashboard and Settings page, refreshed after a save. */
export function getSettings() {
  if (!settingsPromise) {
    settingsPromise = call('/api/admin/settings/').then(mapSettings).catch((error) => {
      settingsPromise = null
      throw error
    })
  }
  return settingsPromise
}

/** Saves {storeName, domain, location, pollMinutes, reminderHours, connected} (any of them). */
export async function saveSettings(values) {
  const body = {
    store_name: values.storeName, store_domain: values.domain, store_location: values.location,
    stock_poll_minutes: values.pollMinutes, reminder_after_hours: values.reminderHours, shopify_connected: values.connected,
  }
  const saved = mapSettings(await change('/api/admin/settings/', { method: 'PATCH', body: Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) }))
  settingsPromise = Promise.resolve(saved)
  return saved
}

// --------------------------------------------------------------------------
// Content flags
// --------------------------------------------------------------------------
const mapCategory = (c) => ({ id: c.id, name: c.name, description: c.description, keywords: c.keywords, mode: c.mode, enabled: c.enabled, hue: c.hue, matches: c.matches, awaiting: c.awaiting })

export async function getFlagCategories() {
  return (await call('/api/admin/flag-categories/')).map(mapCategory)
}

/** Adds a category, or (with `id`) edits it. Throws a readable message for a taken name or no keywords. */
export async function saveFlagCategory({ id, name, description = '', keywords, mode, enabled = true }) {
  const body = { name, description, keywords: keywords.map((k) => k.trim()).filter(Boolean), mode, enabled }
  const saved = id ? await change(`/api/admin/flag-categories/${id}/`, { method: 'PATCH', body }) : await change('/api/admin/flag-categories/', { method: 'POST', body })
  return mapCategory(saved)
}

export async function setFlagCategoryEnabled(id, enabled) {
  return mapCategory(await change(`/api/admin/flag-categories/${id}/`, { method: 'PATCH', body: { enabled } }))
}

/** `tab`: review | reviewed | all. -> { rows, counts: { review, reviewed, all } } */
export async function getFlaggedItems({ tab = 'review', category = '' } = {}) {
  const res = await call(`/api/admin/flagged/${query({ tab, category })}`)
  return { rows: res.results.map(mapItem), counts: res.counts }
}

export async function reviewFlag(id, note = '') {
  return mapItem(await change(`/api/admin/books/${id}/flag-review/`, { method: 'POST', body: { note } }))
}
