import { useEffect, useState } from 'react'

/** Whole seconds left until `targetTime` (ms since epoch). Re-renders once a second; stops at 0. */
export function useCountdown(targetTime) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return Math.max(0, Math.ceil((targetTime - now) / 1000))
}
