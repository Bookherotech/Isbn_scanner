import { useState, useSyncExternalStore } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '../ui/Button'
import { applyUpdate, hasUpdate, subscribeUpdate } from '../../pwa/register'

/** Shown when a new version is on the server; the app switches only when the user clicks Update. */
export function UpdatePrompt() {
  const ready = useSyncExternalStore(subscribeUpdate, hasUpdate)
  const [busy, setBusy] = useState(false)
  if (!ready) return null
  return (
    <div className="update-prompt" role="status">
      <RefreshCw size={17} className="update-prompt__icon" aria-hidden />
      <span>New version available</span>
      <Button
        variant="primary"
        size="sm"
        loading={busy}
        onClick={() => {
          setBusy(true)
          applyUpdate()
        }}
      >
        Update
      </Button>
    </div>
  )
}
