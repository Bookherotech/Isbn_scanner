import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, CheckCircle2, Flashlight, FlashlightOff, Keyboard, ScanLine, X } from 'lucide-react'
import { lookupIsbn } from '../../services/mockApi'
import { DEMO_ISBNS } from '../../services/catalog'
import { useDraft } from '../../hooks/useDraft'
import { Barcode } from '../../components/ui/Misc'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Feedback'
import { cn } from '../../utils/format'

const SCANNABLE = DEMO_ISBNS.filter((d) => d.isbn.length === 13)
const PHASE_TEXT = {
  idle: 'Align the barcode inside the frame',
  camera: 'Hold steady — looking for an ISBN barcode',
  scanning: 'Scanning…',
  detected: 'ISBN detected',
  loading: 'Loading book information…',
  ready: 'Metadata ready',
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export default function Scan() {
  const navigate = useNavigate()
  const { setDraft } = useDraft()
  const [pick, setPick] = useState(SCANNABLE[0].isbn)
  const [phase, setPhase] = useState('idle')
  const [isbn, setIsbn] = useState(null)
  const [flash, setFlash] = useState(false)
  const [camError, setCamError] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const [hasDetector] = useState(() => typeof window !== 'undefined' && 'BarcodeDetector' in window)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const pickMeta = SCANNABLE.find((d) => d.isbn === pick) || SCANNABLE[0]
  const busy = ['scanning', 'detected', 'loading', 'ready'].includes(phase)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), [])

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

  const demoScan = async () => {
    setPhase('scanning')
    await wait(1000)
    finish(pick)
  }

  const startCamera = async () => {
    setCamError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false })
      streamRef.current = stream
      setCameraOn(true)
      setPhase('camera')
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      })
      if (hasDetector) {
        const detector = new window.BarcodeDetector({ formats: ['ean_13'] })
        const loop = async () => {
          if (!streamRef.current || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            const hit = codes.find((c) => /^97[89]\d{10}$/.test(c.rawValue))
            if (hit) return finish(hit.rawValue)
          } catch {
            /* frame not ready */
          }
          setTimeout(loop, 250)
        }
        setTimeout(loop, 500)
      }
    } catch {
      setCamError('Camera unavailable or permission denied. Use the demo scan or enter the ISBN manually.')
    }
  }

  const toggleFlash = async () => {
    const next = !flash
    setFlash(next)
    const track = streamRef.current?.getVideoTracks()[0]
    if (track?.getCapabilities?.().torch) track.applyConstraints({ advanced: [{ torch: next }] }).catch(() => {})
  }

  return (
    <div className={cn('scanner', `is-${phase}`, flash && 'has-flash')}>
      <header className="scanner__top">
        <button
          className="scanner__btn"
          onClick={() => {
            stopCamera()
            navigate('/staff')
          }}
          aria-label="Close scanner"
        >
          <X size={22} />
        </button>
        <span className="scanner__heading">Scan ISBN</span>
        <button className={cn('scanner__btn', flash && 'is-on')} onClick={toggleFlash} aria-label={flash ? 'Turn flash off' : 'Turn flash on'} aria-pressed={flash}>
          {flash ? <Flashlight size={20} /> : <FlashlightOff size={20} />}
        </button>
      </header>

      <div className="scanner__view">
        {cameraOn ? (
          <video ref={videoRef} className="scanner__video" playsInline muted />
        ) : (
          <div className="scanner__mock" aria-hidden>
            <div className="scanner__book">
              <span className="scanner__book-text">
                {pickMeta.label}
                <br />
                <em>{pickMeta.note.split(' — ')[0]}</em>
              </span>
              <div className="scanner__book-code">
                <Barcode value={pick} height={40} />
              </div>
            </div>
          </div>
        )}
        <div className="scanner__frame" aria-hidden>
          <i />
          <i />
          <i />
          <i />
          <span className="scanner__laser" />
        </div>
        <div className="scanner__status" role="status" aria-live="polite">
          {phase === 'detected' || phase === 'ready' ? <CheckCircle2 size={16} /> : busy ? <Spinner size={14} /> : <ScanLine size={16} />}
          <span>{PHASE_TEXT[phase]}</span>
          {isbn && (phase === 'detected' || phase === 'loading' || phase === 'ready') && <span className="mono scanner__isbn">{isbn}</span>}
        </div>
        {phase === 'camera' && !hasDetector && (
          <p className="scanner__note">This browser can’t decode barcodes live. Use the demo scan below — on Android Chrome live decoding works.</p>
        )}
      </div>

      <div className="scanner__sheet">
        <p className="scanner__sheet-label">Demo book to scan</p>
        <div className="scanner__picks" role="radiogroup" aria-label="Demo book">
          {SCANNABLE.map((d) => (
            <button
              key={d.isbn}
              role="radio"
              aria-checked={pick === d.isbn}
              className={cn('scanner__pick', pick === d.isbn && 'is-active', d.hint === 'error' && 'is-error')}
              onClick={() => setPick(d.isbn)}
              disabled={busy}
            >
              <strong>{d.label}</strong>
              <span>{d.note}</span>
            </button>
          ))}
        </div>
        <Button variant="primary" size="xl" block icon={ScanLine} onClick={demoScan} loading={busy} disabled={busy}>
          {busy ? PHASE_TEXT[phase] : 'Use demo scan'}
        </Button>
        <div className="scanner__alt">
          {phase !== 'camera' ? (
            <button className="scanner__link" onClick={startCamera} disabled={busy}>
              <Camera size={16} aria-hidden /> Use device camera
            </button>
          ) : (
            <button
              className="scanner__link"
              onClick={() => {
                stopCamera()
                setPhase('idle')
              }}
            >
              <X size={16} aria-hidden /> Stop camera
            </button>
          )}
          <Link to="/staff/manual-isbn" className="scanner__link" onClick={stopCamera}>
            <Keyboard size={16} aria-hidden /> Enter ISBN manually
          </Link>
        </div>
        {camError && <p className="scanner__err">{camError}</p>}
      </div>
    </div>
  )
}
