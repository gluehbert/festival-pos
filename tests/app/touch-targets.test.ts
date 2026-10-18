import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CartSummary from '~/components/guest/CartSummary.vue'
import MenuItem from '~/components/guest/MenuItem.vue'
import ItemRow from '~/components/staff/ItemRow.vue'
import { useCartStore } from '~/stores/cart'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'
import type { TicketDetailItem } from '~/../server/lib/contracts/staff'

const fries = { id: 'f', nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, depositCents: 0, stock: null, category: 'Snacks', station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto

// 44 px is the smallest target a thumb hits reliably (WCAG 2.5.5, Apple HIG).
const big = (cls: string) => /(^|\s)(min-h-\[(4[4-9]|5\d)px\]|h-11|h-12)(\s|$)/.test(cls)

describe('touch targets', () => {
  it('cart and menu buttons are at least 44 px high', async () => {
    useCartStore().add(fries)
    const cart = mount(CartSummary)
    expect(big(cart.find('[data-test="cart-toggle"]').classes().join(' '))).toBe(true)
    await cart.find('[data-test="cart-toggle"]').trigger('click')
    for (const b of cart.findAll('button')) expect(big(b.classes().join(' ')), b.html()).toBe(true)
    const item = mount(MenuItem, { props: { item: fries } })
    expect(big(item.find('button').classes().join(' '))).toBe(true)
  })

  it('void and refund buttons on a ticket line are big enough', () => {
    const line = { orderItemId: 'i', orderId: 'o-1', menuItemId: 'm', nameDe: 'Bier', nameEn: 'Beer', quantity: 1, unitPriceCents: 450, depositCents: 0, paymentStatus: 'unpaid', productionStatus: 'pending', note: null } as unknown as TicketDetailItem
    const w = mount(ItemRow, { props: { item: line, canVoid: true } })
    const buttons = w.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(big(b.classes().join(' '))).toBe(true)
  })
})

describe('clearing the cart', () => {
  it('asks before emptying and can be called off', async () => {
    useCartStore().add(fries)
    const w = mount(CartSummary)
    await w.find('[data-test="cart-toggle"]').trigger('click')
    await w.find('[data-test="cart-clear"]').trigger('click')
    expect(w.emitted('clear')).toBeUndefined()
    expect(w.text()).toContain('guest.cart.clearConfirm')
    await w.find('[data-test="cart-clear-cancel"]').trigger('click')
    expect(w.find('[data-test="cart-clear-confirm"]').exists()).toBe(false)
    await w.find('[data-test="cart-clear"]').trigger('click')
    await w.find('[data-test="cart-clear-confirm"]').trigger('click')
    expect(w.emitted('clear')).toHaveLength(1)
  })
})
