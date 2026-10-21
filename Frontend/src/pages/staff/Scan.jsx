import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Flashlight, FlashlightOff, Keyboard, RotateCcw, ScanLine, X } from 'lucide-react'
import { lookupIsbn } from '../../services/staffApi'
import { createIsbnDetector } from '../../services/barcode'
import { isValidIsbn13 } from '../../services/isbn'
import { useDraft } from '../../hooks/useDraft'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Feedback'
import { cn } from '../../utils/format'

const PHASE_TEXT = {
  idle: 'Starting camera…',
  camera: 'Hold steady — looking for an ISBN barcode',
  failed: 'Camera not available',
  detected: 'ISBN detected',
  loading: 'Loading book information…',
  ready: 'Metadata ready',
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** A message staff can act on, from the getUserMedia error. */
function cameraErrorText(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was blocked. Allow the camera for this site (the icon next to the address bar), then try again.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device. Enter the ISBN manually.'
    case 'NotReadableError':
    case 'AbortError':
      return 'Another app is using the camera. Close it, then try again.'
    default:
      return 'The camera could not be started. Try again, or enter the ISBN manually.'
  }
}

/** The back camera on phones; any camera on laptops (they have no "environment" camera). */
async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('No camera API'), { name: 'NotFoundError' })
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false })
  } catch (error) {
    if (error?.name !== 'OverconstrainedError' && error?.name !== 'NotFoundError') throw error
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  }
}

export default function Scan() {
  const navigate = useNavigate()
  const { setDraft } = useDraft()
  const [phase, setPhase] = useState('idle')
  const [isbn, setIsbn] = useState(null)
  const [flash, setFlash] = useState(false)
  const [camError, setCamError] = useState('')
  const [hasDetector, setHasDetector] = useState(true) // false only if no barcode decoder could be loaded
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const runRef = useRef(0) // bumps on every start/stop, so a camera that opens after leaving the page is shut again
  const busy = ['detected', 'loading', 'ready'].includes(phase)

  const stopCamera = () => {
    runRef.current++
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const finish = async (code) => {
    stopCamera()
    setIsbn(code)
    setPhase('detected')
    navigator.vibrate?.(40)
    await wait(650)
    setPhase('loading')
    try {
      const meta = await lookupIsbn(code)
      setPhase('ready')
      setDraft({ isbn: code, meta, values: null })
      await wait(450)
      navigate(`/staff/book/${code}`)
    } catch (error) {
      navigate(`/staff/book/${code}`, { state: { error: { code: error.code, message: error.message } } })
    }
  }

  const startCamera = async () => {
    stopCamera()
    const run = runRef.current
    setCamError('')
    setPhase('idle')
    let stream
    try {
      stream = await openCamera()
    } catch (error) {
      if (run !== runRef.current) return
      setCamError(cameraErrorText(error))
      setPhase('failed')
      return
    }
    if (run !== runRef.current) {
      stream.getTracks().forEach((t) => t.stop()) // the page was left (or restarted) while the camera was opening
      return
    }
    streamRef.current = stream
    const video = videoRef.current // always on the page, so the stream can be attached right away
    if (video) {
      video.srcObject = stream
      video.play().catch(() => {})
    }
    setPhase('camera')

    // Native reader on Chrome Android / macOS; the WebAssembly reader everywhere else (iPhone, Firefox, Windows, …).
    let detector
    try {
      detector = await createIsbnDetector()
    } catch {
      if (run === runRef.current) setHasDetector(false)
      return
    }
    setHasDetector(true)
    const loop = async () => {
      if (run !== runRef.current || !videoRef.current) return
      try {
        const codes = await detector.detect(videoRef.current)
        const hit = codes.find((c) => isValidIsbn13(c.rawValue)) // 978/979 prefix + check digit
        if (hit && run === runRef.current) return finish(hit.rawValue)
      } catch {
        /* frame not ready */
      }
      setTimeout(loop, 250)
    }
    setTimeout(loop, 500)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the camera opens as soon as the scanner is shown
    startCamera()
    return stopCamera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleFlash = async () => {
    const next = !flash
    setFlash(next)
    const track = streamRef.current?.getVideoTracks()[0]
    if (track?.getCapabilities?.().torch) track.applyConstraints({ advanced: [{ torch: next }] }).catch(() => {})
  }

  const close = (to) => {
    stopCamera()
    navigate(to)
  }

  return (
    <div className={cn('scanner', `is-${phase}`, flash && 'has-flash')}>
      <header className="scanner__top">
        <button className="scanner__btn" onClick={() => close('/staff')} aria-label="Close scanner">
          <X size={22} />
        </button>
        <span className="scanner__heading">Scan ISBN</span>
        <button className={cn('scanner__btn', flash && 'is-on')} onClick={toggleFlash} aria-label={flash ? 'Turn flash off' : 'Turn flash on'} aria-pressed={flash}>
          {flash ? <Flashlight size={20} /> : <FlashlightOff size={20} />}
        </button>
      </header>

      <div className="scanner__view">
        <video ref={videoRef} className="scanner__video" playsInline muted />
        <div className="scanner__frame" aria-hidden>
          <i />
          <i />
          <i />
          <i />
          <span className="scanner__laser" />
        </div>
        <div className="scanner__status" role="status" aria-live="polite">
          {phase === 'detected' || phase === 'ready' ? <CheckCircle2 size={16} /> : busy || phase === 'idle' ? <Spinner size={14} /> : <ScanLine size={16} />}
          <span>{PHASE_TEXT[phase]}</span>
          {isbn && busy && <span className="mono scanner__isbn">{isbn}</span>}
        </div>
        {phase === 'camera' && !hasDetector && (
          <p className="scanner__note">This browser can’t read barcodes from the camera. Enter the ISBN manually.</p>
        )}
      </div>

      <div className="scanner__sheet">
        <p className="scanner__sheet-label">Scan tips</p>
        <p className="sq-help">Hold the barcode on the back cover inside the yellow frame.</p>
        <p className="sq-help">Keep the book steady and in good light — the ISBN is read automatically.</p>
        <Button variant="primary" size="xl" block icon={Keyboard} onClick={() => close('/staff/manual-isbn')} disabled={busy}>
          Enter ISBN manually
        </Button>
        {camError && (
          <>
            <p className="scanner__err" role="alert">
              {camError}
            </p>
            <Button variant="secondary" block icon={RotateCcw} onClick={startCamera}>
              Try camera again
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
