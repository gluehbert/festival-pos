import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const APP = fileURLToPath(new URL('../../app', import.meta.url))
const css = readFileSync(join(APP, 'assets/css/main.css'), 'utf8')

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? vueFiles(join(dir, e.name)) : e.name.endsWith('.vue') ? [join(dir, e.name)] : [])
}

describe('accent gradients', () => {
  it('keep the plain accent as fallback behind the gradient', () => {
    const rule = css.match(/@utility bg-brand-gradient \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/background-color: var\(--color-brand\);[\s\S]*background-image:/)
  })

  // A disabled background colour is hidden under the gradient image unless
  // the image is removed as well.
  it('are removed together with a disabled background colour', () => {
    const offenders = vueFiles(APP).flatMap((file) =>
      (readFileSync(file, 'utf8').match(/class="[^"]*bg-brand-gradient[^"]*"/g) ?? [])
        .filter((cls) => /disabled:bg-(?!none)/.test(cls) && !cls.includes('disabled:bg-none'))
        .map((cls) => `${file}: ${cls}`))
    expect(offenders).toEqual([])
  })
})
