/**
 * Registers the service worker (production builds only) and tells the app when a new version is
 * on the server. The worker file changes on every deploy, so the browser installs the new one in
 * the background; it waits until the user clicks "Update" (see UpdatePrompt).
 */
const CHECK_EVERY_MS = 30 * 60 * 1000

let waiting = null // the new worker, or true when another tab already switched to it
let applying = false
const listeners = new Set()

function setUpdate(value) {
  waiting = value
  listeners.forEach((listener) => listener())
}

export function subscribeUpdate(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function hasUpdate() {
  return Boolean(waiting)
}

/** Switch to the new version: the waiting worker takes over, then the page reloads (controllerchange). */
export function applyUpdate() {
  applying = true
  if (waiting && waiting !== true) waiting.postMessage('SKIP_WAITING')
  else window.location.reload()
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const sw = navigator.serviceWorker
  let controlled = Boolean(sw.controller) // false on the very first visit: nothing to update from

  sw.addEventListener('controllerchange', () => {
    if (applying) window.location.reload()
    else if (controlled) setUpdate(true) // another tab clicked "Update": this tab still runs the old version
    controlled = true
  })

  window.addEventListener('load', async () => {
    let reg
    try {
      reg = await sw.register('/sw.js', { updateViaCache: 'none' })
    } catch {
      return // no service worker (private mode, blocked): the site works as a normal web page
    }
    if (reg.waiting && sw.controller) setUpdate(reg.waiting)
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && sw.controller) setUpdate(worker)
      })
    })

    // An installed app can stay open for days: look for a new deploy now and then and when it comes back to the front.
    const check = () => reg.update().catch(() => {})
    setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  })
}
