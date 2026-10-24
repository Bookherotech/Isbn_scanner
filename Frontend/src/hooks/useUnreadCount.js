import { useEffect } from 'react'
import { getUnreadCount } from '../services/notificationApi'
import { useQuery } from './useStore'

/** Unread notification badge for the signed-in user. Refetches after any change and every 30 seconds. */
export function useUnreadCount() {
  const { data, reload } = useQuery(() => getUnreadCount(), [])
  useEffect(() => {
    const id = setInterval(reload, 30_000)
    return () => clearInterval(id)
  }, [reload])
  return data ?? 0
}
