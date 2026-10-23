import { useEffect } from 'react'
import { getNavCounts } from '../services/adminApi'
import { useQuery } from './useStore'

const NONE = { pending: 0, waiting: 0, ready: 0, oos: 0, flagged: 0 }

/** Sidebar / tab-bar badge counts from the backend. Refetches after any admin change and once a minute. */
export function useNavCounts() {
  const { data, reload } = useQuery(() => getNavCounts(), [])
  useEffect(() => {
    const id = setInterval(reload, 60_000)
    return () => clearInterval(id)
  }, [reload])
  return data ?? NONE
}
