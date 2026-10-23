import { HttpError, request } from './apiClient'
import { bump } from './store'

/**
 * Notifications for the signed-in user — Admin and Staff share these (Django `book_admin`, /api/notifications/).
 * Each person sees what is for everyone, for their role, or for them. Timestamps are milliseconds.
 */

const map = (n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, push: n.push, at: Date.parse(n.created_at), itemId: n.item_id, read: n.read })

async function call(path, options) {
  try {
    return await request(path, options)
  } catch (error) {
    if (error instanceof HttpError && error.status === 0) throw Object.assign(new HttpError(0, 'Cannot reach the server. Check your connection and try again.'), { code: 'network' })
    throw error
  }
}

/** `filter`: all | unread | stock | waiting | submissions | flags. -> [{ id, type, title, body, push, at, itemId, read }] */
export async function getNotifications(_user, { filter = 'all' } = {}) {
  return (await call(`/api/notifications/?filter=${encodeURIComponent(filter)}`)).results.map(map)
}

export async function getUnreadCount() {
  return (await call('/api/notifications/unread-count/')).unread
}

/** Push notifications newer than `since` (ms): the in-app toasts. */
export async function getPushSince(since) {
  const res = await call(`/api/notifications/?push=true&since=${encodeURIComponent(new Date(since).toISOString())}`)
  return res.results.map(map)
}

export async function markNotificationRead(_user, id) {
  await call(`/api/notifications/${id}/read/`, { method: 'POST' })
  bump()
}

export async function markAllNotificationsRead() {
  await call('/api/notifications/read-all/', { method: 'POST' })
  bump()
}
