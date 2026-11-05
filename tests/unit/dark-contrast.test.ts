import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const APP = fileURLToPath(new URL('../../app', import.meta.url))

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? vueFiles(join(dir, e.name)) : e.name.endsWith('.vue') ? [join(dir, e.name)] : [])
}

describe('dark mode contrast', () => {
  // Dark slate shades are mirrored to light ones in dark mode, white is not:
  // white text on them turns unreadable. Solid buttons use bg-primary.
  it('never puts white text on a dark slate background', () => {
    const offenders = vueFiles(APP).flatMap((file) =>
      (readFileSync(file, 'utf8').match(/class="[^"]*"/g) ?? [])
        .filter((cls) => /\btext-white\b/.test(cls) && /(?:^|[\s"])bg-slate-(?:[6-9]00|950)\b/.test(cls))
        .map((cls) => `${file}: ${cls}`))
    expect(offenders).toEqual([])
  })
})
