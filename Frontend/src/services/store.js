/**
 * In-memory demo database, persisted to localStorage so the presenter can
 * refresh or switch roles without losing the story. Replace mockApi.js with
 * real Django REST calls later — components never touch this file directly.
 */
import { createSeed } from './mockData'

const KEY = 'bookhero.demo.v2'
let state = load() ?? createSeed()
let version = 0
const listeners = new Set()

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.version === 2 ? parsed : null
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
  return Date.now() + (state.demo?.clockOffset || 0)
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

export function resetStore() {
  state = createSeed()
  version++
  persist()
  listeners.forEach((l) => l())
}

export function nextId(kind) {
  const n = state.seq[kind]++
  const prefix = { item: 'itm', notification: 'ntf', activity: 'act' }[kind]
  return `${prefix}_${String(n).padStart(4, '0')}`
}

export function nextProductId() {
  state.seq.product += 13 + Math.floor(Math.random() * 40)
  return String(state.seq.product)
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
