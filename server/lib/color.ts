// Accent colour helpers shared by server (validation) and app (theming).
// Any club colour must stay readable, so the theme derives:
//  - `ink`: the colour darkened until it reaches 4.5:1 on white and on the
//    tinted chips (links, text)
//  - `inkDark`: the colour lightened until it reaches 4.5:1 on the dark
//    theme's surface and chips, used instead of `ink` in dark mode
//  - `onBrand`: white or near-black text on a solid accent background,
//    whichever contrasts more (buttons)

export const DEFAULT_ACCENT = '#7c3aed'
export const HEX_COLOR = /^#[0-9a-f]{6}$/i

export type Rgb = [number, number, number]

export function toRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(toRgb(a)), luminance(toRgb(b))].sort((x, y) => y - x)
  return (l1! + 0.05) / (l2! + 0.05)
}

const DARK_TEXT = '#0f172a'
// Card surface of the dark theme (slate-900, see app/assets/css/main.css).
export const DARK_SURFACE = '#0f172b'

export interface AccentTheme {
  brand: string
  ink: string
  inkDark: string
  onBrand: string
}

// `base` mixed with `share` of `tint`, like CSS color-mix(in srgb, ...).
function mix(tint: string, share: number, base: string): string {
  const [a, b] = [toRgb(tint), toRgb(base)]
  return toHex(a.map((c, i) => c * share + b[i]! * (1 - share)) as Rgb)
}

// Moves `from` step by step towards black or white until it is readable on
// every given background.
function readable(from: string, backgrounds: string[], towards: 0 | 255): string {
  let rgb = toRgb(from)
  let out = from
  for (let i = 0; i < 40 && backgrounds.some((bg) => contrastRatio(out, bg) < 4.5); i++) {
    rgb = rgb.map((c) => c + (towards - c) * 0.08) as Rgb
    out = toHex(rgb)
  }
  return out
}

export function accentTheme(input: string | null | undefined): AccentTheme {
  const brand = input && HEX_COLOR.test(input) ? input.toLowerCase() : DEFAULT_ACCENT
  // Also readable on the tinted chips (bg-brand-soft: 12 % accent on the card).
  const ink = readable(brand, ['#ffffff', mix(brand, 0.12, '#ffffff')], 0)
  const inkDark = readable(brand, [DARK_SURFACE, mix(brand, 0.12, DARK_SURFACE)], 255)
  const onBrand = contrastRatio(brand, '#ffffff') >= contrastRatio(brand, DARK_TEXT) ? '#ffffff' : DARK_TEXT
  return { brand, ink, inkDark, onBrand }
}

// CSS custom properties consumed by the Tailwind theme (app/assets/css/main.css).
export function accentCss(input: string | null | undefined): string {
  const t = accentTheme(input)
  return `:root{--color-brand:${t.brand};--color-brand-ink:light-dark(${t.ink},${t.inkDark});--color-brand-contrast:${t.onBrand}}`
}
