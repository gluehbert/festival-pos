import { describe, expect, it } from 'vitest'
import { logoFitsDark } from '../../server/lib/logo-analysis'
import { squarePng } from '../setup/fixtures'

const CLEAR: [number, number, number, number] = [0, 0, 0, 0]
const WHITE: [number, number, number, number] = [255, 255, 255, 255]
const BLACK: [number, number, number, number] = [0, 0, 0, 255]
const RED: [number, number, number, number] = [227, 6, 19, 255]
const NAVY: [number, number, number, number] = [30, 58, 138, 255]
const YELLOW: [number, number, number, number] = [255, 213, 0, 255]

describe('logo dark-mode check', () => {
  it('shows a light logo on a transparent background as is', () => {
    expect(logoFitsDark('image/png', squarePng(WHITE, CLEAR))).toBe(true)
    expect(logoFitsDark('image/png', squarePng(YELLOW, CLEAR))).toBe(true)
  })

  it('needs the plate for an opaque background, even a dark one', () => {
    expect(logoFitsDark('image/png', squarePng(RED, WHITE))).toBe(false)
    expect(logoFitsDark('image/png', squarePng(WHITE, BLACK))).toBe(false)
  })

  it('needs the plate when the logo itself would vanish on dark', () => {
    expect(logoFitsDark('image/png', squarePng(BLACK, CLEAR))).toBe(false)
    // Navy is too dark on the dark surface (< 3:1); signal red is fine.
    expect(logoFitsDark('image/png', squarePng(NAVY, CLEAR))).toBe(false)
    expect(logoFitsDark('image/png', squarePng(RED, CLEAR))).toBe(true)
  })

  it('plays safe for formats it does not decode and for broken files', () => {
    expect(logoFitsDark('image/jpeg', squarePng(WHITE, CLEAR))).toBe(false)
    expect(logoFitsDark('image/webp', squarePng(WHITE, CLEAR))).toBe(false)
    expect(logoFitsDark('image/png', Buffer.from('not a png'))).toBe(false)
    expect(logoFitsDark('image/png', squarePng(CLEAR, CLEAR))).toBe(false)
  })
})
