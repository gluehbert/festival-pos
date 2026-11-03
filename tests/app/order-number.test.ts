import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OrderConfirmation from '~/components/guest/OrderConfirmation.vue'
import OrderCard from '~/components/production/OrderCard.vue'
import ItemRow from '~/components/staff/ItemRow.vue'
import { shortOrderNo } from '~/utils/order-number'
import type { TicketDetailItem } from '~/../server/lib/contracts/staff'
import type { ProductionOrderGroup } from '~/stores/production'

const ORDER_ID = '0b7c2f1e-4d3a-4c8e-9f21-a1b2c33fa9c2'

describe('shortOrderNo', () => {
  it('takes the last six characters in upper case', () => {
    expect(shortOrderNo(ORDER_ID)).toBe('3FA9C2')
    expect(shortOrderNo('ab-cd')).toBe('ABCD')
  })
})

describe('the same short number everywhere', () => {
  it('guest confirmation, kitchen card and service line show it', () => {
    const guest = mount(OrderConfirmation, { props: { order: { orderId: ORDER_ID, tableBalanceCents: 0, items: [] } as never } })
    expect(guest.find('[data-test="order-number"]').text()).toBe('#3FA9C2')
    expect(guest.text()).not.toContain(ORDER_ID)

    const group = { key: 'table:4', orderIds: [ORDER_ID], tableNo: 4, orderKind: 'guest', orderedAt: new Date().toISOString(), items: [] } as unknown as ProductionOrderGroup
    const card = mount(OrderCard, { props: { group, busyIds: new Set<string>() } })
    expect(card.find('[data-test="order-number"]').text()).toContain('"no":"3FA9C2"')

    const item = { orderItemId: 'i', orderId: ORDER_ID, menuItemId: 'm', nameDe: 'Bier', nameEn: 'Beer', quantity: 1, unitPriceCents: 450, depositCents: 0, paymentStatus: 'unpaid', productionStatus: 'pending', note: null } as unknown as TicketDetailItem
    const row = mount(ItemRow, { props: { item } })
    expect(row.find('[data-test="order-number"]').text()).toContain('"no":"3FA9C2"')
  })
})
