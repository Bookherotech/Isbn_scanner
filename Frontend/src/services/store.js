/**
 * A version counter that makes open queries refetch after a change (see bump()). All data comes from the Django API.
 */

let version = 0
const listeners = new Set()

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getVersion = () => version

/** Tell every open query to refetch (the backend changed). */
export function bump() {
  version++
  listeners.forEach((l) => l())
}
