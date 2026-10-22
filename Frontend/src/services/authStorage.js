/**
 * Where the backend session (JWT tokens + the signed-in user) is kept.
 * "Remember me" -> localStorage (survives closing the browser), otherwise sessionStorage.
 * A session without "Remember me" also ends after IDLE_LIMIT_MS with the app closed: browsers that
 * reopen the last tabs bring sessionStorage back, so closing the browser alone is not enough.
 */
const KEY = 'bookhero.auth'
const IDLE_LIMIT_MS = 30 * 60 * 1000

function stores() {
  try {
    return [localStorage, sessionStorage]
  } catch {
    return []
  }
}

export function readAuth() {
  for (const store of stores()) {
    try {
      const raw = store.getItem(KEY)
      if (!raw) continue
      const auth = JSON.parse(raw)
      if (auth.remember === false && Date.now() - (auth.seenAt || 0) > IDLE_LIMIT_MS) {
        store.removeItem(KEY) // not remembered and the app was closed for a while: signed out
        return null
      }
      return auth
    } catch {
      /* ignore a corrupt or blocked entry */
    }
  }
  return null
}

export function writeAuth(data, remember = true) {
  clearAuth()
  try {
    ;(remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify({ ...data, remember, seenAt: Date.now() }))
  } catch {
    /* storage blocked: the session just won't survive a reload */
  }
}

/** Merge new values into the stored session, keeping it in the same storage it was saved in. */
export function updateAuth(patch) {
  for (const store of stores()) {
    try {
      const raw = store.getItem(KEY)
      if (raw) {
        store.setItem(KEY, JSON.stringify({ ...JSON.parse(raw), ...patch }))
        return
      }
    } catch {
      /* ignore */
    }
  }
}

/** Mark a session without "Remember me" as still in use (called while the app is open). */
export function touchAuth() {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return
    const auth = JSON.parse(raw)
    if (auth.remember === false) sessionStorage.setItem(KEY, JSON.stringify({ ...auth, seenAt: Date.now() }))
  } catch {
    /* ignore */
  }
}

export function clearAuth() {
  for (const store of stores()) {
    try {
      store.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }
}
