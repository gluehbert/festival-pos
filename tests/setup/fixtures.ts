import { PNG } from 'pngjs'

// 1×1 transparent PNG, the smallest valid image for upload tests.
export const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

// 40×40 PNG: a centred 20×20 square in `fg` (RGBA) on a `bg` (RGBA) background.
export function squarePng(fg: [number, number, number, number], bg: [number, number, number, number]): Buffer {
  const png = new PNG({ width: 40, height: 40 })
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      const c = x >= 10 && x < 30 && y >= 10 && y < 30 ? fg : bg
      png.data.set(c, (y * 40 + x) * 4)
    }
  }
  return PNG.sync.write(png)
}
