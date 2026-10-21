/**
 * Live barcode reading for the Scan screen.
 * Uses the browser's own BarcodeDetector where it reads EAN-13 (Chrome on Android / macOS).
 * Everywhere else (iPhone Safari, Firefox, Chrome on Windows) it loads the same API from
 * `barcode-detector` (ZXing compiled to WebAssembly). The ~1 MB .wasm file is bundled with the app
 * and only downloaded when the camera starts on such a browser.
 */

const ISBN_FORMATS = ['ean_13'] // book barcodes are EAN-13 (978 / 979 + ISBN)

async function nativeDetector() {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats()
    return formats.includes('ean_13') ? new window.BarcodeDetector({ formats: ISBN_FORMATS }) : null
  } catch {
    return null
  }
}

/** A detector with `detect(videoElement)` -> [{ rawValue }]. Rejects if the WebAssembly decoder cannot load. */
export async function createIsbnDetector() {
  const native = await nativeDetector()
  if (native) return native

  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  // Serve the .wasm from this app instead of the library's default CDN, and load it now so a failure shows up here.
  await prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
    fireImmediately: true,
  })
  return new BarcodeDetector({ formats: ISBN_FORMATS })
}
