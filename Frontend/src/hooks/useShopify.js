import { getSettings } from '../services/adminApi'
import { useQuery } from './useStore'

const NOT_LOADED = { storeName: '', domain: '', location: '', connected: false, pollMinutes: 10, reminderHours: 24, lastPollAt: null, health: 'disconnected' }

/** The store / Shopify card data from the backend settings (placeholder values until loaded). Refetches after the settings are saved. */
export function useShopify() {
  const { data } = useQuery(() => getSettings(), [])
  return data ?? NOT_LOADED
}
