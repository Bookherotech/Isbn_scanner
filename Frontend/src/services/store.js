/**
 * Small client-side store: the demo sign-in users, plus a version counter that makes open queries
 * refetch after a change (see bump()). All real data comes from the Django API.
 */
import { createSeed } from './mockData'

const KEY = 'bookhero.demo.v4'
let state = load() ?? createSeed()
let version = 0
const listeners = new Set()

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.version === 4 ? parsed : null
  } catch {
    return null
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable (private mode) — demo still works in memory */
  }
}

export const db = () => state

export function now() {
  return Date.now()
}

/** Mutate the draft in place, then notify subscribers once. */
export function commit(mutator) {
  const result = mutator(state)
  version++
  persist()
  listeners.forEach((l) => l())
  return result
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getVersion = () => version

/** Tell every open query to refetch (the real backend changed; nothing to save locally). */
export function bump() {
  version++
  listeners.forEach((l) => l())
}

export function resetStore() {
  state = createSeed()
  version++
  persist()
  listeners.forEach((l) => l())
}

// Cross-tab sync: an admin tab and a staff tab stay consistent during demos.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return
    try {
      state = JSON.parse(e.newValue)
      version++
      listeners.forEach((l) => l())
    } catch {
      /* ignore */
    }
  })
}
