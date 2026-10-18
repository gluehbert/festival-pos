import { describe, expect, it } from 'vitest'
import { accentCss, accentTheme, contrastRatio, DEFAULT_ACCENT } from '../../server/lib/color'
import { sniffContentType, validateAsset } from '../../server/lib/branding'
import { UpdateBrandingSchema } from '../../server/lib/contracts/branding'
import { PNG_1PX } from '../setup/fixtures'

describe('accent colour theme', () => {
  it('keeps every derived colour readable', () => {
    for (const c of ['#7c3aed', '#ffd500', '#ffffff', '#000000', '#e30613', '#00a650', '#87ceeb']) {
      const t = accentTheme(c)
      expect(contrastRatio(t.ink, '#ffffff')).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t.inkDark, '#0f172b')).toBeGreaterThanOrEqual(4.5)
      // ... and on the tinted chip (12 % accent mixed into the card colour)
      const soft = (base: string) => `#${[1, 3, 5].map((i) => Math.round(Number.parseInt(t.brand.slice(i, i + 2), 16) * 0.12 + Number.parseInt(base.slice(i, i + 2), 16) * 0.88).toString(16).padStart(2, '0')).join('')}`
      expect(contrastRatio(t.ink, soft('#ffffff'))).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t.inkDark, soft('#0f172b'))).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t.brand, t.onBrand)).toBeGreaterThanOrEqual(contrastRatio(t.brand, t.onBrand === '#ffffff' ? '#0f172a' : '#ffffff'))
    }
  })

  it('uses dark text on light accents and white text on dark ones', () => {
    expect(accentTheme('#ffd500').onBrand).toBe('#0f172a')
    expect(accentTheme('#7c3aed').onBrand).toBe('#ffffff')
  })

  it('falls back to the default for missing or invalid colours and emits CSS variables', () => {
    expect(accentTheme(null).brand).toBe(DEFAULT_ACCENT)
    expect(accentTheme('red').brand).toBe(DEFAULT_ACCENT)
    expect(accentCss('#E30613')).toMatch(/^:root\{--color-brand:#e30613;--color-brand-ink:light-dark\(#[0-9a-f]{6},#[0-9a-f]{6}\);--color-brand-contrast:#ffffff\}$/)
  })
})

describe('asset validation', () => {
  it('detects types from magic bytes, never trusting the file name', () => {
    expect(sniffContentType(PNG_1PX)).toBe('image/png')
    expect(sniffContentType(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]))).toBe('image/jpeg')
    expect(sniffContentType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniffContentType(Buffer.from('%PDF-1.7'))).toBe('application/pdf')
    expect(sniffContentType(Buffer.from('<svg onload="alert(1)">'))).toBeNull()
  })

  it('enforces type and size per kind', () => {
    expect(validateAsset('logo', PNG_1PX).contentType).toBe('image/png')
    expect(() => validateAsset('logo', Buffer.from('%PDF-1.7'))).toThrow(/Logo must/)
    expect(validateAsset('flyer', Buffer.from('%PDF-1.7')).contentType).toBe('application/pdf')
    expect(() => validateAsset('logo', Buffer.concat([PNG_1PX, Buffer.alloc(1024 * 1024)]))).toThrow(/too large/)
    expect(() => validateAsset('flyer', Buffer.alloc(0))).toThrow(/Empty/)
  })
})

describe('UpdateBrandingSchema', () => {
  it('normalises colours, trims text and turns empty text into null', () => {
    expect(UpdateBrandingSchema.parse({ accentColor: '#AABBCC', welcomeText: '  ', program: ' 18 Uhr ' }))
      .toEqual({ accentColor: '#aabbcc', welcomeText: null, program: '18 Uhr' })
    expect(() => UpdateBrandingSchema.parse({ accentColor: 'red' })).toThrow()
    expect(() => UpdateBrandingSchema.parse({ welcomeText: 'x'.repeat(301) })).toThrow()
  })
})
