/** Cover photos: shrink in the browser before upload, so phones on mobile data send ~100-300 KB. */

const LONG_SIDE = 1000
const QUALITY = 0.82

/** An image File (camera or gallery) -> a JPEG data URL, longest side at most 1000 px. */
export async function shrinkPhoto(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose a photo (JPEG, PNG or WebP).')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode() // modern browsers apply the phone's EXIF rotation when drawing
    const scale = Math.min(1, LONG_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', QUALITY)
  } catch {
    throw new Error('This photo could not be read. Try another one.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
