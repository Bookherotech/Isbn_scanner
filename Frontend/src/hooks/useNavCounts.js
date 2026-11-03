import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { getNavCounts } from '../services/adminApi'
import { useAutoRefresh, useQuery } from './useStore'

const NONE = { pending: 0, waiting: 0, ready: 0, oos: 0, flagged: 0 }

/**
 * Sidebar / tab-bar badge counts from the backend. Refetches after any admin change, on every page change, when the
 * tab comes back into view, and every 20 seconds while it is visible (the same as the pages, so a list and its badge
 * change together).
 */
export function useNavCounts() {
  const { pathname } = useLocation()
  const { data, refresh } = useQuery(() => getNavCounts(), [])
  useAutoRefresh(refresh)

  const firstPage = useRef(true)
  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false // the first load is useQuery's own
      return
    }
    refresh()
  }, [pathname, refresh])

  useEffect(() => {
    const onShow = () => !document.hidden && refresh()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [refresh])

  return data ?? NONE
}
