/**
 * The Scan screen's camera: the phone's main back lens (not the ultra-wide, which cannot focus on a barcode held
 * close), 1920px wide, continuous autofocus and a little zoom where the phone allows them, and the part of each frame
 * inside the yellow frame for the barcode reader.
 */

const SIZE = { width: { ideal: 1920 }, height: { ideal: 1080 } }
const ZOOM = 1.5 // a little zoom: staff can hold the book a bit further away, where the lens focuses
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

/**
 * The part of the video inside `frame` (the yellow frame on screen), drawn into `canvas` -> the canvas, or the video
 * itself when it cannot be worked out. A margin is kept around the frame, so a barcode held a little off still reads.
 */
export function frameArea(video, frame, canvas) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || !frame) return video
  const view = video.getBoundingClientRect()
  const box = frame.getBoundingClientRect()
  const scale = Math.max(view.width / vw, view.height / vh) // the video is shown with object-fit: cover
  if (!scale || !box.width) return video
  const offsetX = (view.width - vw * scale) / 2
  const offsetY = (view.height - vh * scale) / 2
  const margin = 0.2
  let x = (box.left - view.left - offsetX) / scale - (box.width / scale) * margin
  let y = (box.top - view.top - offsetY) / scale - (box.height / scale) * margin
  let w = (box.width / scale) * (1 + 2 * margin)
  let h = (box.height / scale) * (1 + 2 * margin)
  x = Math.max(0, x)
  y = Math.max(0, y)
  w = Math.min(vw - x, w)
  h = Math.min(vh - y, h)
  if (w < 50 || h < 30) return video
  canvas.width = Math.round(w)
  canvas.height = Math.round(h)
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, x, y, w, h, 0, 0, canvas.width, canvas.height)
  return canvas
}
