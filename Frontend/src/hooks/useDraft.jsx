import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getCachedShelves, loadShelves } from '../services/staffApi'

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

const DETAIL_FIELDS = ['title', 'author', 'publisher', 'year', 'pages']

/**
 * Whether a found book was changed by staff (the "Edited" tag): any detail differs from what was fetched
 * (filling in a missing one counts), the ISBN was corrected, or a cover photo was added.
 * Manual entries are never "Edited". Takes a draft-shaped object: { manual, meta, values, photo, isbn, originalIsbn }.
 */
export function isDraftEdited({ manual, meta, values, photo, isbn, originalIsbn }) {
  if (manual || !meta || !values) return false
  const detailsChanged = DETAIL_FIELDS.some((k) => String(meta[k] ?? '') !== String(values[k] ?? ''))
  return detailsChanged || Boolean(photo) || Boolean(originalIsbn && originalIsbn !== isbn)
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

/**
 * The last used shelf, but only while it is an active shelf in the database
 * (a code saved in this browser earlier, e.g. from the prototype, is not shown).
 */
export function useActiveLastShelf() {
  const last = getLastShelf()
  const [shelves, setShelves] = useState(getCachedShelves)
  useEffect(() => {
    if (!last || getCachedShelves()) return undefined // already loaded (the shelf step keeps the copy fresh)
    let alive = true
    loadShelves()
      .then((list) => alive && setShelves(list))
      .catch(() => {}) // keep what we have; the shelf tag is only a hint
    return () => {
      alive = false
    }
  }, [last])
  return last && shelves?.some((s) => s.id === last) ? last : null
}

export function setLastShelf(id) {
  try {
    localStorage.setItem(LAST_SHELF, id)
  } catch {
    /* ignore */
  }
}
