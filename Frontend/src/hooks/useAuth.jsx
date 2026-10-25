import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { hueOf } from '../services/adminApi'
import { setAuthLostHandler } from '../services/apiClient'
import { fetchMe, loginWithPassword, saveProfile, verifyOtp } from '../services/authApi'
import { clearAuth, readAuth, touchAuth, updateAuth, writeAuth } from '../services/authStorage'

const AuthContext = createContext(null)
const TITLES = { admin: 'Super Admin', staff: 'Inventory Staff' }

/** The backend user ({id, email, full_name, role, ...}) as the screens use it. The avatar colour follows the email, so it never changes. */
function toSessionUser(apiUser) {
  return {
    id: apiUser.id,
    backendId: apiUser.id,
    role: apiUser.role,
    title: TITLES[apiUser.role] ?? 'Staff',
    hue: hueOf(apiUser.email),
    email: apiUser.email,
    name: apiUser.full_name || apiUser.email.split('@')[0],
    phone: apiUser.phone_number || '',
    joinedAt: apiUser.date_joined,
    lastLoginAt: apiUser.last_login,
  }
}

function readSession() {
  const auth = readAuth()
  return auth?.user ? toSessionUser(auth.user) : null
}

// Old demo-only browser data (from before the backend was connected): remove once.
try {
  localStorage.removeItem('bookhero.session')
  sessionStorage.removeItem('bookhero.session')
  localStorage.removeItem('bookhero.demo.v4')
} catch {
  /* storage unavailable */
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession)

  // Store a successful backend login ({ access, refresh, user }) as the session.
  const startSession = useCallback(({ access, refresh, user: apiUser }, remember) => {
    writeAuth({ access, refresh, user: apiUser }, remember)
    const sessionUser = toSessionUser(apiUser)
    setUser(sessionUser)
    return sessionUser
  }, [])

  // Sign in with email + password against the Django backend.
  // A Super Admin is not signed in yet: a code was emailed, so we return { otpRequired, challenge, ... }.
  const signInWithPassword = useCallback(
    async ({ email, password, remember = true }) => {
      const data = await loginWithPassword({ email, password, remember })
      if (data.otp_required) {
        return { otpRequired: true, challenge: data.challenge, emailHint: data.email_hint, expiresIn: data.expires_in }
      }
      return startSession(data, remember)
    },
    [startSession],
  )

  // Second step for a Super Admin: the 4-digit code from the email.
  const signInWithOtp = useCallback(
    async ({ challenge, otp, remember = true }) => startSession(await verifyOtp({ challenge, otp, remember }), remember),
    [startSession],
  )

  // The signed-in user edits their own name / phone (the email cannot be changed).
  const updateProfile = useCallback(async ({ fullName, phoneNumber }) => {
    const apiUser = await saveProfile({ fullName, phoneNumber })
    updateAuth({ user: apiUser })
    setUser(toSessionUser(apiUser))
    return apiUser
  }, [])

  const signOut = useCallback(() => {
    clearAuth()
    setUser(null)
  }, [])

  // The API client tells us when the refresh token no longer works.
  useEffect(() => {
    setAuthLostHandler(() => setUser(null))
    return () => setAuthLostHandler(null)
  }, [])

  // A sign-in without "Remember me" ends after a while with the app closed: note that it is still open.
  useEffect(() => {
    touchAuth()
    const timer = setInterval(touchAuth, 60 * 1000)
    window.addEventListener('pagehide', touchAuth)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', touchAuth)
    }
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

  const value = useMemo(() => ({ user, signInWithPassword, signInWithOtp, updateProfile, signOut }), [user, signInWithPassword, signInWithOtp, updateProfile, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
