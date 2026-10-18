import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CartSummary from '~/components/guest/CartSummary.vue'
import { useCartStore } from '~/stores/cart'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'

const base = { depositCents: 0, stock: null, subcategory: null, isAvailable: true, sortOrder: 0, allergens: null, diet: null, category: 'Food' }
const fries = { ...base, id: 'f', nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, station: 'kitchen' } as MenuItemDto
const beer = { ...base, id: 'b', nameDe: 'Bier', nameEn: 'Beer', priceCents: 400, depositCents: 200, station: 'bar', category: 'Drinks' } as MenuItemDto

async function openCart() {
  const w = mount(CartSummary, { props: {} })
  await w.find('[data-test="cart-toggle"]').trigger('click')
  return w
}

describe('cart sheet', () => {
  it('shows unit price and line total per line', async () => {
    const cart = useCartStore()
    cart.add(fries)
    cart.add(fries)
    const w = await openCart()
    expect(w.find('[data-test="cart-unit"]').text()).toMatch(/2 × €3\.50/)
    expect(w.find('[data-test="cart-line-total"]').text()).toMatch(/7[,.]00/)
  })

  it('turns − into a remove button at quantity 1', async () => {
    const cart = useCartStore()
    cart.add(fries)
    cart.add(fries)
    const w = await openCart()
    const dec = () => w.find('[data-test="cart-decrease"]')
    expect(dec().attributes('aria-label')).toBe('guest.cart.decrease')
    await dec().trigger('click')
    expect(dec().attributes('aria-label')).toBe('guest.cart.remove')
    expect(dec().find('[data-icon="i-lucide-trash-2"]').exists()).toBe(true)
    await dec().trigger('click')
    expect(cart.isEmpty).toBe(true)
  })

  it('groups food and drinks only when both are in the cart', async () => {
    const cart = useCartStore()
    cart.add(fries)
    const w = await openCart()
    expect(w.find('[data-test="cart-group-title"]').exists()).toBe(false)
    cart.add(beer)
    await w.vm.$nextTick()
    expect(w.findAll('[data-test="cart-group-title"]').map((h) => h.text())).toEqual(['guest.cart.group.kitchen', 'guest.cart.group.bar'])
  })

  it('splits subtotal and deposit, and puts the total on the order button', async () => {
    const cart = useCartStore()
    cart.add(beer)
    cart.add(fries)
    const w = await openCart()
    expect(w.text()).toContain('guest.cart.subtotal')
    expect(w.find('[data-test="cart-deposit-each"]').text()).toContain('guest.cart.depositEach')
    expect(w.find('[data-test="cart-deposit"]').text()).toMatch(/2[,.]00/)
    expect(w.find('[data-test="cart-total"]').text()).toMatch(/9[,.]50/)
    expect(w.find('[data-test="cart-submit"]').text()).toMatch(/guest\.cart\.submit · €9\.50/)
    cart.setLineQuantity(cart.lines[0]!.key, 0)
    await w.vm.$nextTick()
    expect(w.text()).not.toContain('guest.cart.subtotal')
  })

  it('names the table and the item count in the header', async () => {
    const cart = useCartStore()
    cart.setTable(12)
    cart.add(fries)
    const w = await openCart()
    expect(w.find('[data-test="cart-meta"]').text()).toContain('guest.page.kicker:{"table":12}')
    expect(w.find('[data-test="cart-grip"]').exists()).toBe(true)
  })

  it('shows the diet tag, warns on low stock and stops + at the stock', async () => {
    const cart = useCartStore()
    const veggie = { ...fries, diet: 'vegan', stock: 2 } as MenuItemDto
    cart.add(veggie)
    const w = await openCart()
    expect(w.find('[data-test="cart-diet"]').text()).toBe('common.allergens.diet.vegan')
    expect(w.find('[data-test="cart-low-stock"]').exists()).toBe(true)
    const inc = () => w.find('[data-test="cart-increase"]')
    expect(inc().attributes('disabled')).toBeUndefined()
    await inc().trigger('click')
    expect(inc().attributes('disabled')).toBeDefined()
  })

  it('bumps the floating bar when an item is added', async () => {
    const cart = useCartStore()
    cart.add(fries)
    const w = mount(CartSummary, { props: {} })
    cart.add(fries)
    await w.vm.$nextTick()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    await w.vm.$nextTick()
    expect(w.find('[data-test="cart-toggle"]').classes()).toContain('cart-bump')
  })
})
