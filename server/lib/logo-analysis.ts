import { PNG } from 'pngjs'
import { DARK_SURFACE, luminance, toRgb } from './color'

// Can the logo be shown as is on the dark theme, or does it need a light
// plate behind it? Only a PNG can be judged: JPEG has no transparency, and
// WebP is not decoded here, so both get the plate (the safe choice).
//
// A logo fits the dark theme when
//  - its background is transparent: nearly the whole outer border is see-
//    through (an opaque white box would look like a sticker), and
//  - most of what is visible stands out from the dark surface: at most a
//    quarter of the opaque pixels are too dark (contrast below 3:1), so e.g.
//    black lettering on a transparent background still gets the plate.

const MAX_SAMPLES = 250_000
const BORDER_SHARE = 0.02
const MIN_TRANSPARENT_BORDER = 0.9
const MAX_TOO_DARK = 0.25
const MIN_CONTRAST = 3

const SURFACE_LUM = luminance(toRgb(DARK_SURFACE))

function standsOut(r: number, g: number, b: number): boolean {
  const l = luminance([r, g, b])
  const [hi, lo] = l > SURFACE_LUM ? [l, SURFACE_LUM] : [SURFACE_LUM, l]
  return (hi + 0.05) / (lo + 0.05) >= MIN_CONTRAST
}

export function analyzeRgba(width: number, height: number, rgba: Uint8Array): boolean {
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / MAX_SAMPLES)))
  const bx = Math.max(1, Math.round(width * BORDER_SHARE))
  const by = Math.max(1, Math.round(height * BORDER_SHARE))
  let border = 0
  let borderClear = 0
  let visible = 0
  let tooDark = 0
  for (let y = 0; y < height; y += step) {
    const edgeRow = y < by || y >= height - by
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      const a = rgba[i + 3]!
      if (edgeRow || x < bx || x >= width - bx) {
        border++
        if (a < 32) borderClear++
      }
      if (a >= 128) {
        visible++
        if (!standsOut(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!)) tooDark++
      }
    }
  }
  if (border === 0 || visible === 0) return false
  return borderClear / border >= MIN_TRANSPARENT_BORDER && tooDark / visible <= MAX_TOO_DARK
}

export function logoFitsDark(contentType: string, data: Buffer): boolean {
  if (contentType !== 'image/png') return false
  try {
    const png = PNG.sync.read(data)
    return analyzeRgba(png.width, png.height, png.data)
  }
  catch {
    return false
  }
}
