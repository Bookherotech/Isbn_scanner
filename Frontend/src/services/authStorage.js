/**
 * Where the backend session (JWT tokens + the signed-in user) is kept.
 * "Remember me" -> localStorage (survives closing the browser), otherwise sessionStorage.
 */
const KEY = 'bookhero.auth'

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
      if (raw) return JSON.parse(raw)
    } catch {
      /* ignore a corrupt or blocked entry */
    }
  }
  return null
}

export function writeAuth(data, remember = true) {
  clearAuth()
  try {
    ;(remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(data))
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

export function clearAuth() {
  for (const store of stores()) {
    try {
      store.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }
}
