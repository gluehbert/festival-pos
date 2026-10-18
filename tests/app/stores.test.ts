import { describe, expect, it } from 'vitest'
import { useCartStore } from '~/stores/cart'
import { homeForRole } from '~/stores/auth'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'

const fries = { id: 'f', nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, category: 'Snacks', station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto
const beer = { ...fries, id: 'b', nameDe: 'Bier', nameEn: 'Beer', priceCents: 450, station: 'bar' } as MenuItemDto

describe('cart store', () => {
  it('adds, merges and totals lines', () => {
    const cart = useCartStore()
    cart.add(fries)
    cart.add(fries)
    cart.add(beer)
    expect(cart.lines.map((l) => [l.menuItem.id, l.quantity])).toEqual([['f', 2], ['b', 1]])
    expect(cart.totalCents).toBe(2 * 350 + 450)
    expect(cart.itemCount).toBe(3)
    expect(cart.isEmpty).toBe(false)
  })

  it('caps quantities at 50, removes on 0, clears on table change', () => {
    const cart = useCartStore()
    cart.setTable(3)
    cart.add(fries)
    cart.setQty('f', 99)
    expect(cart.lines[0]!.quantity).toBe(50)
    for (let i = 0; i < 5; i++) cart.add(fries)
    expect(cart.lines[0]!.quantity).toBe(50)
    cart.setQty('f', 2.7)
    expect(cart.lines[0]!.quantity).toBe(2)
    cart.setQty('f', 0)
    expect(cart.isEmpty).toBe(true)

    cart.add(beer)
    cart.setTable(3)
    expect(cart.isEmpty).toBe(false)
    cart.setTable(4)
    expect(cart.isEmpty).toBe(true)
  })
})

describe('homeForRole', () => {
  it('sends every role to its own screen', () => {
    expect(homeForRole('admin')).toBe('/admin/events')
    expect(homeForRole('kitchen')).toBe('/production')
    expect(homeForRole('bar')).toBe('/production')
    expect(homeForRole('waiter')).toBe('/staff')
    expect(homeForRole(undefined)).toBe('/staff')
  })
})
