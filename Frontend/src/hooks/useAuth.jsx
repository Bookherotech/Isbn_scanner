import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { login as apiLogin } from '../services/mockApi'
import { db } from '../services/store'
import { setAuthLostHandler } from '../services/apiClient'
import { fetchMe, loginWithPassword, saveProfile, verifyOtp } from '../services/authApi'
import { clearAuth, readAuth, updateAuth, writeAuth } from '../services/authStorage'

const AuthContext = createContext(null)
const KEY = 'bookhero.session' // demo (mock) session: just a mock user id

/**
 * The screens still read their data from the mock API, so a backend user is mapped onto the
 * mock user that owns that data (matched by email, else the default admin / staff member),
 * with the real name, email and role from the backend laid over it.
 */
function toSessionUser(apiUser) {
  const users = db().users
  const base = users.find((u) => u.email === apiUser.email) ?? users.find((u) => u.id === (apiUser.role === 'admin' ? 'u_admin' : 'u_sarah'))
  return { ...base, role: apiUser.role, email: apiUser.email, name: apiUser.full_name || apiUser.email.split('@')[0], phone: apiUser.phone_number || '', backendId: apiUser.id, source: 'api' }
}

function readSession() {
  const auth = readAuth()
  if (auth?.user) return toSessionUser(auth.user)
  try {
    const id = localStorage.getItem(KEY) || sessionStorage.getItem(KEY)
    return id ? db().users.find((u) => u.id === id) ?? null : null
  } catch {
    return null
  }
}

function clearDemoSession() {
  try {
    localStorage.removeItem(KEY)
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession)

  // Store a successful backend login ({ access, refresh, user }) as the session.
  const startSession = useCallback(({ access, refresh, user: apiUser }, remember) => {
    clearDemoSession()
    writeAuth({ access, refresh, user: apiUser }, remember)
    const sessionUser = toSessionUser(apiUser)
    setUser(sessionUser)
    return sessionUser
  }, [])

  // Sign in with email + password against the Django backend.
  // A Super Admin is not signed in yet: a code was emailed, so we return { otpRequired, challenge, ... }.
  const signInWithPassword = useCallback(
    async ({ email, password, remember = true }) => {
      const data = await loginWithPassword({ email, password })
      if (data.otp_required) {
        return { otpRequired: true, challenge: data.challenge, emailHint: data.email_hint, expiresIn: data.expires_in }
      }
      return startSession(data, remember)
    },
    [startSession],
  )

  // Second step for a Super Admin: the 4-digit code from the email.
  const signInWithOtp = useCallback(
    async ({ challenge, otp, remember = true }) => startSession(await verifyOtp({ challenge, otp }), remember),
    [startSession],
  )

  // The signed-in user edits their own name / phone (the email cannot be changed).
  const updateProfile = useCallback(async ({ fullName, phoneNumber }) => {
    const apiUser = await saveProfile({ fullName, phoneNumber })
    updateAuth({ user: apiUser })
    setUser(toSessionUser(apiUser))
    return apiUser
  }, [])

  // Demo access (no password): a mock user, used by the "Continue as ..." buttons and the demo switcher.
  const signIn = useCallback(async ({ role, username, remember = true }) => {
    const u = await apiLogin({ role, username })
    clearAuth()
    try {
      ;(remember ? localStorage : sessionStorage).setItem(KEY, u.id)
    } catch {
      /* ignore */
    }
    setUser(u)
    return u
  }, [])

  const signOut = useCallback(() => {
    clearAuth()
    clearDemoSession()
    setUser(null)
  }, [])

  // The API client tells us when the refresh token no longer works.
  useEffect(() => {
    setAuthLostHandler(() => setUser(null))
    return () => setAuthLostHandler(null)
  }, [])

  // After a reload, re-check a backend session: pick up role changes, drop deactivated accounts.
  useEffect(() => {
    if (!readAuth()?.access) return undefined
    let cancelled = false
    fetchMe()
      .then((apiUser) => {
        if (cancelled) return
        updateAuth({ user: apiUser })
        setUser(toSessionUser(apiUser))
      })
      .catch((error) => {
        if (cancelled || error.status !== 401) return // offline or server down: keep the saved session
        clearAuth()
        setUser(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(() => ({ user, signIn, signInWithPassword, signInWithOtp, updateProfile, signOut }), [user, signIn, signInWithPassword, signInWithOtp, updateProfile, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
