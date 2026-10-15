/**
 * Deterministic seed for the demo. Every entity is related:
 * items (submissions / inventory entries) → shelves, users, Shopify products;
 * waiting-list entries → the live entry they wait behind; notifications and
 * activity are derived from the same events.
 */
import { CATALOG, subjectsFor } from './catalog'
import { matchFlags } from './flags'

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR
export const POLL_MINUTES = 10

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const USERS = [
  { id: 'u_admin', name: 'Rachel Morgan', username: 'rachel.morgan', email: 'rachel@bookhero.store', role: 'admin', title: 'Super Admin', hue: 42 },
  { id: 'u_sarah', name: 'Sarah Wilson', username: 'sarah.wilson', email: 'sarah@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 14 },
  { id: 'u_michael', name: 'Michael Brown', username: 'michael.brown', email: 'michael@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 205 },
  { id: 'u_david', name: 'David Miller', username: 'david.miller', email: 'david@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 150 },
  { id: 'u_emma', name: 'Emma Johnson', username: 'emma.johnson', email: 'emma@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 330 },
  { id: 'u_james', name: 'James Carter', username: 'james.carter', email: 'james@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 260 },
  { id: 'u_lucas', name: 'Lucas Martin', username: 'lucas.martin', email: 'lucas@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 100 },
  { id: 'u_aisha', name: 'Aisha Khan', username: 'aisha.khan', email: 'aisha@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 180 },
]

const SHELF_CODES = [
  ...Array.from({ length: 12 }, (_, i) => `A-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 8 }, (_, i) => `B-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 6 }, (_, i) => `C-${String(i + 1).padStart(2, '0')}`),
]

export const FLAG_CATEGORIES = [
  { id: 'flag_lgbtq', name: 'LGBTQ+ themes', description: 'LGBTQ+ characters, relationships or themes.', keywords: ['lgbt', 'lgbtq', 'gay', 'lesbian', 'queer', 'bisexual', 'transgender'], mode: 'hold', enabled: true, hue: 285 },
  { id: 'flag_mature', name: 'Mature / sexual content', description: 'Explicit sexual content or adult themes.', keywords: ['sexual content', 'erotica', 'explicit'], mode: 'hold', enabled: true, hue: 340 },
  { id: 'flag_selfharm', name: 'Self-harm & suicide', description: 'Depictions or discussion of self-harm or suicide.', keywords: ['suicide', 'self-harm'], mode: 'hold', enabled: true, hue: 15 },
  { id: 'flag_violence', name: 'Graphic violence', description: 'Detailed violence, gore or true crime.', keywords: ['graphic violence', 'gore', 'true crime'], mode: 'label', enabled: true, hue: 25 },
  { id: 'flag_politics', name: 'Politics', description: 'Political fiction or non-fiction.', keywords: ['politics', 'political fiction', 'political science'], mode: 'label', enabled: true, hue: 210 },
  { id: 'flag_substance', name: 'Drugs & alcohol', description: 'Substance use or addiction as a central theme.', keywords: ['drug use', 'addiction', 'alcoholism'], mode: 'label', enabled: true, hue: 160 },
  { id: 'flag_religion', name: 'Religion & spirituality', description: 'Religious or spiritual subject matter.', keywords: ['religion', 'theology', 'spirituality'], mode: 'label', enabled: false, hue: 45 },
]

export function createSeed(now = Date.now()) {
  const rnd = mulberry32(20261003)
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1))
  const lastPoll = now - (now % (POLL_MINUTES * MIN))
  const staffIds = ['u_sarah', 'u_michael', 'u_david', 'u_emma', 'u_james', 'u_lucas']

  const users = USERS.map((u, i) => ({
    ...u,
    status: u.id === 'u_aisha' ? 'inactive' : 'active',
    createdAt: now - (u.id === 'u_lucas' ? 10 : 180 - i * 12) * DAY,
    lastActive: u.id === 'u_aisha' ? now - 19 * DAY : now - int(2, 240) * MIN,
  }))

  const shelves = SHELF_CODES.map((code, i) => ({
    id: code,
    code,
    zone: code[0],
    status: code === 'C-06' ? 'inactive' : 'active',
    note: code === 'C-06' ? 'Water leak — closed for repair' : '',
    createdAt: now - (140 - i * 3) * DAY,
  }))
  const activeShelves = shelves.filter((s) => s.status === 'active').map((s) => s.id)

  const byIsbn = new Map(CATALOG.map((c) => [c.isbn, c]))
  const items = []
  let seq = 1
  let pid = 7421903300
  const newProductId = () => String((pid += int(7, 61)))

  function make(isbn, fields) {
    const c = byIsbn.get(isbn)
    const meta = { title: c.title, author: c.author, publisher: c.publisher, year: c.year, pages: c.pages }
    const item = {
      id: `itm_${String(seq++).padStart(4, '0')}`,
      isbn: c.isbn,
      ...meta,
      source: c.source,
      subjects: subjectsFor(c.isbn),
      fetched: c.source === 'manual' ? null : { ...meta },
      editedFields: [],
      shelfId: 'A-01',
      quantity: 1,
      stock: null,
      status: 'pending',
      submittedBy: 'u_sarah',
      submittedAt: now - HOUR,
      ...fields,
    }
    items.push(item)
    return item
  }

  function live(isbn, shelfId, quantity, stock, agoDays, by, extra = {}) {
    const submittedAt = now - agoDays * DAY - int(30, 400) * MIN
    const approvedAt = submittedAt + int(20, 300) * MIN
    return make(isbn, {
      shelfId,
      quantity,
      stock,
      status: stock > 0 ? 'live' : 'out_of_stock',
      submittedBy: by,
      submittedAt,
      approvedBy: 'u_admin',
      approvedAt,
      productId: newProductId(),
      syncStatus: 'synced',
      lastSync: lastPoll,
      ...extra,
    })
  }

  // ---------- Story: out of stock with READY waiting-list entries ----------
  const atomic = live('9780735211292', 'A-03', 4, 0, 9, 'u_sarah', {
    stockOutAt: now - 38 * MIN, push1At: now - 38 * MIN, reminderDueAt: now - 38 * MIN + DAY,
  })
  make('9780735211292', {
    shelfId: 'B-07', quantity: 3, status: 'waiting', submittedBy: 'u_michael', submittedAt: now - 2 * DAY - 3 * HOUR,
    linkedItemId: atomic.id, waitingReadyAt: now - 38 * MIN,
  })
  const clean = live('9780132350884', 'C-02', 3, 0, 14, 'u_david', {
    stockOutAt: now - 26 * HOUR, push1At: now - 26 * HOUR, reminderDueAt: now - 2 * HOUR, push2At: now - 2 * HOUR,
  })
  make('9780132350884', {
    shelfId: 'A-07', quantity: 2, status: 'waiting', submittedBy: 'u_emma', submittedAt: now - 4 * DAY - 5 * HOUR,
    linkedItemId: clean.id, waitingReadyAt: now - 26 * HOUR,
  })

  // ---------- Out of stock, no waiting entry ----------
  live('9780525559474', 'B-05', 3, 0, 11, 'u_emma', { stockOutAt: now - 3 * HOUR - 12 * MIN, push1At: now - 3 * HOUR - 12 * MIN, reminderDueAt: now - 3 * HOUR - 12 * MIN + DAY })
  live('9780399590504', 'A-10', 2, 0, 16, 'u_james', { stockOutAt: now - 2 * DAY - 4 * HOUR, push1At: now - 2 * DAY - 4 * HOUR, reminderDueAt: now - DAY - 4 * HOUR, push2At: now - DAY - 4 * HOUR })
  live('9780593135204', 'C-03', 4, 0, 12, 'u_michael', { stockOutAt: now - 5 * HOUR - 40 * MIN, push1At: now - 5 * HOUR - 40 * MIN, reminderDueAt: now - 5 * HOUR - 40 * MIN + DAY })

  // ---------- Live with waiting entries (not ready yet) ----------
  const sapiens = live('9780062316097', 'B-02', 5, 4, 8, 'u_david')
  make('9780062316097', { shelfId: 'C-01', quantity: 2, status: 'waiting', submittedBy: 'u_david', submittedAt: now - DAY - 2 * HOUR, linkedItemId: sapiens.id })
  const money = live('9780857197689', 'A-05', 4, 2, 13, 'u_lucas')
  make('9780857197689', { shelfId: 'B-06', quantity: 5, status: 'waiting', submittedBy: 'u_sarah', submittedAt: now - 6 * HOUR - 8 * MIN, linkedItemId: money.id })
  const deep = live('9781455586691', 'A-09', 3, 1, 7, 'u_emma')
  make('9781455586691', { shelfId: 'B-01', quantity: 3, status: 'waiting', submittedBy: 'u_sarah', submittedAt: now - 3 * HOUR - 21 * MIN, linkedItemId: deep.id })
  const tfs = live('9780374533557', 'C-03', 3, 3, 10, 'u_james')
  make('9780374533557', { shelfId: 'A-11', quantity: 2, status: 'waiting', submittedBy: 'u_michael', submittedAt: now - 2 * DAY - 7 * HOUR, linkedItemId: tfs.id })

  // ---------- Live anchors used by demo scenarios ----------
  live('9780062315007', 'B-03', 6, 5, 6, 'u_emma')
  // Dune: shelf already switched once (C-01 closed → A-02 live, same Shopify product)
  const duneOld = live('9780441172719', 'C-01', 2, 0, 24, 'u_david')
  Object.assign(duneOld, { status: 'closed', closedAt: now - 8 * DAY, closedReason: 'Sold out — active shelf switched to A-02', stockOutAt: now - 8 * DAY - 9 * HOUR, push1At: now - 8 * DAY - 9 * HOUR })
  make('9780441172719', {
    shelfId: 'A-02', quantity: 4, stock: 3, status: 'live', submittedBy: 'u_michael', submittedAt: now - 10 * DAY,
    approvedBy: 'u_admin', approvedAt: now - 8 * DAY, productId: duneOld.productId, syncStatus: 'synced', lastSync: lastPoll,
    previousShelfId: 'C-01', linkedItemId: duneOld.id,
  })
  live('9780756404741', 'B-08', 3, 2, 5, 'u_lucas', {
    syncStatus: 'failed', lastSync: now - 3 * HOUR - 4 * MIN, syncError: 'Shopify API returned 429 (rate limited). Automatic retry exhausted.',
  })

  // ---------- Approved today (fresh) ----------
  live('9780735214484', 'A-04', 2, 2, 0, 'u_sarah')
  live('9780307352156', 'B-04', 3, 3, 0, 'u_michael')
  live('9780316017930', 'C-05', 2, 2, 0, 'u_emma')

  // ---------- Pending review ----------
  const pending = [
    ['9780135957059', 'A-04', 4, 'u_sarah', 12 * MIN],
    ['9780143130727', 'A-06', 6, 'u_michael', 26 * MIN],
    ['9780807014295', 'B-05', 2, 'u_emma', 64 * MIN],
    ['9780547928227', 'A-01', 3, 'u_david', 2 * HOUR + 5 * MIN],
    ['9780593318171', 'C-04', 1, 'u_sarah', 3 * HOUR + 2 * MIN],
    ['9781449373320', 'A-08', 2, 'u_james', 5 * HOUR + 15 * MIN],
    ['9781501135910', 'B-08', 4, 'u_emma', DAY + 2 * HOUR],
    ['9781250301697', 'A-10', 3, 'u_lucas', DAY + 4 * HOUR],
    ['9780316556347', 'C-05', 2, 'u_michael', DAY + 6 * HOUR],
    ['9780375704024', 'B-04', 1, 'u_david', 2 * DAY + 3 * HOUR],
    ['9780312426781', 'A-11', 2, 'u_emma', 48 * MIN],
  ]
  for (const [isbn, shelfId, quantity, by, ago] of pending) {
    const it = make(isbn, { shelfId, quantity, status: 'pending', submittedBy: by, submittedAt: now - ago })
    if (isbn === '9780547928227') {
      it.fetched = { ...it.fetched, title: 'The Hobbit, or There and Back Again' }
      it.editedFields = ['title']
    }
    if (isbn === '9781449373320') it.missingFields = ['publisher', 'pages']
  }

  // ---------- Rejected ----------
  const sap = byIsbn.get('9780062316097')
  make('9780062316097', {
    shelfId: 'B-02', quantity: 2, status: 'rejected', submittedBy: 'u_david', submittedAt: now - DAY - 5 * HOUR,
    rejectedBy: 'system', rejectedAt: now - DAY - 5 * HOUR, rejectReason: 'Duplicate — same shelf',
    match: { itemId: sapiens.id, title: sap.title, author: sap.author, isbn: sap.isbn, shelfId: 'B-02', quantity: 4, status: 'live' },
  })
  make('9780062315007', {
    isbn: '9780061122415', title: 'The Alchemist: A Fable About Following Your Dream', publisher: 'HarperOne', year: 2006, pages: 197, source: 'openlibrary',
    shelfId: 'B-03', quantity: 1, status: 'rejected', submittedBy: 'u_emma', submittedAt: now - 2 * DAY - HOUR,
    rejectedBy: 'system', rejectedAt: now - 2 * DAY - HOUR, rejectReason: 'Duplicate — same shelf',
    match: { title: 'The Alchemist', author: 'Paulo Coelho', isbn: '9780062315007', shelfId: 'B-03', quantity: 5, status: 'live' },
  })
  make('9781612680194', {
    shelfId: 'A-12', quantity: 2, status: 'rejected', submittedBy: 'u_james', submittedAt: now - 3 * DAY - 2 * HOUR,
    rejectedBy: 'u_admin', rejectedAt: now - 3 * DAY, rejectReason: 'Damaged book', rejectNote: 'Water damage on the cover and first 20 pages.',
  })
  make('9781878424310', {
    shelfId: 'C-05', quantity: 1, status: 'rejected', submittedBy: 'u_lucas', submittedAt: now - 4 * DAY - 6 * HOUR,
    rejectedBy: 'u_admin', rejectedAt: now - 4 * DAY - 2 * HOUR, rejectReason: 'Incorrect metadata', rejectNote: 'Fetched record was the companion workbook, not the book.',
  })
  make('9780735211292', {
    shelfId: 'A-03', quantity: 2, status: 'rejected', submittedBy: 'u_david', submittedAt: now - 5 * DAY - 3 * HOUR,
    rejectedBy: 'system', rejectedAt: now - 5 * DAY - 3 * HOUR, rejectReason: 'Duplicate — same shelf',
    match: { itemId: atomic.id, title: 'Atomic Habits', author: 'James Clear', isbn: '9780735211292', shelfId: 'A-03', quantity: 2, status: 'live' },
  })
  make('9781451648539', {
    shelfId: 'C-06', quantity: 1, status: 'rejected', submittedBy: 'u_michael', submittedAt: now - 6 * DAY - 4 * HOUR,
    rejectedBy: 'u_admin', rejectedAt: now - 6 * DAY, rejectReason: 'Invalid shelf', rejectNote: 'Shelf C-06 is closed for repair.',
  })

  // ---------- Remaining catalogue → live inventory ----------
  const used = new Set(items.map((i) => i.isbn))
  for (const c of CATALOG) {
    if (used.has(c.isbn)) continue
    const qty = int(1, 8)
    live(c.isbn, pick(activeShelves), qty, Math.max(1, qty - int(0, 3)), int(1, 21), pick(staffIds))
  }

  // Flags on live books were reviewed by the admin before approval.
  for (const it of items) {
    if ((it.status === 'live' || it.status === 'out_of_stock') && matchFlags(it, FLAG_CATEGORIES).some((f) => f.mode === 'hold')) {
      it.flagReviewedAt = it.approvedAt - 5 * MIN
      it.flagReviewedBy = 'u_admin'
      it.flagNote = 'Checked — fine to list.'
    }
  }

  const notifications = []
  const activity = []
  let nseq = 1
  let aseq = 1
  const notify = (n) => notifications.push({ id: `ntf_${String(nseq++).padStart(4, '0')}`, readBy: [], push: true, ...n })
  const log = (a) => activity.push({ id: `act_${String(aseq++).padStart(4, '0')}`, result: 'success', ...a })

  const byId = new Map(items.map((i) => [i.id, i]))

  // Activity derived from item history
  for (const it of items) {
    const q = `“${it.title}”`
    log({ at: it.submittedAt, actor: it.submittedBy, action: 'Submitted', object: q, detail: `Shelf ${it.shelfId} · qty ${it.quantity}`, type: 'submission', itemId: it.id, result: 'info' })
    if (it.status === 'rejected') {
      log({
        at: it.rejectedAt, actor: it.rejectedBy, action: it.rejectedBy === 'system' ? 'Auto-rejected' : 'Rejected', object: q,
        detail: it.rejectedBy === 'system' ? `Already on shelf ${it.shelfId} (title + author match)` : it.rejectReason, type: 'rejection', itemId: it.id, result: 'error',
      })
    }
    if (it.status === 'waiting') {
      const p = byId.get(it.linkedItemId)
      log({ at: it.submittedAt + 1000, actor: 'system', action: 'Waiting list created', object: q, detail: `${p.shelfId} active · waiting on ${it.shelfId}`, type: 'waiting', itemId: it.id, result: 'warning' })
    }
    if (it.approvedAt) {
      log({ at: it.approvedAt, actor: 'u_admin', action: 'Approved', object: q, detail: `Live on ${it.shelfId} · Shopify #${it.productId}`, type: 'approval', itemId: it.id })
    }
    if (it.stockOutAt) {
      log({ at: it.stockOutAt, actor: 'system', action: 'Stock reached 0', object: q, detail: `Shelf ${it.shelfId} · detected by stock check`, type: 'stock', itemId: it.id, result: 'warning' })
      log({ at: it.stockOutAt + 2000, actor: 'system', action: 'Push #1 sent', object: q, detail: 'Admin + 6 staff notified', type: 'notification', itemId: it.id, result: 'info' })
    }
    if (it.push2At) log({ at: it.push2At, actor: 'system', action: 'Push #2 sent', object: q, detail: 'Still out of stock after 24 hours', type: 'notification', itemId: it.id, result: 'info' })
    const flags = matchFlags(it, FLAG_CATEGORIES)
    if (flags.length && it.status !== 'rejected') {
      log({ at: it.submittedAt + 1500, actor: 'system', action: 'Flagged', object: q, detail: flags.map((f) => f.name).join(', '), type: 'flag', itemId: it.id, result: flags.some((f) => f.mode === 'hold') ? 'warning' : 'info' })
    }
    if (it.flagReviewedAt) log({ at: it.flagReviewedAt, actor: 'u_admin', action: 'Flag reviewed', object: q, detail: it.flagNote, type: 'flag', itemId: it.id, result: 'success' })
    if (it.syncStatus === 'failed') log({ at: it.lastSync, actor: 'shopify', action: 'Sync failed', object: q, detail: '429 rate limited', type: 'shopify', itemId: it.id, result: 'error' })
  }
  const duneNew = items.find((i) => i.isbn === '9780441172719' && i.status === 'live')
  log({ at: duneNew.approvedAt + 3000, actor: 'u_admin', action: 'Active shelf switched', object: '“Dune”', detail: 'C-01 → A-02 · +4 units on the same Shopify product', type: 'shelf', itemId: duneNew.id })
  log({ at: now - 2 * DAY - 2 * HOUR, actor: 'u_admin', action: 'Updated shelf', object: '“Shoe Dog”', detail: 'B-02 → B-08 during review', type: 'edit', result: 'info' })
  log({ at: now - 5 * DAY, actor: 'u_admin', action: 'Deactivated shelf', object: 'Shelf C-06', detail: 'Water leak — closed for repair', type: 'shelf', result: 'warning' })
  log({ at: now - 10 * DAY, actor: 'u_admin', action: 'Added staff', object: 'Lucas Martin', detail: 'Inventory Staff', type: 'staff', result: 'success' })
  log({ at: now - 19 * DAY, actor: 'u_admin', action: 'Deactivated staff', object: 'Aisha Khan', detail: 'Access removed', type: 'staff', result: 'warning' })
  activity.sort((a, b) => b.at - a.at)

  // Notifications
  const readAll = (n) => ({ ...n, readBy: ['u_admin', ...staffIds] })
  notify({ type: 'stock_out', at: now - 38 * MIN, audience: 'all', title: 'Stock out', body: 'Atomic Habits is now out of stock on shelf A-03.', itemId: atomic.id })
  notify({ type: 'waiting_ready', at: now - 38 * MIN + 1500, audience: 'admin', title: 'Waiting list ready', body: 'Atomic Habits has a waiting-list entry on B-07 ready for approval.', itemId: atomic.id })
  const cmbyn = items.find((i) => i.isbn === '9780312426781')
  notify({ type: 'flagged', at: now - 48 * MIN + 2000, audience: 'admin', title: 'Flagged for review', body: '“Call Me by Your Name” matches LGBTQ+ themes, Mature / sexual content.', itemId: cmbyn.id, push: false })
  notify({ type: 'new_submission', at: now - 12 * MIN, audience: 'admin', title: 'New submission', body: 'Sarah submitted “The Pragmatic Programmer” for review.', push: false })
  notify({ type: 'new_submission', at: now - 26 * MIN, audience: 'admin', title: 'New submissions', body: 'Michael submitted 2 books for review today.', push: false })
  notify({ type: 'stock_out_reminder', at: now - 2 * HOUR, audience: 'all', title: 'Still out of stock', body: 'Clean Code is still out of stock after 24 hours. The waiting-list entry on A-07 is ready.', itemId: clean.id })
  notifications.push(readAll({ id: `ntf_${String(nseq++).padStart(4, '0')}`, type: 'sync_failed', at: now - 3 * HOUR - 4 * MIN, audience: 'admin', title: 'Shopify sync failed', body: '“The Name of the Wind” could not be synced (429 rate limited).', push: false, readBy: [] }))
  notify({ type: 'stock_out', at: now - 3 * HOUR - 12 * MIN, audience: 'all', title: 'Stock out', body: 'The Midnight Library is now out of stock on shelf B-05.' })
  notifications.push(readAll({ id: `ntf_${String(nseq++).padStart(4, '0')}`, type: 'stock_out', at: now - 5 * HOUR - 40 * MIN, audience: 'all', title: 'Stock out', body: 'Project Hail Mary is now out of stock on shelf C-03.', push: true }))
  notifications.push(readAll({ id: `ntf_${String(nseq++).padStart(4, '0')}`, type: 'waiting_created', at: now - 3 * HOUR - 21 * MIN, audience: 'u_sarah', title: 'Added to waiting list', body: 'Deep Work already exists on A-09. Your entry on B-01 is on the waiting list.', push: false }))
  notify({ type: 'approved', at: now - 2 * HOUR - 30 * MIN, audience: 'u_sarah', title: 'Approved', body: '“Range” is now live on Shopify (shelf A-04).' })
  notifications.push(readAll({ id: `ntf_${String(nseq++).padStart(4, '0')}`, type: 'stock_out', at: now - 26 * HOUR, audience: 'all', title: 'Stock out', body: 'Clean Code is now out of stock on shelf C-02.', push: true }))
  notifications.push(readAll({ id: `ntf_${String(nseq++).padStart(4, '0')}`, type: 'waiting_ready', at: now - 26 * HOUR + 1500, audience: 'admin', title: 'Waiting list ready', body: 'Clean Code has a waiting-list entry on A-07 ready for approval.', push: true }))
  notifications.push(readAll({ id: `ntf_${String(nseq++).padStart(4, '0')}`, type: 'rejected', at: now - DAY - 5 * HOUR, audience: 'u_david', title: 'Rejected — duplicate', body: '“Sapiens” is already registered on shelf B-02.', push: false }))
  notifications.push(readAll({ id: `ntf_${String(nseq++).padStart(4, '0')}`, type: 'stock_out_reminder', at: now - DAY - 4 * HOUR, audience: 'all', title: 'Still out of stock', body: 'Educated is still out of stock after 24 hours.', push: true }))
  notifications.push(readAll({ id: `ntf_${String(nseq++).padStart(4, '0')}`, type: 'rejected', at: now - 2 * DAY - HOUR, audience: 'u_emma', title: 'Rejected — duplicate', body: '“The Alchemist” is already registered on shelf B-03.', push: false }))
  notifications.push(readAll({ id: `ntf_${String(nseq++).padStart(4, '0')}`, type: 'stock_out', at: now - 2 * DAY - 4 * HOUR, audience: 'all', title: 'Stock out', body: 'Educated is now out of stock on shelf A-10.', push: true }))
  notifications.push(readAll({ id: `ntf_${String(nseq++).padStart(4, '0')}`, type: 'new_submission', at: now - DAY - 2 * HOUR, audience: 'admin', title: 'New submissions', body: 'Emma submitted 3 books for review.', push: false }))
  notifications.push(readAll({ id: `ntf_${String(nseq++).padStart(4, '0')}`, type: 'waiting_approved', at: now - 8 * DAY, audience: 'all', title: 'Back in stock', body: 'Dune is live again on A-02 — 4 units added to the same Shopify product.', push: true }))
  notifications.push(readAll({ id: `ntf_${String(nseq++).padStart(4, '0')}`, type: 'stock_out', at: now - 8 * DAY - 9 * HOUR, audience: 'all', title: 'Stock out', body: 'Dune is now out of stock on shelf C-01.', push: true }))
  notifications.sort((a, b) => b.at - a.at)

  return {
    version: 2,
    seededAt: now,
    users,
    shelves,
    items,
    notifications,
    activity,
    flagCategories: FLAG_CATEGORIES.map((c) => ({ ...c, keywords: [...c.keywords], createdAt: now - 30 * DAY })),
    shopify: {
      storeName: 'BookHero Demo Store',
      domain: 'bookhero-demo.myshopify.com',
      location: 'BookHero Warehouse',
      pollMinutes: POLL_MINUTES,
      lastPollAt: lastPoll,
      health: 'healthy',
    },
    demo: { clockOffset: 0, networkError: false },
    seq: { item: seq, product: pid, notification: nseq, activity: aseq },
  }
}

export { firstNameOf }
function firstNameOf(users, id) {
  if (id === 'system') return 'System'
  if (id === 'shopify') return 'Shopify'
  return users.find((u) => u.id === id)?.name.split(' ')[0] ?? 'Someone'
}
