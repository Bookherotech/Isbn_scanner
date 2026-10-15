/**
 * Mock service layer — the only module UI code calls for data.
 * Every function is async and shaped like the planned Django REST endpoints
 * (see API Contract, Section 22), so it can be swapped for fetch() calls later.
 */
import { db, commit, now, nextId, nextProductId, resetStore } from './store'
import { DAY, HOUR, MIN } from './mockData'
import { duplicateKey, normalizeAuthor, normalizeTitle } from './normalize'
import { findMetadata, ISBN_NOT_FOUND, ISBN_SERVICE_DOWN } from './catalog'
import { matchFlags } from './flags'

export class ApiError extends Error {
  constructor(code, message, details) {
    super(message)
    this.code = code
    this.details = details
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const latency = (min = 160, max = 340) => sleep(min + Math.random() * (max - min))
const copy = (v) => structuredClone(v)

function guardNetwork() {
  if (db().demo.networkError) throw new ApiError('network', 'The BookHero API could not be reached.')
}

export const ACTIVE_STATUSES = ['pending', 'waiting', 'live', 'out_of_stock']
const STAFF_AUDIENCE_COUNT = () => db().users.filter((u) => u.status === 'active').length

export function userName(id) {
  if (id === 'system') return 'System'
  if (id === 'shopify') return 'Shopify'
  return db().users.find((u) => u.id === id)?.name ?? 'Unknown'
}

function startOfDay(t) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function flagsOf(item) {
  return matchFlags(item, db().flagCategories || [])
}
const needsFlagReview = (item, flags = flagsOf(item)) =>
  ['pending', 'waiting'].includes(item.status) && !item.flagReviewedAt && flags.some((f) => f.mode === 'hold')

function view(item) {
  const s = db()
  const flags = flagsOf(item)
  const linked = item.linkedItemId ? s.items.find((i) => i.id === item.linkedItemId) : null
  const waiting = s.items.filter((i) => i.status === 'waiting' && i.linkedItemId === item.id)
  return {
    ...item,
    submittedByName: userName(item.submittedBy),
    approvedByName: item.approvedBy ? userName(item.approvedBy) : null,
    rejectedByName: item.rejectedBy ? userName(item.rejectedBy) : null,
    linked: linked
      ? { id: linked.id, shelfId: linked.shelfId, status: linked.status, stock: linked.stock, quantity: linked.quantity, productId: linked.productId, stockOutAt: linked.stockOutAt }
      : null,
    ready: item.status === 'waiting' && linked?.status === 'out_of_stock',
    flags,
    flagHold: needsFlagReview(item, flags),
    flagReviewedByName: item.flagReviewedBy ? userName(item.flagReviewedBy) : null,
    waitingEntries: waiting.map((w) => ({ id: w.id, shelfId: w.shelfId, quantity: w.quantity, submittedByName: userName(w.submittedBy), submittedAt: w.submittedAt })),
  }
}

function matchesQuery(item, q) {
  if (!q) return true
  const s = q.toLowerCase().trim()
  if (!s) return true
  const digits = s.replace(/[^0-9x]/g, '')
  return (
    item.title.toLowerCase().includes(s) ||
    item.author.toLowerCase().includes(s) ||
    item.shelfId.toLowerCase().includes(s) ||
    (digits.length >= 3 && item.isbn.includes(digits))
  )
}

function paginate(rows, page = 1, pageSize = 20) {
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const p = Math.min(Math.max(1, page), pages)
  return { rows: rows.slice((p - 1) * pageSize, p * pageSize), total, page: p, pages, pageSize }
}

function notify(s, n) {
  s.notifications.unshift({ id: nextId('notification'), readBy: [], push: true, at: now(), ...n })
}
function log(s, a) {
  s.activity.unshift({ id: nextId('activity'), at: now(), result: 'success', ...a })
}

function matchSummary(it) {
  return {
    itemId: it.id, title: it.title, author: it.author, isbn: it.isbn, shelfId: it.shelfId,
    quantity: it.status === 'live' || it.status === 'out_of_stock' ? it.stock : it.quantity, status: it.status,
  }
}

/** Core rule from Section 04: same title+author on same shelf → reject; other shelf → waiting list. */
function findDuplicates(s, { title, author, shelfId }, excludeId) {
  const key = duplicateKey(title, author)
  const matches = s.items.filter((i) => i.id !== excludeId && ACTIVE_STATUSES.includes(i.status) && duplicateKey(i.title, i.author) === key)
  const sameShelf = matches.find((i) => i.shelfId === shelfId) || null
  const primary =
    matches.find((i) => i.status === 'live' || i.status === 'out_of_stock') ||
    matches.find((i) => i.status === 'pending') ||
    (matches[0] ? s.items.find((i) => i.id === matches[0].linkedItemId) || matches[0] : null)
  return { key, matches, sameShelf, primary }
}

// --------------------------------------------------------------------------
// Auth
// --------------------------------------------------------------------------
export async function login({ role, username }) {
  await latency(250, 450)
  const users = db().users
  let user = username ? users.find((u) => u.username === username.trim().toLowerCase() || u.email === username.trim().toLowerCase()) : null
  if (!user) user = users.find((u) => u.id === (role === 'admin' ? 'u_admin' : 'u_sarah'))
  if (user.status !== 'active') throw new ApiError('inactive', 'This account has been deactivated. Ask your admin to restore access.')
  commit((s) => {
    const u = s.users.find((x) => x.id === user.id)
    u.lastActive = now()
  })
  return copy(user)
}

// --------------------------------------------------------------------------
// Synchronous selectors (cheap badge counts — no latency, no skeletons)
// --------------------------------------------------------------------------
export const selectors = {
  navCounts() {
    const items = db().items
    const byId = new Map(items.map((i) => [i.id, i]))
    let pending = 0, waiting = 0, ready = 0, oos = 0, flagged = 0
    for (const i of items) {
      if (needsFlagReview(i)) flagged++
      if (i.status === 'pending') pending++
      else if (i.status === 'out_of_stock') oos++
      else if (i.status === 'waiting') {
        waiting++
        if (byId.get(i.linkedItemId)?.status === 'out_of_stock') ready++
      }
    }
    return { pending, waiting, ready, oos, flagged }
  },
  unreadCount(user) {
    if (!user) return 0
    return visibleNotifications(user).filter((n) => !n.readBy.includes(user.id)).length
  },
  latestPush(user, since) {
    if (!user) return []
    return visibleNotifications(user).filter((n) => n.push && n.at > since)
  },
  shopify() {
    return copy(db().shopify)
  },
  clock() {
    return now()
  },
  demoFlags() {
    return copy(db().demo)
  },
  shelfOptions() {
    return db().shelves.map((x) => ({ id: x.id, status: x.status }))
  },
  staffOptions() {
    return db().users.filter((u) => u.role === 'staff').map((u) => ({ id: u.id, name: u.name, hue: u.hue }))
  },
  userHue(id) {
    return db().users.find((u) => u.id === id)?.hue ?? 40
  },
}

// --------------------------------------------------------------------------
// Dashboard + search
// --------------------------------------------------------------------------
export async function getDashboard() {
  await latency(260, 480)
  guardNetwork()
  const s = db()
  const t = now()
  const today = startOfDay(t)
  const items = s.items
  const counts = selectors.navCounts()
  const live = items.filter((i) => i.status === 'live')
  const oos = items.filter((i) => i.status === 'out_of_stock')

  const added7 = Array.from({ length: 7 }, (_, k) => {
    const start = today - (6 - k) * DAY
    const end = start + DAY
    const inDay = items.filter((i) => i.submittedAt >= start && i.submittedAt < end)
    return {
      date: start,
      count: inDay.length,
      approved: items.filter((i) => i.approvedAt >= start && i.approvedAt < end).length,
    }
  })
  const addedToday = added7[6].count
  const addedYesterday = added7[5].count

  const shelfMap = new Map()
  for (const i of live) {
    const e = shelfMap.get(i.shelfId) || { shelfId: i.shelfId, units: 0, titles: 0 }
    e.units += i.stock
    e.titles += 1
    shelfMap.set(i.shelfId, e)
  }
  const shelves = [...shelfMap.values()].sort((a, b) => b.units - a.units)

  const readyEntries = items.filter((i) => i.status === 'waiting').map(view).filter((v) => v.ready)
  const failed = items.filter((i) => i.syncStatus === 'failed' && (i.status === 'live' || i.status === 'out_of_stock'))
  const flaggedItems = items.filter((i) => needsFlagReview(i)).map(view)
  const oldestPending = items.filter((i) => i.status === 'pending' && !needsFlagReview(i)).sort((a, b) => a.submittedAt - b.submittedAt).slice(0, 3)

  const staffToday = s.users
    .filter((u) => u.role === 'staff' && u.status === 'active')
    .map((u) => ({
      id: u.id, name: u.name, hue: u.hue,
      submitted: items.filter((i) => i.submittedBy === u.id && i.submittedAt >= today).length,
      approved: items.filter((i) => i.submittedBy === u.id && i.approvedAt >= today).length,
    }))
    .sort((a, b) => b.submitted - a.submitted)

  return copy({
    kpis: {
      pending: counts.pending,
      waiting: counts.waiting,
      ready: counts.ready,
      liveTitles: live.length,
      liveUnits: live.reduce((a, i) => a + i.stock, 0),
      outOfStock: oos.length,
      addedToday,
      addedYesterday,
      approvedToday: added7[6].approved,
    },
    added7,
    status: [
      { key: 'live', label: 'Live', count: live.length },
      { key: 'pending', label: 'Pending', count: counts.pending },
      { key: 'waiting', label: 'Waiting list', count: counts.waiting },
      { key: 'out_of_stock', label: 'Out of stock', count: oos.length },
      { key: 'rejected', label: 'Rejected', count: items.filter((i) => i.status === 'rejected').length },
    ],
    shelves: shelves.slice(0, 8),
    shelfCount: s.shelves.filter((x) => x.status === 'active').length,
    attention: {
      ready: readyEntries,
      failed: failed.map(view),
      flagged: flaggedItems,
      oldestPending: oldestPending.map(view),
    },
    activity: s.activity.slice(0, 9).map((a) => ({ ...a, actorName: userName(a.actor) })),
    staffToday,
    shopify: s.shopify,
    now: t,
  })
}

export async function globalSearch(q) {
  await latency(90, 160)
  const s = db()
  if (!q || q.trim().length < 2) return []
  return copy(
    s.items
      .filter((i) => i.status !== 'closed' && matchesQuery(i, q))
      .sort((a, b) => (a.status === 'live' ? -1 : 0) - (b.status === 'live' ? -1 : 0))
      .slice(0, 8)
      .map(view),
  )
}

// --------------------------------------------------------------------------
// Items (submissions / inventory entries)
// --------------------------------------------------------------------------
const SORTS = {
  newest: (a, b) => b.submittedAt - a.submittedAt,
  oldest: (a, b) => a.submittedAt - b.submittedAt,
  title: (a, b) => a.title.localeCompare(b.title),
  stock: (a, b) => (a.stock ?? 0) - (b.stock ?? 0),
  approved: (a, b) => (b.approvedAt ?? 0) - (a.approvedAt ?? 0),
  rejected: (a, b) => (b.rejectedAt ?? 0) - (a.rejectedAt ?? 0),
}

export async function listItems({ statuses, q = '', shelf = '', staff = '', source = '', author = '', approvedOnly = false, sort = 'newest', page = 1, pageSize = 20 } = {}) {
  await latency()
  guardNetwork()
  let rows = db().items.filter(
    (i) =>
      (!statuses || statuses.includes(i.status)) &&
      (!approvedOnly || i.approvedAt) &&
      (!shelf || i.shelfId === shelf) &&
      (!staff || i.submittedBy === staff) &&
      (!source || i.source === source) &&
      (!author || i.author === author) &&
      matchesQuery(i, q),
  )
  rows = rows.sort(SORTS[sort] || SORTS.newest)
  const result = paginate(rows, page, pageSize)
  return copy({ ...result, rows: result.rows.map(view) })
}

export async function getAuthors(statuses) {
  const set = new Set(db().items.filter((i) => statuses.includes(i.status)).map((i) => i.author))
  return [...set].sort()
}

export async function getItem(id) {
  await latency(200, 380)
  guardNetwork()
  const s = db()
  const item = s.items.find((i) => i.id === id)
  if (!item) throw new ApiError('not_found', 'This book could not be found. It may have been removed or reset.')
  const product = item.productId ? s.items.filter((i) => i.productId === item.productId).sort((a, b) => (a.approvedAt ?? 0) - (b.approvedAt ?? 0)) : []
  const dup = findDuplicates(s, item, item.id)
  return copy({
    ...view(item),
    shelfHistory: product.map((p) => ({ id: p.id, shelfId: p.shelfId, status: p.status, quantity: p.quantity, stock: p.stock, approvedAt: p.approvedAt, closedAt: p.closedAt })),
    duplicateCheck: {
      key: { title: normalizeTitle(item.title), author: normalizeAuthor(item.author) },
      matches: dup.matches.map(matchSummary),
    },
    activity: s.activity.filter((a) => a.itemId === id).slice(0, 12).map((a) => ({ ...a, actorName: userName(a.actor) })),
  })
}

export async function updateItem(id, patch, actorId = 'u_admin') {
  await latency(300, 520)
  guardNetwork()
  const s = db()
  const item = s.items.find((i) => i.id === id)
  if (!item) throw new ApiError('not_found', 'Book not found.')
  const next = { ...item, ...patch }
  const changes = Object.keys(patch).filter((k) => String(patch[k] ?? '') !== String(item[k] ?? ''))
  const identityChanged = changes.some((k) => ['title', 'author', 'shelfId'].includes(k))
  let outcome = 'saved'
  let match = null
  if (identityChanged && (item.status === 'pending' || item.status === 'waiting')) {
    // Section 04: the duplicate check runs again when Admin edits title, author or shelf.
    const dup = findDuplicates(s, next, item.id)
    if (dup.sameShelf) {
      const m = matchSummary(dup.sameShelf)
      throw new ApiError('duplicate_same_shelf', `Already added on Shelf ${m.shelfId} with quantity ${m.quantity}.`, m)
    }
    if (dup.primary && item.status === 'pending') {
      outcome = 'moved_to_waiting'
      match = matchSummary(dup.primary)
      Object.assign(next, { status: 'waiting', linkedItemId: dup.primary.id, match, waitingReadyAt: dup.primary.status === 'out_of_stock' ? now() : null })
    } else if (!dup.primary && item.status === 'waiting') {
      outcome = 'moved_to_pending'
      Object.assign(next, { status: 'pending', linkedItemId: null, match: null, waitingReadyAt: null })
    }
  }
  const label = { title: 'title', author: 'author', publisher: 'publisher', year: 'year', pages: 'page count' }
  const detail = changes
    .map((k) => (k === 'shelfId' ? `shelf ${item.shelfId} → ${patch.shelfId}` : k === 'quantity' ? `quantity ${item.quantity} → ${patch.quantity}` : label[k] || k))
    .join(', ')
  commit((st) => {
    Object.assign(item, next)
    if (changes.length) {
      log(st, { actor: actorId, action: 'Edited', object: `“${item.title}”`, detail: `Updated ${detail}`, type: 'edit', itemId: id, result: 'info' })
    }
  })
  return { outcome, match, changes, item: copy(view(item)) }
}

export async function approveItem(id, actorId = 'u_admin') {
  await latency(500, 750)
  guardNetwork()
  const s = db()
  const item = s.items.find((i) => i.id === id)
  if (!item || item.status !== 'pending') throw new ApiError('invalid_state', 'Only pending books can be approved.')
  commit((st) => {
    const t = now()
    if (needsFlagReview(item)) {
      Object.assign(item, { flagReviewedAt: t, flagReviewedBy: actorId, flagNote: 'Reviewed on approval' })
      log(st, { actor: actorId, action: 'Flag reviewed', object: `“${item.title}”`, detail: 'Reviewed on approval', type: 'flag', itemId: id })
    }
    Object.assign(item, {
      status: 'live', stock: item.quantity, approvedBy: actorId, approvedAt: t,
      productId: nextProductId(), syncStatus: 'synced', lastSync: t,
    })
    log(st, { actor: actorId, action: 'Approved', object: `“${item.title}”`, detail: `Shelf ${item.shelfId} · qty ${item.quantity}`, type: 'approval', itemId: id })
    log(st, { actor: 'shopify', action: 'Product created', object: `“${item.title}”`, detail: `Shopify #${item.productId} · ${item.quantity} units`, type: 'shopify', itemId: id })
    notify(st, { type: 'approved', audience: item.submittedBy, title: 'Approved', body: `“${item.title}” is now live on Shopify (shelf ${item.shelfId}).`, itemId: id })
  })
  return copy(view(item))
}

export async function rejectItem(id, { reason, note = '' }, actorId = 'u_admin') {
  await latency(350, 550)
  guardNetwork()
  const s = db()
  const item = s.items.find((i) => i.id === id)
  if (!item || !['pending', 'waiting'].includes(item.status)) throw new ApiError('invalid_state', 'This entry can no longer be rejected.')
  commit((st) => {
    Object.assign(item, { status: 'rejected', rejectedBy: actorId, rejectedAt: now(), rejectReason: reason, rejectNote: note })
    log(st, { actor: actorId, action: 'Rejected', object: `“${item.title}”`, detail: reason, type: 'rejection', itemId: id, result: 'error' })
    notify(st, { type: 'rejected', audience: item.submittedBy, title: 'Rejected', body: `“${item.title}” was rejected: ${reason.toLowerCase()}.`, itemId: id, push: false })
  })
  return copy(view(item))
}

// --------------------------------------------------------------------------
// Staff flow — ISBN lookup + submission
// --------------------------------------------------------------------------
/** `retry: true` is passed by the Retry button — the simulated outage recovers on retry. */
export async function lookupIsbn(isbn13, { retry = false } = {}) {
  await latency(650, 900)
  if (isbn13 === ISBN_SERVICE_DOWN && !retry) {
    throw new ApiError('service_unavailable', 'Google Books timed out and the Open Library fallback did not respond.')
  }
  if (isbn13 === ISBN_SERVICE_DOWN) {
    return { isbn: isbn13, title: 'The Thursday Murder Club', author: 'Richard Osman', publisher: 'Pamela Dorman Books', year: 2021, pages: 384, source: 'openlibrary', fallback: true, missing: [], noCover: true }
  }
  if (isbn13 === ISBN_NOT_FOUND) throw new ApiError('not_found', 'No record for this ISBN in Google Books or Open Library.')
  const rec = findMetadata(isbn13)
  if (!rec) throw new ApiError('not_found', 'No record for this ISBN in Google Books or Open Library.')
  const missing = ['title', 'author', 'publisher', 'year', 'pages'].filter((k) => rec[k] === '' || rec[k] == null)
  return { ...rec, missing }
}

export async function submitBook(draft, userId) {
  await latency(380, 600)
  guardNetwork()
  const s = db()
  const dup = findDuplicates(s, draft)
  const fetched = draft.fetched || null
  const editedFields = fetched ? ['title', 'author', 'publisher', 'year', 'pages'].filter((k) => String(fetched[k] ?? '') !== String(draft[k] ?? '')) : []
  const base = {
    id: nextId('item'),
    isbn: draft.isbn,
    title: draft.title.trim(),
    author: draft.author.trim(),
    publisher: draft.publisher || '',
    year: draft.year ? Number(draft.year) : '',
    pages: draft.pages ? Number(draft.pages) : '',
    source: draft.source || 'manual',
    subjects: draft.subjects || [],
    fetched,
    editedFields,
    shelfId: draft.shelfId,
    quantity: Number(draft.quantity),
    stock: null,
    submittedBy: userId,
    submittedAt: now(),
  }
  const who = userName(userId).split(' ')[0]
  let result
  commit((st) => {
    if (dup.sameShelf) {
      const match = matchSummary(dup.sameShelf)
      st.items.push({ ...base, status: 'rejected', rejectedBy: 'system', rejectedAt: now(), rejectReason: 'Duplicate — same shelf', match })
      log(st, { actor: userId, action: 'Submitted', object: `“${base.title}”`, detail: `Shelf ${base.shelfId} · qty ${base.quantity}`, type: 'submission', itemId: base.id, result: 'info' })
      log(st, { actor: 'system', action: 'Auto-rejected', object: `“${base.title}”`, detail: `Already on shelf ${match.shelfId} (title + author match)`, type: 'rejection', itemId: base.id, result: 'error' })
      result = { result: 'rejected', match }
    } else if (dup.primary) {
      const match = matchSummary(dup.primary)
      const ready = dup.primary.status === 'out_of_stock'
      st.items.push({ ...base, status: 'waiting', linkedItemId: dup.primary.id, match, waitingReadyAt: ready ? now() : null })
      log(st, { actor: userId, action: 'Submitted', object: `“${base.title}”`, detail: `Shelf ${base.shelfId} · qty ${base.quantity}`, type: 'submission', itemId: base.id, result: 'info' })
      log(st, { actor: 'system', action: 'Waiting list created', object: `“${base.title}”`, detail: `${match.shelfId} active · waiting on ${base.shelfId}`, type: 'waiting', itemId: base.id, result: 'warning' })
      notify(st, { type: 'waiting_created', audience: 'admin', title: 'Waiting-list entry', body: `${who} added “${base.title}” on ${base.shelfId}. Current stock is on ${match.shelfId}.`, itemId: base.id, push: false })
      if (ready) notify(st, { type: 'waiting_ready', audience: 'admin', title: 'Waiting list ready', body: `“${base.title}” is out of stock — the entry on ${base.shelfId} is ready for approval.`, itemId: base.id })
      result = { result: 'waiting', match, ready }
    } else {
      st.items.push({ ...base, status: 'pending' })
      log(st, { actor: userId, action: 'Submitted', object: `“${base.title}”`, detail: `Shelf ${base.shelfId} · qty ${base.quantity}`, type: 'submission', itemId: base.id, result: 'info' })
      notify(st, { type: 'new_submission', audience: 'admin', title: 'New submission', body: `${who} submitted “${base.title}” for review.`, itemId: base.id, push: false })
      result = { result: 'pending' }
    }
    if (result.result !== 'rejected') {
      const flags = matchFlags(base, st.flagCategories || [])
      if (flags.length) {
        const hold = flags.some((f) => f.mode === 'hold')
        log(st, { actor: 'system', action: 'Flagged', object: `“${base.title}”`, detail: flags.map((f) => f.name).join(', '), type: 'flag', itemId: base.id, result: hold ? 'warning' : 'info' })
        if (hold) notify(st, { type: 'flagged', audience: 'admin', title: 'Flagged for review', body: `“${base.title}” matches ${flags.map((f) => f.name).join(', ')}.`, itemId: base.id })
      }
    }
    const u = st.users.find((x) => x.id === userId)
    if (u) u.lastActive = now()
  })
  const item = db().items.find((i) => i.id === base.id)
  const flags = result.result === 'rejected' ? [] : flagsOf(item)
  return copy({ ...result, flags, flagHold: flags.some((f) => f.mode === 'hold'), item: view(item), key: { title: normalizeTitle(base.title), author: normalizeAuthor(base.author) } })
}

export async function getStaffHome(userId) {
  await latency(220, 380)
  guardNetwork()
  const s = db()
  const today = startOfDay(now())
  const mine = s.items.filter((i) => i.submittedBy === userId)
  const todays = mine.filter((i) => i.submittedAt >= today)
  return copy({
    today: {
      scanned: todays.length,
      pending: mine.filter((i) => i.status === 'pending').length,
      approved: mine.filter((i) => i.approvedAt >= today).length,
      waiting: mine.filter((i) => i.status === 'waiting').length,
    },
    recent: mine.sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 5).map(view),
  })
}

export async function getMySubmissions(userId, { status = 'all', page = 1, pageSize = 12 } = {}) {
  await latency(200, 360)
  guardNetwork()
  const mine = db().items.filter((i) => i.submittedBy === userId)
  const counts = mine.reduce((acc, i) => ((acc[i.status] = (acc[i.status] || 0) + 1), acc), { all: mine.length })
  const rows = mine.filter((i) => status === 'all' || i.status === status).sort((a, b) => b.submittedAt - a.submittedAt)
  const res = paginate(rows, page, pageSize)
  return copy({ ...res, rows: res.rows.map(view), counts })
}

// --------------------------------------------------------------------------
// Waiting list + out of stock
// --------------------------------------------------------------------------
export async function getWaitingList() {
  await latency()
  guardNetwork()
  const rows = db().items.filter((i) => i.status === 'waiting').map(view)
  rows.sort((a, b) => Number(b.ready) - Number(a.ready) || a.submittedAt - b.submittedAt)
  return copy(rows)
}

export async function approveWaitingEntry(id, actorId = 'u_admin') {
  await latency(500, 700)
  guardNetwork()
  const s = db()
  const entry = s.items.find((i) => i.id === id)
  const primary = entry && s.items.find((i) => i.id === entry.linkedItemId)
  if (!entry || entry.status !== 'waiting' || !primary) throw new ApiError('invalid_state', 'This waiting-list entry is no longer open.')
  if (primary.status !== 'out_of_stock') throw new ApiError('not_ready', `Current stock on ${primary.shelfId} has not sold out yet (${primary.stock} left).`)
  const before = { shelfId: primary.shelfId, productId: primary.productId }
  commit((st) => {
    const t = now()
    Object.assign(primary, { status: 'closed', closedAt: t, closedReason: `Sold out — active shelf switched to ${entry.shelfId}`, reminderCancelled: !primary.push2At })
    Object.assign(entry, {
      status: 'live', stock: entry.quantity, approvedBy: actorId, approvedAt: t, productId: primary.productId,
      syncStatus: 'synced', lastSync: t, previousShelfId: primary.shelfId, waitingReadyAt: entry.waitingReadyAt ?? t,
    })
    for (const other of st.items) {
      if (other.status === 'waiting' && other.linkedItemId === primary.id && other.id !== entry.id) {
        other.linkedItemId = entry.id
        other.waitingReadyAt = null
      }
    }
    log(st, { actor: actorId, action: 'Approved waiting entry', object: `“${entry.title}”`, detail: `Shelf ${entry.shelfId} · qty ${entry.quantity}`, type: 'approval', itemId: entry.id })
    log(st, { actor: 'shopify', action: 'Quantity added', object: `“${entry.title}”`, detail: `+${entry.quantity} units on the same Shopify product #${primary.productId}`, type: 'shopify', itemId: entry.id })
    log(st, { actor: actorId, action: 'Active shelf switched', object: `“${entry.title}”`, detail: `${before.shelfId} closed → ${entry.shelfId} active`, type: 'shelf', itemId: entry.id })
    notify(st, { type: 'waiting_approved', audience: 'all', title: 'Back in stock', body: `${entry.title} is live again on ${entry.shelfId} — ${entry.quantity} units added to the same Shopify product.`, itemId: entry.id, push: false })
  })
  return copy({ ...view(entry), previousShelfId: before.shelfId, productId: before.productId })
}

export async function getOutOfStock() {
  await latency()
  guardNetwork()
  const s = db()
  return copy(
    s.items
      .filter((i) => i.status === 'out_of_stock')
      .sort((a, b) => b.stockOutAt - a.stockOutAt)
      .map((i) => {
        const v = view(i)
        return { ...v, waitingEntries: s.items.filter((w) => w.status === 'waiting' && w.linkedItemId === i.id).map(view) }
      }),
  )
}

// --------------------------------------------------------------------------
// Notifications
// --------------------------------------------------------------------------
function visibleNotifications(user) {
  return db().notifications.filter(
    (n) => n.audience === 'all' || n.audience === user.role || n.audience === user.id,
  )
}

export async function getNotifications(user, { filter = 'all' } = {}) {
  await latency(180, 320)
  guardNetwork()
  const groups = {
    stock: ['stock_out', 'stock_out_reminder', 'waiting_approved'],
    waiting: ['waiting_ready', 'waiting_created', 'waiting_approved'],
    submissions: ['new_submission', 'approved', 'rejected', 'flagged'],
    flags: ['flagged'],
  }
  const rows = visibleNotifications(user)
    .filter((n) => filter === 'all' || (filter === 'unread' ? !n.readBy.includes(user.id) : groups[filter]?.includes(n.type)))
    .map((n) => ({ ...n, read: n.readBy.includes(user.id) }))
  return copy(rows)
}

export async function markNotificationRead(user, id) {
  commit((s) => {
    const n = s.notifications.find((x) => x.id === id)
    if (n && !n.readBy.includes(user.id)) n.readBy.push(user.id)
  })
}

export async function markAllNotificationsRead(user) {
  await latency(120, 200)
  commit((s) => {
    for (const n of s.notifications) {
      if ((n.audience === 'all' || n.audience === user.role || n.audience === user.id) && !n.readBy.includes(user.id)) n.readBy.push(user.id)
    }
  })
}

// --------------------------------------------------------------------------
// Content flags
// --------------------------------------------------------------------------
export async function getFlagCategories() {
  await latency(160, 300)
  guardNetwork()
  const s = db()
  return copy(
    s.flagCategories.map((c) => {
      const hits = s.items.filter((i) => ACTIVE_STATUSES.includes(i.status) && matchFlags(i, [{ ...c, enabled: true }]).length)
      return { ...c, matches: hits.length, awaiting: hits.filter((i) => c.mode === 'hold' && c.enabled && needsFlagReview(i)).length }
    }),
  )
}

export async function saveFlagCategory({ id, name, description = '', keywords, mode, enabled = true }, actorId = 'u_admin') {
  await latency(220, 380)
  const s = db()
  const clean = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))]
  if (!name.trim()) throw new ApiError('validation', 'Give the category a name.')
  if (!clean.length) throw new ApiError('validation', 'Add at least one keyword or subject to match.')
  if (s.flagCategories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase() && c.id !== id)) throw new ApiError('validation', `A category called “${name.trim()}” already exists.`)
  commit((st) => {
    if (id) {
      Object.assign(st.flagCategories.find((c) => c.id === id), { name: name.trim(), description: description.trim(), keywords: clean, mode, enabled })
      log(st, { actor: actorId, action: 'Updated flag category', object: name.trim(), detail: `${mode === 'hold' ? 'Hold for review' : 'Label only'} · ${clean.length} keywords`, type: 'flag', result: 'info' })
    } else {
      st.flagCategories.push({ id: `flag_${Date.now().toString(36)}`, name: name.trim(), description: description.trim(), keywords: clean, mode, enabled, hue: Math.floor(Math.random() * 360), createdAt: now() })
      log(st, { actor: actorId, action: 'Added flag category', object: name.trim(), detail: `${mode === 'hold' ? 'Hold for review' : 'Label only'} · ${clean.join(', ')}`, type: 'flag' })
    }
  })
}

export async function setFlagCategoryEnabled(id, enabled, actorId = 'u_admin') {
  await latency(120, 220)
  commit((st) => {
    const c = st.flagCategories.find((x) => x.id === id)
    c.enabled = enabled
    log(st, { actor: actorId, action: enabled ? 'Enabled flag category' : 'Disabled flag category', object: c.name, detail: enabled ? 'Matching books are flagged' : 'No longer applied', type: 'flag', result: 'info' })
  })
}

export async function getFlaggedItems({ tab = 'review', category = '' } = {}) {
  await latency()
  guardNetwork()
  const rows = db()
    .items.filter((i) => ACTIVE_STATUSES.includes(i.status))
    .map(view)
    .filter((v) => v.flags.length && (!category || v.flags.some((f) => f.id === category)))
  const review = rows.filter((v) => v.flagHold)
  const done = rows.filter((v) => !v.flagHold)
  const pick = tab === 'review' ? review : tab === 'reviewed' ? done : rows
  return copy({ rows: pick.sort((a, b) => b.submittedAt - a.submittedAt), counts: { review: review.length, reviewed: done.length, all: rows.length } })
}

export async function reviewFlag(id, note = '', actorId = 'u_admin') {
  await latency(250, 400)
  guardNetwork()
  commit((st) => {
    const it = st.items.find((i) => i.id === id)
    Object.assign(it, { flagReviewedAt: now(), flagReviewedBy: actorId, flagNote: note || 'Reviewed — no action needed' })
    log(st, { actor: actorId, action: 'Flag reviewed', object: `“${it.title}”`, detail: note || 'No action needed', type: 'flag', itemId: id })
  })
}

// --------------------------------------------------------------------------
// Activity
// --------------------------------------------------------------------------
export async function getActivity({ q = '', type = '', actor = '', page = 1, pageSize = 25 } = {}) {
  await latency()
  guardNetwork()
  const needle = q.toLowerCase().trim()
  const rows = db().activity.filter(
    (a) =>
      (!type || a.type === type) &&
      (!actor || a.actor === actor) &&
      (!needle || `${a.action} ${a.object} ${a.detail} ${userName(a.actor)}`.toLowerCase().includes(needle)),
  )
  const res = paginate(rows, page, pageSize)
  return copy({ ...res, rows: res.rows.map((a) => ({ ...a, actorName: userName(a.actor) })) })
}

// --------------------------------------------------------------------------
// Shelves (Masters)
// --------------------------------------------------------------------------
function shelfStats(s, shelf) {
  const here = s.items.filter((i) => i.shelfId === shelf.id)
  const live = here.filter((i) => i.status === 'live' || i.status === 'out_of_stock')
  return {
    ...shelf,
    titles: live.length,
    units: live.reduce((a, i) => a + (i.stock || 0), 0),
    waiting: here.filter((i) => i.status === 'waiting').length,
    pending: here.filter((i) => i.status === 'pending').length,
  }
}

export async function getShelves({ includeInactive = true } = {}) {
  await latency(150, 280)
  guardNetwork()
  const s = db()
  return copy(s.shelves.filter((x) => includeInactive || x.status === 'active').map((x) => shelfStats(s, x)))
}

/** Instant list for the staff shelf picker (no skeleton between steps). */
export function getActiveShelvesSync() {
  return copy(db().shelves.filter((x) => x.status === 'active'))
}

export async function saveShelf({ id, code, note = '', status = 'active' }, actorId = 'u_admin') {
  await latency(250, 420)
  const clean = code.trim().toUpperCase()
  if (!/^[A-Z]-\d{2}$/.test(clean)) throw new ApiError('validation', 'Use the format letter-dash-two digits, e.g. A-13.')
  const s = db()
  if (!id && s.shelves.some((x) => x.id === clean)) throw new ApiError('validation', `Shelf ${clean} already exists.`)
  commit((st) => {
    if (id) {
      const shelf = st.shelves.find((x) => x.id === id)
      shelf.note = note
      log(st, { actor: actorId, action: 'Updated shelf', object: `Shelf ${id}`, detail: note || 'Details updated', type: 'shelf', result: 'info' })
    } else {
      st.shelves.push({ id: clean, code: clean, zone: clean[0], status, note, createdAt: now() })
      st.shelves.sort((a, b) => a.code.localeCompare(b.code))
      log(st, { actor: actorId, action: 'Added shelf', object: `Shelf ${clean}`, detail: 'Available in the staff shelf picker', type: 'shelf' })
    }
  })
  return { id: id || clean }
}

export async function setShelfStatus(id, status, actorId = 'u_admin') {
  await latency(200, 350)
  commit((st) => {
    const shelf = st.shelves.find((x) => x.id === id)
    shelf.status = status
    log(st, { actor: actorId, action: status === 'active' ? 'Activated shelf' : 'Deactivated shelf', object: `Shelf ${id}`, detail: status === 'active' ? 'Visible to staff' : 'Hidden from staff shelf picker', type: 'shelf', result: status === 'active' ? 'success' : 'warning' })
  })
}

// --------------------------------------------------------------------------
// Staff management
// --------------------------------------------------------------------------
export async function getStaff() {
  await latency()
  guardNetwork()
  const s = db()
  return copy(
    s.users
      .filter((u) => u.role === 'staff')
      .map((u) => {
        const mine = s.items.filter((i) => i.submittedBy === u.id)
        return {
          ...u,
          submitted: mine.length,
          approved: mine.filter((i) => i.approvedAt).length,
          rejected: mine.filter((i) => i.status === 'rejected').length,
          pending: mine.filter((i) => i.status === 'pending').length,
        }
      }),
  )
}

export async function saveStaff({ id, name, username, email }, actorId = 'u_admin') {
  await latency(250, 420)
  const s = db()
  const uname = username.trim().toLowerCase()
  if (!name.trim() || !uname) throw new ApiError('validation', 'Name and username are required.')
  if (s.users.some((u) => u.username === uname && u.id !== id)) throw new ApiError('validation', `Username “${uname}” is already taken.`)
  commit((st) => {
    if (id) {
      Object.assign(st.users.find((u) => u.id === id), { name: name.trim(), username: uname, email: email.trim() })
      log(st, { actor: actorId, action: 'Updated staff', object: name.trim(), detail: 'Profile details changed', type: 'staff', result: 'info' })
    } else {
      st.users.push({ id: `u_${uname.replace(/[^a-z]/g, '')}_${Date.now() % 1000}`, name: name.trim(), username: uname, email: email.trim(), role: 'staff', title: 'Inventory Staff', hue: Math.floor(Math.random() * 360), status: 'active', createdAt: now(), lastActive: null })
      log(st, { actor: actorId, action: 'Added staff', object: name.trim(), detail: 'Invitation sent (simulated)', type: 'staff' })
    }
  })
}

export async function setStaffStatus(id, status, actorId = 'u_admin') {
  await latency(200, 350)
  commit((st) => {
    const u = st.users.find((x) => x.id === id)
    u.status = status
    log(st, { actor: actorId, action: status === 'active' ? 'Activated staff' : 'Deactivated staff', object: u.name, detail: status === 'active' ? 'Access restored' : 'Access removed', type: 'staff', result: status === 'active' ? 'success' : 'warning' })
  })
}

// --------------------------------------------------------------------------
// Reports
// --------------------------------------------------------------------------
export async function getReports({ days = 14, shelf = '', staff = '', status = '' } = {}) {
  await latency(300, 500)
  guardNetwork()
  const s = db()
  const today = startOfDay(now())
  const from = today - (days - 1) * DAY
  const scoped = s.items.filter((i) => (!shelf || i.shelfId === shelf) && (!staff || i.submittedBy === staff) && (!status || i.status === status))
  const inRange = (t) => t && t >= from
  const series = Array.from({ length: days }, (_, k) => {
    const start = from + k * DAY
    const end = start + DAY
    return {
      date: start,
      added: scoped.filter((i) => i.submittedAt >= start && i.submittedAt < end).length,
      approved: scoped.filter((i) => i.approvedAt >= start && i.approvedAt < end).length,
      rejected: scoped.filter((i) => i.rejectedAt >= start && i.rejectedAt < end).length,
    }
  })
  const totals = {
    added: scoped.filter((i) => inRange(i.submittedAt)).length,
    approved: scoped.filter((i) => inRange(i.approvedAt)).length,
    rejected: scoped.filter((i) => inRange(i.rejectedAt)).length,
    autoRejected: scoped.filter((i) => inRange(i.rejectedAt) && i.rejectedBy === 'system').length,
    waiting: scoped.filter((i) => i.status === 'waiting').length,
    outOfStock: scoped.filter((i) => i.status === 'out_of_stock').length,
  }
  const byShelf = s.shelves
    .map((x) => shelfStats(s, x))
    .filter((x) => !shelf || x.id === shelf)
    .sort((a, b) => b.units - a.units)
  const staffRows = s.users
    .filter((u) => u.role === 'staff' && (!staff || u.id === staff))
    .map((u) => {
      const mine = scoped.filter((i) => i.submittedBy === u.id && inRange(i.submittedAt))
      const decided = mine.filter((i) => i.approvedAt || i.status === 'rejected')
      return {
        id: u.id, name: u.name, hue: u.hue, status: u.status,
        submitted: mine.length,
        approved: mine.filter((i) => i.approvedAt).length,
        rejected: mine.filter((i) => i.status === 'rejected').length,
        waiting: mine.filter((i) => i.status === 'waiting').length,
        rate: decided.length ? Math.round((mine.filter((i) => i.approvedAt).length / decided.length) * 100) : null,
      }
    })
    .sort((a, b) => b.submitted - a.submitted)
  const reasons = {}
  for (const i of scoped.filter((x) => x.status === 'rejected' && inRange(x.rejectedAt))) reasons[i.rejectReason] = (reasons[i.rejectReason] || 0) + 1
  const row = (i) => ({ title: i.title, author: i.author, isbn: i.isbn, shelf: i.shelfId, quantity: i.quantity, submittedBy: userName(i.submittedBy), submittedAt: i.submittedAt })
  const lists = {
    added: scoped.filter((i) => inRange(i.submittedAt)).sort((a, b) => b.submittedAt - a.submittedAt).map((i) => ({ ...row(i), status: i.status })),
    approved: scoped.filter((i) => inRange(i.approvedAt)).sort((a, b) => b.approvedAt - a.approvedAt).map((i) => ({ ...row(i), approvedAt: i.approvedAt, productId: i.productId })),
    rejected: scoped.filter((i) => i.status === 'rejected' && inRange(i.rejectedAt)).map((i) => ({ ...row(i), reason: i.rejectReason, by: userName(i.rejectedBy), rejectedAt: i.rejectedAt })),
    waiting: scoped.filter((i) => i.status === 'waiting').map((i) => {
      const p = s.items.find((x) => x.id === i.linkedItemId)
      return { ...row(i), currentShelf: p?.shelfId, currentStock: p?.stock, ready: p?.status === 'out_of_stock' }
    }),
    outOfStock: scoped.filter((i) => i.status === 'out_of_stock').map((i) => ({ ...row(i), stockOutAt: i.stockOutAt, push2: !!i.push2At, waitingEntries: s.items.filter((w) => w.status === 'waiting' && w.linkedItemId === i.id).length })),
  }
  return copy({ series, totals, byShelf, staffRows, lists, reasons: Object.entries(reasons).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count) })
}

// --------------------------------------------------------------------------
// Shopify (mock integration)
// --------------------------------------------------------------------------
export async function retrySync(id) {
  await latency(700, 1000)
  commit((st) => {
    const it = st.items.find((i) => i.id === id)
    Object.assign(it, { syncStatus: 'synced', lastSync: now(), syncError: null })
    log(st, { actor: 'shopify', action: 'Sync retried', object: `“${it.title}”`, detail: `Inventory ${it.stock} · product #${it.productId}`, type: 'shopify', itemId: id })
  })
}

// --------------------------------------------------------------------------
// Demo controls — clearly simulated, never shown as production buttons
// --------------------------------------------------------------------------
function runPoll(st) {
  const t = now()
  st.shopify.lastPollAt = t
  const detected = []
  for (const it of st.items) {
    if (it.status === 'live' && it.stock === 0) {
      Object.assign(it, { status: 'out_of_stock', stockOutAt: t, push1At: t, reminderDueAt: t + DAY, push2At: null, reminderCancelled: false, lastSync: t })
      const waiting = st.items.filter((w) => w.status === 'waiting' && w.linkedItemId === it.id)
      waiting.forEach((w) => (w.waitingReadyAt = t))
      log(st, { actor: 'system', action: 'Stock reached 0', object: `“${it.title}”`, detail: `Shelf ${it.shelfId} · detected by stock check`, type: 'stock', itemId: it.id, result: 'warning' })
      notify(st, { type: 'stock_out', audience: 'all', title: 'Stock out', body: `${it.title} is now out of stock on shelf ${it.shelfId}.`, itemId: it.id })
      log(st, { actor: 'system', action: 'Push #1 sent', object: `“${it.title}”`, detail: `Admin + staff notified (${STAFF_AUDIENCE_COUNT()} people)`, type: 'notification', itemId: it.id, result: 'info' })
      for (const w of waiting) {
        notify(st, { type: 'waiting_ready', audience: 'admin', title: 'Waiting list ready', body: `${it.title} has a waiting-list entry on ${w.shelfId} ready for approval.`, itemId: w.id })
      }
      detected.push({ id: it.id, title: it.title, shelfId: it.shelfId, ready: waiting.map((w) => w.shelfId) })
    }
  }
  return detected
}

export const demo = {
  stockOutCandidates() {
    const s = db()
    return copy(
      s.items
        .filter((i) => i.status === 'live')
        .map((i) => ({ id: i.id, title: i.title, shelfId: i.shelfId, stock: i.stock, waiting: s.items.filter((w) => w.status === 'waiting' && w.linkedItemId === i.id).length }))
        .sort((a, b) => b.waiting - a.waiting || a.title.localeCompare(b.title)),
    )
  },
  outOfStockItems() {
    return copy(db().items.filter((i) => i.status === 'out_of_stock').map((i) => ({ id: i.id, title: i.title, shelfId: i.shelfId })))
  },
  async sellOut(itemId) {
    await latency(500, 700)
    let sold = 0
    commit((st) => {
      const it = st.items.find((i) => i.id === itemId)
      sold = it.stock
      it.stock = 0
      log(st, { actor: 'shopify', action: 'Units sold', object: `“${it.title}”`, detail: `${sold} sold on Shopify (demo) · inventory now 0`, type: 'shopify', itemId, result: 'info' })
    })
    return { sold }
  },
  async runStockPoll() {
    await latency(700, 900)
    let detected = []
    commit((st) => {
      detected = runPoll(st)
      log(st, { actor: 'system', action: 'Stock check', object: 'Shopify inventory', detail: detected.length ? `${detected.length} stock-out detected` : 'No changes', type: 'shopify', result: 'info' })
    })
    return { detected, recipients: STAFF_AUDIENCE_COUNT() }
  },
  async advanceClock(hours = 24) {
    await latency(400, 600)
    const reminders = []
    commit((st) => {
      st.demo.clockOffset += hours * HOUR
      const t = now()
      for (const it of st.items) {
        if (it.status === 'out_of_stock' && it.push1At && !it.push2At && !it.reminderCancelled && it.reminderDueAt <= t) {
          it.push2At = t
          notify(st, { type: 'stock_out_reminder', audience: 'all', title: 'Still out of stock', body: `${it.title} is still out of stock after 24 hours.`, itemId: it.id })
          log(st, { actor: 'system', action: 'Push #2 sent', object: `“${it.title}”`, detail: 'Still out of stock after 24-hour re-check', type: 'notification', itemId: it.id, result: 'info' })
          reminders.push(it.title)
        }
      }
      st.shopify.lastPollAt = t - (t % (st.shopify.pollMinutes * MIN))
    })
    return { reminders }
  },
  async restock(itemId, qty = 3) {
    await latency(400, 600)
    commit((st) => {
      const it = st.items.find((i) => i.id === itemId)
      Object.assign(it, { status: 'live', stock: qty, reminderCancelled: !it.push2At, lastSync: now() })
      st.items.filter((w) => w.status === 'waiting' && w.linkedItemId === it.id).forEach((w) => (w.waitingReadyAt = null))
      log(st, { actor: 'shopify', action: 'Restocked', object: `“${it.title}”`, detail: `${qty} units added in Shopify · 24h reminder cancelled`, type: 'stock', itemId, result: 'success' })
    })
  },
  setNetworkError(on) {
    commit((st) => (st.demo.networkError = on))
  },
  reset() {
    resetStore()
  },
}

