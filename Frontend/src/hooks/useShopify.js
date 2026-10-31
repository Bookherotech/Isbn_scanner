import { getSettings } from '../services/adminApi'
import { useAutoRefresh, useQuery } from './useStore'

const NOT_LOADED = { storeName: '', domain: '', location: '', connected: false, pollMinutes: 10, reminderHours: 24, lastPollAt: null, health: 'disconnected' }

/** The store / Shopify card data from the backend settings (placeholder values until loaded). Refetches after the settings are saved, and on a timer so "last sync" stays current. */
export function useShopify() {
  const { data, refresh } = useQuery(() => getSettings(), [])
  useAutoRefresh(refresh)
  return data ?? NOT_LOADED
}
