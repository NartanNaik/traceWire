const MAX_SIDE = 2000
const QUALITY = 0.82
const MAX_BYTES = 25 * 1024 * 1024
const KEEP_AS_IS_BYTES = 300 * 1024
const PASS_THROUGH = ['image/webp', 'image/jpeg', 'image/png']

export async function prepareImage(file, { maxUploadBytes = 5 * 1024 * 1024 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`)
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 25 MB.`)

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`Could not read ${file.name}. Use a PNG, JPG, WebP or GIF image.`)
  }
  const srcW = bitmap.width
  const srcH = bitmap.height

  // animated GIFs are uploaded untouched so the animation survives
  if (file.type === 'image/gif') {
    if (bitmap.close) bitmap.close()
    if (file.size > maxUploadBytes) {
      throw new Error(`${file.name} is a GIF larger than ${Math.round(maxUploadBytes / 1048576)} MB. Use a smaller GIF or a still image.`)
    }
    return { blob: file, width: srcW, height: srcH }
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH))
  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))

  // small, already web-ready images are uploaded untouched
  if (scale === 1 && file.size <= KEEP_AS_IS_BYTES && PASS_THROUGH.includes(file.type)) {
    if (bitmap.close) bitmap.close()
    return { blob: file, width, height }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  if (bitmap.close) bitmap.close()

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY))
  if (!blob) throw new Error(`Could not process ${file.name}.`)
  return { blob, width, height }
}