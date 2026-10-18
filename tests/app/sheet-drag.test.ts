import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CartSummary from '~/components/guest/CartSummary.vue'
import { useSheetDrag } from '~/composables/useSheetDrag'
import { useCartStore } from '~/stores/cart'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'

const fries = { id: 'f', nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, depositCents: 0, stock: null, category: 'Snacks', station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto
const at = (clientY: number) => ({ clientY, pointerId: 1, currentTarget: null }) as unknown as PointerEvent

function drag(sheet: ReturnType<typeof useSheetDrag>, from: number, to: number) {
  sheet.start(at(from))
  sheet.move(at(to))
  sheet.end()
  sheet.tap() // the click that follows the drag
}

describe('useSheetDrag', () => {
  it('grows on a drag up, shrinks then closes on drags down', () => {
    const close = vi.fn()
    const sheet = useSheetDrag(close)
    drag(sheet, 500, 420)
    expect(sheet.tall.value).toBe(true)
    drag(sheet, 300, 400)
    expect(sheet.tall.value).toBe(false)
    expect(close).not.toHaveBeenCalled()
    drag(sheet, 300, 400)
    expect(close).toHaveBeenCalledOnce()
  })

  it('springs back on a short drag and follows the finger only downward', () => {
    const close = vi.fn()
    const sheet = useSheetDrag(close)
    sheet.start(at(500))
    sheet.move(at(540))
    expect(sheet.style.value.transform).toBe('translateY(40px)')
    expect(sheet.style.value.transition).toBe('none')
    sheet.move(at(450))
    expect(sheet.style.value.transform).toBeUndefined()
    sheet.move(at(530))
    sheet.end()
    sheet.tap()
    expect(close).not.toHaveBeenCalled()
    expect(sheet.tall.value).toBe(false)
    expect(sheet.style.value.transform).toBeUndefined()
  })

  it('a cancelled gesture changes nothing; a tap toggles the size', () => {
    const close = vi.fn()
    const sheet = useSheetDrag(close)
    sheet.start(at(300))
    sheet.move(at(500))
    sheet.cancel()
    sheet.end()
    expect(close).not.toHaveBeenCalled()
    sheet.tap()
    expect(sheet.tall.value).toBe(true)
    sheet.tap()
    expect(sheet.tall.value).toBe(false)
  })
})

describe('cart sheet grip', () => {
  it('taps to a taller list and closes on a swipe down', async () => {
    useCartStore().add(fries)
    const w = mount(CartSummary, { props: {} })
    await w.find('[data-test="cart-toggle"]').trigger('click')
    const grip = () => w.find('[data-test="cart-grip"]')
    expect(grip().attributes('aria-label')).toBe('guest.cart.grow')
    await grip().trigger('click')
    // Tall fills the screen, the list takes the rest; the grip stays in view.
    expect(w.find('aside').classes()).toEqual(expect.arrayContaining(['h-[calc(100dvh-1rem)]', 'max-h-[calc(100dvh-1rem)]']))
    expect(w.find('[data-test="cart-list"]').classes()).not.toContain('max-h-[55vh]')
    expect(grip().attributes('aria-label')).toBe('guest.cart.shrink')
    await grip().trigger('pointerdown', { clientY: 300 })
    await grip().trigger('pointermove', { clientY: 420 })
    await grip().trigger('pointerup')
    expect(w.find('[data-test="cart-list"]').classes()).toContain('max-h-[55vh]')
    await grip().trigger('pointerdown', { clientY: 300 })
    await grip().trigger('pointermove', { clientY: 420 })
    await grip().trigger('pointerup')
    expect(w.find('aside').exists()).toBe(false)
    // Opened again it starts at the normal size.
    await w.find('[data-test="cart-toggle"]').trigger('click')
    expect(w.find('[data-test="cart-list"]').classes()).toContain('max-h-[55vh]')
    w.unmount()
  })
})

describe('page behind the cart sheet', () => {
  it('does not scroll while the sheet is open, so the browser bar stays put', async () => {
    useCartStore().add(fries)
    const w = mount(CartSummary, { props: {} })
    expect(document.documentElement.style.overflow).toBe('')
    await w.find('[data-test="cart-toggle"]').trigger('click')
    expect(document.documentElement.style.overflow).toBe('hidden')
    // The list keeps its scroll to itself at its ends.
    expect(w.find('[data-test="cart-list"]').classes()).toContain('overscroll-contain')
    await w.find('[data-test="cart-close"]').trigger('click')
    expect(document.documentElement.style.overflow).toBe('')
    await w.find('[data-test="cart-toggle"]').trigger('click')
    w.unmount()
    expect(document.documentElement.style.overflow).toBe('')
  })
})
