import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useCartStore } from '~/stores/cart'
import { useStaffOrderStore } from '~/stores/staffOrder'
import { groupOpenItems } from '~/composables/usePaySelection'
import { toOrderItems } from '~/utils/order-lines'
import CartSummary from '~/components/guest/CartSummary.vue'
import NoteBadge from '~/components/common/NoteBadge.vue'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'
import type { TicketDetailItem } from '~/../server/lib/contracts/staff'

const burger = { id: 'b', nameDe: 'Burger', nameEn: 'Burger', priceCents: 800, category: 'Food', subcategory: null, station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto

describe('notes on cart and pad lines', () => {
  it('a noted line stays apart; tapping the article again adds a line without note', () => {
    const cart = useCartStore()
    cart.add(burger)
    cart.setNote(cart.lines[0]!.key, '  no onions ')
    cart.add(burger)
    cart.add(burger)
    expect(cart.lines.map((l) => [l.quantity, l.note])).toEqual([[1, 'no onions'], [2, '']])
    expect(cart.qtyOf('b')).toBe(3)
    expect(toOrderItems(cart.lines)).toEqual([
      { menuItemId: 'b', quantity: 1, note: 'no onions' },
      { menuItemId: 'b', quantity: 2 },
    ])
  })

  it('keeps notes across a reload and restores carts saved before notes existed', () => {
    const cart = useCartStore()
    cart.setTable(7)
    cart.add(burger)
    cart.setNote(cart.lines[0]!.key, 'no pickles')
    cart.add(burger)
    // A reload: fresh store state, cart comes back from storage.
    setActivePinia(createPinia())
    const again = useCartStore()
    again.setTable(7)
    again.restore()
    expect(again.lines.map((l) => [l.quantity, l.note])).toEqual([[1, 'no pickles'], [1, '']])
    expect(new Set(again.lines.map((l) => l.key)).size).toBe(2)

    localStorage.setItem('guest-cart:8', JSON.stringify([{ menuItem: burger, quantity: 2 }]))
    again.setTable(8)
    again.restore()
    expect(again.lines.map((l) => [l.quantity, l.note])).toEqual([[2, '']])
    again.add(burger)
    expect(again.lines.map((l) => l.quantity)).toEqual([3])
  })

  it('merges lines that end up with the same note and trims notes to 80 characters', () => {
    const cart = useCartStore()
    cart.add(burger)
    cart.setNote(cart.lines[0]!.key, 'Ketchup')
    cart.add(burger)
    cart.setNote(cart.lines[1]!.key, 'Ketchup')
    expect(cart.lines.map((l) => [l.quantity, l.note])).toEqual([[2, 'Ketchup']])
    cart.setNote(cart.lines[0]!.key, 'x'.repeat(120))
    expect(cart.lines[0]!.note).toHaveLength(80)
  })

  it('menu − on the pad takes from the line without note first', () => {
    const pad = useStaffOrderStore()
    pad.add(burger)
    pad.setNote(pad.lines[0]!.key, 'medium')
    pad.setQty('b', 3, burger)
    expect(pad.lines.map((l) => [l.quantity, l.note])).toEqual([[1, 'medium'], [2, '']])
    pad.setQty('b', 1)
    expect(pad.lines.map((l) => [l.quantity, l.note])).toEqual([[1, 'medium']])
    pad.setQty('b', 0)
    expect(pad.isEmpty).toBe(true)
  })

  it('edits a note in the cart', async () => {
    const cart = useCartStore()
    cart.add(burger)
    const w = mount(CartSummary, { props: {} })
    await w.find('[data-test="cart-toggle"]').trigger('click')
    await w.find('[data-test="line-note"]').trigger('click')
    const input = w.find('[data-test="line-note-input"]')
    expect(input.attributes('maxlength')).toBe('80')
    await input.setValue('no pickles')
    await w.find('form').trigger('submit')
    expect(cart.lines[0]!.note).toBe('no pickles')
  })

  it('cash screen keeps positions with different notes in separate rows; badge shows the note', () => {
    const base = { orderId: 'o', menuItemId: 'b', nameDe: 'Burger', nameEn: 'Burger', quantity: 1, unitPriceCents: 800, station: 'kitchen', productionStatus: 'done', paymentStatus: 'unpaid', served: false, createdAt: '2026-01-01T10:00:00.000Z' } as const
    const items: TicketDetailItem[] = [
      { ...base, orderItemId: '1', note: null },
      { ...base, orderItemId: '2', note: 'no onions' },
      { ...base, orderItemId: '3', note: null },
    ]
    expect(groupOpenItems(items).map((g) => [g.openQuantity, g.sample.note])).toEqual([[2, null], [1, 'no onions']])
    expect(mount(NoteBadge, { props: { note: 'no onions', large: true } }).text()).toContain('no onions')
    expect(mount(NoteBadge, { props: { note: null } }).find('[data-test="note-badge"]').exists()).toBe(false)
  })
})
