import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { useStaffOrderStore } from '~/stores/staffOrder'
import StaffMealsTable from '~/components/admin/reports/StaffMealsTable.vue'
import OrderCard from '~/components/production/OrderCard.vue'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'
import { useCookie } from './setup/imports'

const wurst = { id: 'w', nameDe: 'Wurst', nameEn: 'Sausage', priceCents: 450, depositCents: 0, stock: null, category: 'Food', subcategory: null, station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => vi.unstubAllGlobals())

describe('Staff meals in the app', () => {
  it('sends a staff meal with its reason and shows the goods value', async () => {
    const pad = useStaffOrderStore()
    pad.add(wurst)
    pad.add(wurst)
    expect(pad.valueCents).toBe(900)
    fetchMock.mockResolvedValueOnce({ orderId: 'o1', tableNo: 0, items: [], tableBalanceCents: 0 })
    const res = await pad.submit('staff_meal', 0, false, 'Kapelle')
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      body: { tableNo: 0, mode: 'staff_meal', staffMealReason: 'Kapelle', items: [{ menuItemId: 'w', quantity: 2 }] },
    })
    expect(res?.ticketKey).toBe('w-o1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('lists staff meals with total goods value and labels the kitchen card', () => {
    const rows = [
      { menuItemId: 'w', nameDe: 'Wurst', nameEn: 'Sausage', quantity: 6, valueCents: 2700 },
      { menuItemId: 'p', nameDe: 'Pommes', nameEn: 'Fries', quantity: 2, valueCents: 700 },
    ]
    const table = mount(StaffMealsTable, { props: { rows } })
    expect(table.findAll('[data-test="staff-meal-row"]')).toHaveLength(2)
    expect(table.text()).toContain('34.00')

    const card = mount(OrderCard, {
      props: {
        group: { orderId: 'o', tableNo: 0, orderKind: 'staff_meal', orderedAt: new Date().toISOString(), items: [] },
        busyIds: new Set<string>(),
      },
    })
    expect(card.find('h2').text()).toBe('production.staffMeal')
  })
})
