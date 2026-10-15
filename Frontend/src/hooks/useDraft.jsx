import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/**
 * Staff submission draft — carries one book through
 * scan → metadata → shelf & quantity → review. Survives a page refresh.
 */
const DraftContext = createContext(null)
const KEY = 'bookhero.draft'
const LAST_SHELF = 'bookhero.lastShelf'

const read = () => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) || null
  } catch {
    return null
  }
}

export function DraftProvider({ children }) {
  const [draft, setDraftState] = useState(read)

  const setDraft = useCallback((updater) => {
    setDraftState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try {
        if (next) sessionStorage.setItem(KEY, JSON.stringify(next))
        else sessionStorage.removeItem(KEY)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const clearDraft = useCallback(() => setDraft(null), [setDraft])

  const value = useMemo(() => ({ draft, setDraft, clearDraft }), [draft, setDraft, clearDraft])
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
}

export function useDraft() {
  return useContext(DraftContext)
}

export function getLastShelf() {
  try {
    return localStorage.getItem(LAST_SHELF)
  } catch {
    return null
  }
}

export function setLastShelf(id) {
  try {
    localStorage.setItem(LAST_SHELF, id)
  } catch {
    /* ignore */
  }
}
