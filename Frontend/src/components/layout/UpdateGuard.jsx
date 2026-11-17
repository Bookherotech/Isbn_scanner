import { Component } from 'react'
import { Button } from '../ui/Button'

// After a deploy the old page chunks are gone, so an open tab fails to load the next page.
// Reload once to pick up the new build; the guard stops a reload loop if the error is something else.
const KEY = 'bookhero.chunk-reload'
const LOOP_WINDOW_MS = 10_000

function reloadOnce() {
  let last = 0
  try { last = Number(sessionStorage.getItem(KEY)) || 0 } catch { /* storage blocked */ }
  if (Date.now() - last < LOOP_WINDOW_MS) return false
  try { sessionStorage.setItem(KEY, String(Date.now())) } catch { /* storage blocked */ }
  window.location.reload()
  return true
}

window.addEventListener('vite:preloadError', () => { reloadOnce() })

// Last resort: any render error shows a reload button instead of a white screen.
export class UpdateGuard extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="boot" style={{ display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <p style={{ marginBottom: 16 }}>Something went wrong or the app was updated.</p>
          <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    )
  }
}
