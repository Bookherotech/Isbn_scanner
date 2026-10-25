import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getVersion, subscribe } from '../services/store'

/** Re-render when services/store.js is bumped (an admin change or a notification was read). */
export function useStoreVersion() {
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}

/** Cheap synchronous selector re-evaluated on every store change. */
export function useSelector(select) {
  useStoreVersion()
  return select()
}

/**
 * Minimal data-fetching hook.
 * - First load shows `loading` (skeletons); background refreshes keep old data.
 * - Refetches automatically after a bump() in services/store.js, unless `{ mock: false }` is passed
 *   (pages whose data such a change does not touch, e.g. the staff screens).
 */
export function useQuery(fetcher, deps = [], { mock = true } = {}) {
  const storeVersion = useStoreVersion()
  const version = mock ? storeVersion : 0
  const [state, setState] = useState({ data: null, loading: true, error: null, refreshing: false })
  const [nonce, setNonce] = useState(0)
  const fetcherRef = useRef(fetcher)

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mark loading/refreshing for the new request
    setState((s) => (s.data == null || s.error ? { data: null, loading: true, error: null, refreshing: false } : { ...s, refreshing: true }))
    fetcherRef
      .current()
      .then((data) => alive && setState({ data, loading: false, error: null, refreshing: false }))
      .catch((error) => alive && setState({ data: null, loading: false, error, refreshing: false }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { ...state, reload }
}

export function useDebounce(value, delay = 220) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false)
  const [match, setMatch] = useState(get)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

/** Ticks so relative timestamps ("2 min ago") stay fresh. */
export function useTicker(ms = 30_000) {
  const [, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT((t) => t + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}
