import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { useCartStore } from '~/stores/cart'
import { useStaffOrderStore } from '~/stores/staffOrder'
import { useCashStore } from '~/stores/cash'
import { groupOpenItems, selectionCents } from '~/composables/usePaySelection'
import MenuItem from '~/components/guest/MenuItem.vue'
import CartSummary from '~/components/guest/CartSummary.vue'
import DepositsTable from '~/components/admin/reports/DepositsTable.vue'
import InlineNumberCell from '~/components/admin/InlineNumberCell.vue'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'
import type { TicketDetailItem } from '~/../server/lib/contracts/staff'
import { useCookie } from './setup/imports'

const beer = { id: 'b', nameDe: 'Bier', nameEn: 'Beer', priceCents: 400, depositCents: 200, category: 'Drinks', subcategory: null, station: 'bar', isAvailable: true, sortOrder: 0 } as MenuItemDto

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => vi.unstubAllGlobals())

describe('Deposit in the app', () => {
  it('adds the deposit to cart and pad totals and shows it', async () => {
    const cart = useCartStore()
    cart.add(beer)
    cart.add(beer)
    expect(cart.totalCents).toBe(1200)
    expect(cart.depositCents).toBe(400)
    const w = mount(CartSummary, { props: {} })
    await w.find('[data-test="cart-toggle"]').trigger('click')
    expect(w.find('[data-test="cart-deposit"]').text()).toMatch(/4[,.]00/)
    const pad = useStaffOrderStore()
    pad.add(beer)
    expect(pad.totalCents).toBe(600)
    expect(mount(MenuItem, { props: { item: beer } }).find('[data-test="menu-deposit"]').exists()).toBe(true)
    expect(mount(MenuItem, { props: { item: { ...beer, depositCents: 0 } } }).find('[data-test="menu-deposit"]').exists()).toBe(false)
  })

  it('cash screen charges price plus deposit per unit', () => {
    const item: TicketDetailItem = { orderItemId: '1', orderId: 'o', menuItemId: 'b', nameDe: 'Bier', nameEn: 'Beer', quantity: 3, unitPriceCents: 400, depositCents: 200, note: null, station: 'bar', productionStatus: 'done', paymentStatus: 'unpaid', served: true, createdAt: '2026-01-01T10:00:00.000Z' }
    const groups = groupOpenItems([item, { ...item, orderItemId: '2', depositCents: 0, quantity: 1 }])
    expect(groups.map((g) => g.unitPriceCents)).toEqual([600, 400])
    expect(selectionCents(groups, { [groups[0]!.key]: 2 })).toBe(1200)
  })

  it('books deposit returns per value and sums what went out', async () => {
    fetchMock.mockResolvedValueOnce({ amountCents: -400 }).mockResolvedValueOnce({ amountCents: -500 })
    const cash = useCashStore()
    expect(await cash.returnDeposit({ 200: 2, 500: 1, 300: 0 })).toBe(-900)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: { unitCents: 200, quantity: 2 } })
  })

  it('reports the deposit balance and edits deposit inline', async () => {
    const rows = [
      { unitCents: 200, issuedQuantity: 10, issuedCents: 2000, returnedQuantity: 4, returnedCents: -800, balanceCents: 1200 },
      { unitCents: 500, issuedQuantity: 2, issuedCents: 1000, returnedQuantity: 0, returnedCents: 0, balanceCents: 1000 },
    ]
    const table = mount(DepositsTable, { props: { rows } })
    expect(table.findAll('[data-test="deposit-row"]')).toHaveLength(2)
    expect(table.text()).toContain('22.00')

    const cell = mount(InlineNumberCell, { props: { value: 200, label: 'Deposit' } })
    await cell.find('[data-test="inline-number"]').trigger('click')
    const input = cell.find('[data-test="inline-number-input"]')
    await input.setValue('abc')
    expect(input.attributes('aria-invalid')).toBe('true')
    await input.setValue('2,50')
    await cell.find('form').trigger('submit')
    expect(cell.emitted('save')).toEqual([[250]])
  })
})
