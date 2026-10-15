import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { login as apiLogin } from '../services/mockApi'
import { db } from '../services/store'

const AuthContext = createContext(null)
const KEY = 'bookhero.session'

function readSession() {
  try {
    const id = localStorage.getItem(KEY) || sessionStorage.getItem(KEY)
    return id ? db().users.find((u) => u.id === id) ?? null : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession)

  const signIn = useCallback(async ({ role, username, remember = true }) => {
    const u = await apiLogin({ role, username })
    try {
      ;(remember ? localStorage : sessionStorage).setItem(KEY, u.id)
    } catch {
      /* ignore */
    }
    setUser(u)
    return u
  }, [])

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(KEY)
      sessionStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
