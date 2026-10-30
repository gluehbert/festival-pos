import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { useAuthStore } from '~/stores/auth'
import PayPage from '~/pages/staff/[table]/pay.vue'
import { useCookie } from './setup/imports'

const route = vi.hoisted(() => ({ params: { table: '5' }, path: '/staff/5/pay', query: {} as Record<string, string> }))
vi.mock('vue-router', () => ({ useRoute: () => route }))

const fetchMock = vi.fn()
const stubs = { NuxtLink: RouterLinkStub }
const NOW = '2026-10-16T18:00:00.000Z'
const item = (id: string, menuItemId: string, nameDe: string, quantity: number, unitPriceCents: number, paymentStatus: 'paid' | 'unpaid' = 'unpaid') => ({
  orderItemId: `00000000-0000-4000-8000-00000000000${id}`, orderId: '00000000-0000-4000-8000-0000000000aa', menuItemId, nameDe, nameEn: nameDe,
  quantity, unitPriceCents, depositCents: 0, note: null, station: 'bar', productionStatus: 'done', paymentStatus, served: true, createdAt: NOW,
})
const ticket = {
  ticketKey: 't-5', tableNo: 5, status: 'open', totalCents: 1600, unpaidCents: 1200, lockedBy: null, lockExpiresAt: null,
  lastOrderAt: NOW, lastCheckAt: null, assignee: null, serverNow: NOW,
  items: [item('1', 'beer', 'Bier', 2, 400), item('2', 'wurst', 'Wurst', 1, 400), item('3', 'beer', 'Bier', 1, 400, 'paid')],
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
  useAuthStore().staff = { staffId: 's', username: 'anna', role: 'waiter', theme: 'system' }
  fetchMock.mockResolvedValue(ticket)
  route.query = {}
})
afterEach(() => vi.unstubAllGlobals())

describe('cashing up', () => {
  it('starts with everything open selected; "Pay separately" clears it for one guest', async () => {
    const w = mount(PayPage, { global: { stubs } })
    await flushPromises()
    expect(w.get('[data-test="pay-submit"]').text()).toContain('12.00')
    expect(w.text()).toContain('staff.pay.hintAll')
    const split = w.findAll('button').find((b) => b.text() === 'staff.pay.selectNone')!
    await split.trigger('click')
    expect(w.text()).toContain('staff.pay.hint')
    expect(w.text()).not.toContain('staff.pay.hintAll')
    expect(w.get('[data-test="pay-submit"]').attributes('disabled')).toBeDefined()
    // And back to everything.
    await w.findAll('button').find((b) => b.text() === 'staff.pay.selectAll')!.trigger('click')
    expect(w.get('[data-test="pay-submit"]').text()).toContain('12.00')
  })

  it('picks a group by order number: only that order is selected and paid', async () => {
    const other = { ...item('4', 'wurst', 'Wurst', 1, 400), orderId: '00000000-0000-4000-8000-0000000000bb', createdAt: '2026-10-16T18:30:00.000Z' }
    fetchMock.mockResolvedValue({ ...ticket, unpaidCents: 1600, items: [...ticket.items, other] })
    const w = mount(PayPage, { global: { stubs } })
    await flushPromises()
    const orders = w.findAll('[data-test="pay-order"]')
    expect(orders).toHaveLength(2)
    expect(orders[1]!.text()).toContain('#0000BB')
    await orders[1]!.trigger('click')
    expect(orders[1]!.attributes('aria-pressed')).toBe('true')
    expect(w.get('[data-test="pay-submit"]').text()).toContain('4.00')
    // Both orders: everything open again.
    await orders[0]!.trigger('click')
    expect(w.get('[data-test="pay-submit"]').text()).toContain('16.00')
    await orders[0]!.trigger('click')

    const receipt = { paymentId: 'p', eventName: 'Fest', tableNo: 5, lines: [], totalCents: 400, tipCents: 0, depositCents: 0, paidAt: NOW, staffUsername: 'anna' }
    fetchMock.mockResolvedValueOnce({ paymentId: 'p', totalCents: 400, tipCents: 0, ticketStatusAfter: 'paid', receipt })
    w.findComponent({ name: 'PaymentSummary' }).vm.$emit('submit', { givenCents: null, tipCents: 0 })
    await flushPromises()
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/payments')!
    expect((call[1] as { body: { orderItemIds: string[] } }).body.orderItemIds).toEqual([other.orderItemId])
  })

  it('"Cash food" (food prepay) starts with only the food selected', async () => {
    route.query = { food: '1' }
    const items = ticket.items.map((i) => (i.menuItemId === 'wurst' ? { ...i, station: 'kitchen', productionStatus: 'pending', served: false } : i))
    fetchMock.mockResolvedValue({ ...ticket, items })
    const w = mount(PayPage, { global: { stubs } })
    await flushPromises()
    expect(w.get('[data-test="pay-submit"]').text()).toContain('4.00')
    expect(w.text()).toContain('staff.pay.hint')
  })

  it('hides "pay by order" when only one order is open', async () => {
    const w = mount(PayPage, { global: { stubs } })
    await flushPromises()
    expect(w.find('[data-test="pay-order"]').exists()).toBe(false)
  })
})
