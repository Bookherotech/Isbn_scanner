/**
 * Demo sign-in only ("Continue as ..." with no password). Everything else is real:
 * see adminApi.js, notificationApi.js (admin + staff), staffApi.js and authApi.js.
 */
import { db, commit, now } from './store'

export class ApiError extends Error {
  constructor(code, message, details) {
    super(message)
    this.code = code
    this.details = details
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const copy = (v) => structuredClone(v)

export async function login({ role, username }) {
  await sleep(250 + Math.random() * 200)
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
