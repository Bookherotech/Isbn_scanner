/**
 * The Scan screen's camera: on Android the main back lens (not the ultra-wide, which cannot focus on a barcode held
 * close; on iPhone Safari's own choice, which switches lenses for close-ups), 1920px wide, continuous autofocus and a
 * little zoom where the phone allows them, and the band of each frame around the yellow frame for the barcode reader.
 */

const SIZE = { width: { ideal: 1920 }, height: { ideal: 1080 } }
const ZOOM = 1.2 // a little zoom: a barcode held at a normal distance still fits on screen, and sits where the lens focuses
const CAMERA_KEY = 'bookhero.scanCamera' // the lens picked last time on this device, so the next scan opens it straight away
const NOT_MAIN = /ultra|wide angle|tele|depth|infrared|\bir\b|macro|front|user/i

function remembered() {
  try {
    return localStorage.getItem(CAMERA_KEY) || ''
  } catch {
    return ''
  }
}

function remember(deviceId) {
  try {
    if (deviceId) localStorage.setItem(CAMERA_KEY, deviceId)
    else localStorage.removeItem(CAMERA_KEY)
  } catch {
    /* storage blocked: the lens is picked again next time */
  }
}

/** The main back lens among the cameras (labels are known once the camera is allowed), or null when there is no choice. */
export function mainBackCamera(devices) {
  const back = devices.filter((d) => d.kind === 'videoinput' && /back|rear|environment/i.test(d.label))
  if (back.length < 2) return null
  const usable = back.filter((d) => !NOT_MAIN.test(d.label))
  // iPhone: "Back Camera" is the main lens ("Back Ultra Wide Camera", "Back Telephoto Camera" are the others)
  const iphone = usable.find((d) => /^back camera$/i.test(d.label.trim()))
  if (iphone) return iphone
  // Android: "camera2 0, facing back" — the lowest number is the main lens
  const numbered = usable
    .map((d) => ({ d, n: Number((d.label.match(/camera2?\s*(\d+)/i) || [])[1]) }))
    .filter((x) => Number.isFinite(x.n))
    .sort((a, b) => a.n - b.n)
  return numbered[0]?.d || usable[0] || null
}

/** iPhone / iPad (also iPadOS, which reports itself as a Mac with a touch screen). */
function isApple() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

async function open(video) {
  return navigator.mediaDevices.getUserMedia({ video, audio: false })
}

/** Continuous autofocus and a little zoom, where the camera has them (each asked on its own: one refused must not undo the other). */
async function tune(stream) {
  const track = stream.getVideoTracks()[0]
  const caps = track?.getCapabilities?.() || {}
  if (caps.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {})
  if (caps.zoom && caps.zoom.max >= ZOOM) await track.applyConstraints({ advanced: [{ zoom: Math.max(caps.zoom.min || 1, ZOOM) }] }).catch(() => {})
}

/**
 * Open the camera for scanning -> MediaStream. Phones: the main back lens; laptops (no back camera): any camera.
 * Throws the getUserMedia error (NotAllowedError, NotFoundError...) when no camera can be opened.
 */
export async function openScanCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('No camera API'), { name: 'NotFoundError' })

  if (isApple()) {
    // iPhone: Safari's back camera is a virtual one that switches to the close-up lens by itself; forcing a lens loses that
    remember('')
    let stream
    try {
      stream = await open({ facingMode: 'environment', ...SIZE })
    } catch (error) {
      if (error?.name !== 'OverconstrainedError' && error?.name !== 'NotFoundError') throw error
      stream = await open(true)
    }
    await tune(stream)
    return stream
  }

  const saved = remembered()
  if (saved) {
    try {
      const stream = await open({ deviceId: { exact: saved }, ...SIZE })
      await tune(stream)
      return stream
    } catch {
      remember('') // that lens is gone (another phone, browser update): pick again
    }
  }

  let stream
  try {
    stream = await open({ facingMode: 'environment', ...SIZE })
  } catch (error) {
    if (error?.name !== 'OverconstrainedError' && error?.name !== 'NotFoundError') throw error
    stream = await open(true) // a laptop: no back camera
  }

  try {
    const main = mainBackCamera(await navigator.mediaDevices.enumerateDevices())
    const current = stream.getVideoTracks()[0]?.getSettings?.().deviceId
    if (main && main.deviceId && main.deviceId !== current) {
      stream.getTracks().forEach((t) => t.stop()) // phones open one back lens at a time
      try {
        stream = await open({ deviceId: { exact: main.deviceId }, ...SIZE })
      } catch {
        stream = await open({ facingMode: 'environment', ...SIZE })
      }
    }
    remember(stream.getVideoTracks()[0]?.getSettings?.().deviceId || '')
  } catch {
    /* lens list not available: keep the camera the browser chose */
  }
  await tune(stream)
  return stream
}

const BAND = 2.2 // the band read is this many times the yellow frame's height (a barcode held a little high or low still reads)
const MAX_READ_WIDTH = 1280 // wider bands are scaled down first: same result for a barcode, less work per check

/**
 * The band of the video across its full width, around the yellow frame (`frame`) on screen, drawn into `canvas` ->
 * the canvas, or the video itself when it cannot be worked out. Full width, so a barcode bigger than the frame or held
 * off to one side still reads; only the parts far above and below (other text, other barcodes) are left out.
 */
export function frameArea(video, frame, canvas) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || !frame) return video
  const view = video.getBoundingClientRect()
  const box = frame.getBoundingClientRect()
  const scale = Math.max(view.width / vw, view.height / vh) // the video is shown with object-fit: cover
  if (!scale || !box.height) return video
  const offsetY = (view.height - vh * scale) / 2
  const centre = (box.top + box.height / 2 - view.top - offsetY) / scale
  const h = Math.min(vh, (box.height / scale) * BAND)
  const y = Math.min(Math.max(0, centre - h / 2), vh - h)
  const shrink = Math.min(1, MAX_READ_WIDTH / vw)
  canvas.width = Math.round(vw * shrink)
  canvas.height = Math.round(h * shrink)
  if (canvas.height < 30) return video
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, y, vw, h, 0, 0, canvas.width, canvas.height)
  return canvas
}
