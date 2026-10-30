import { describe, expect, it } from 'vitest'
import { fitText } from '~/utils/fit-text'

// A 400 × 300 px box whose content grows with the font size. In two columns
// it needs half the height; what does not fit runs sideways, as in a browser.
function box(lines: number) {
  const style = { fontSize: '', columnCount: '' }
  const needed = () => Number.parseFloat(style.fontSize) * 16 * 1.3 * lines / (style.columnCount === '2' ? 2 : 1)
  return {
    style,
    clientHeight: 300,
    clientWidth: 400,
    get scrollHeight() { return style.columnCount === '2' ? Math.min(needed(), 300) : needed() },
    get scrollWidth() { return style.columnCount === '2' ? 400 * Math.max(1, needed() / 300) : 400 },
  } as unknown as HTMLElement
}
const size = (el: HTMLElement) => Number.parseFloat(el.style.fontSize)

describe('fitText', () => {
  it('keeps the largest type when the order fits', () => {
    const el = box(3)
    fitText(el)
    expect(size(el)).toBe(3.5)
    expect(el.style.columnCount).toBe('')
  })

  it('ignores a line poking out sideways in one column', () => {
    const el = box(3)
    Object.defineProperty(el, 'scrollWidth', { get: () => 408 })
    fitText(el)
    expect(size(el)).toBe(3.5)
    expect(el.style.columnCount).toBe('')
  })

  it('shrinks the type in one column first', () => {
    const el = box(7)
    fitText(el)
    expect(size(el)).toBeLessThan(3.5)
    expect(size(el)).toBeGreaterThanOrEqual(1.5)
    expect(el.style.columnCount).toBe('')
    expect(el.scrollHeight).toBeLessThanOrEqual(301)
  })

  it('spreads a long order over two columns without running sideways', () => {
    const el = box(14)
    expect(fitText(el)).toBe(true)
    expect(el.style.columnCount).toBe('2')
    expect(el.scrollWidth).toBeLessThanOrEqual(401)
    expect(el.scrollHeight).toBeLessThanOrEqual(301)
  })

  it('reports an order that does not fit even in the smallest type', () => {
    expect(fitText(box(60))).toBe(false)
  })
})
