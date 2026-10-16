import { clearAuth, readAuth, updateAuth } from './authStorage'

/** Base URL of the Django backend, from Frontend/.env (VITE_API_BASE_URL). */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export class HttpError extends Error {
  constructor(status, message, data) {
    super(message)
    this.status = status // 0 = the server could not be reached
    this.data = data
  }
}

let onAuthLost = null
/** The auth provider registers here to be told when the session can no longer be refreshed. */
export function setAuthLostHandler(handler) {
  onAuthLost = handler
}

async function send(path, { method, body, token }) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new HttpError(0, 'Cannot reach the server.')
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    /* empty or non-JSON body */
  }
  if (!response.ok) throw new HttpError(response.status, data?.detail || 'Request failed.', data)
  return data
}

// One refresh at a time, even when several requests get a 401 together.
let refreshing = null

function refreshTokens() {
  if (!refreshing) {
    refreshing = (async () => {
      const refresh = readAuth()?.refresh
      if (!refresh) throw new HttpError(401, 'Signed out.')
      const tokens = await send('/api/auth/token/refresh/', { method: 'POST', body: { refresh } })
      updateAuth({ access: tokens.access, ...(tokens.refresh ? { refresh: tokens.refresh } : {}) })
      return tokens.access
    })()
      .catch((error) => {
        if (error.status === 401 || error.status === 400) {
          clearAuth()
          onAuthLost?.()
        }
        throw error
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

/**
 * JSON request to the backend. With `auth` (default) it sends the access token and, on a 401,
 * refreshes the token once and retries; if that fails the session is cleared.
 */
export async function request(path, { method = 'GET', body, auth = true } = {}) {
  if (!auth) return send(path, { method, body })
  try {
    return await send(path, { method, body, token: readAuth()?.access })
  } catch (error) {
    if (error.status !== 401) throw error
    const access = await refreshTokens()
    return send(path, { method, body, token: access })
  }
}
