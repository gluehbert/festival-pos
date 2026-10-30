import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { useProductionStore } from '~/stores/production'
import { useTicketsStore } from '~/stores/tickets'
import OrderCard from '~/components/production/OrderCard.vue'
import TicketCard from '~/components/staff/TicketCard.vue'
import type { ProductionQueueItem } from '~/../server/lib/contracts/production'
import type { TicketSummary } from '~/../server/lib/contracts/staff'
import { useCookie } from './setup/imports'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => vi.unstubAllGlobals())

const item = (id: string, orderId: string, at: string, over: Partial<ProductionQueueItem> = {}): ProductionQueueItem => ({
  orderItemId: id,
  orderId,
  tableNo: 8,
  orderKind: 'guest',
  nameDe: 'Pommes',
  nameEn: 'Fries',
  quantity: 2,
  productionStatus: 'pending',
  orderedAt: at,
  ...over,
})

describe('production store — orders', () => {
  it('groups the queue per table, oldest first; counter sales stay one card per order', async () => {
    fetchMock.mockResolvedValueOnce({ station: 'kitchen', lanes: [], items: [
      item('a', 'o1', '2026-06-01T18:00:00Z'),
      item('b', 'o2', '2026-06-01T18:01:00Z', { tableNo: 0, orderKind: 'walkin' }),
      item('c', 'o1', '2026-06-01T18:00:00Z'),
      item('d', 'o3', '2026-06-01T18:02:00Z', { orderKind: 'staff_table' }),
      item('e', 'o4', '2026-06-01T18:03:00Z', { tableNo: 0, orderKind: 'walkin' }),
      item('f', 'o5', '2026-06-01T18:04:00Z', { tableNo: 9 }),
    ] })
    const s = useProductionStore()
    await s.fetchQueue()
    expect(s.groups.map((g) => [g.orderIds, g.items.map((i) => i.orderItemId)])).toEqual([
      [['o1', 'o3'], ['a', 'c', 'd']],
      [['o2'], ['b']],
      [['o4'], ['e']],
      [['o5'], ['f']],
    ])
    expect(s.groups[0]!.orderedAt).toBe('2026-06-01T18:00:00Z')
  })

  it('finishes a whole order optimistically and rolls back on errors', async () => {
    fetchMock.mockResolvedValueOnce({ station: 'kitchen', lanes: [], items: [
      item('a', 'o1', '2026-06-01T18:00:00Z'),
      item('b', 'o2', '2026-06-01T18:01:00Z'),
    ] })
    const s = useProductionStore()
    await s.fetchQueue()

    fetchMock.mockResolvedValueOnce({ orderId: 'o1', doneItemIds: ['a'] })
    await s.finishOrder('o1')
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/production/orders/o1/done')
    expect(s.queue.map((i) => i.orderItemId)).toEqual(['b'])

    fetchMock.mockRejectedValueOnce({ statusCode: 500 })
    await expect(s.finishOrder('o2', 'bar')).rejects.toBeTruthy()
    expect((fetchMock.mock.calls[2]![1] as { body: unknown }).body).toEqual({ station: 'bar' })
    expect(s.queue.map((i) => i.orderItemId)).toEqual(['b'])
  })
})

describe('OrderCard', () => {
  const group = {
    key: 'table:8',
    orderIds: ['o1'],
    tableNo: 8,
    orderKind: 'staff_table' as const,
    orderedAt: new Date(Date.now() - 11 * 60_000).toISOString(),
    items: [item('a', 'o1', ''), item('b', 'o1', '', { productionStatus: 'in_progress', nameDe: 'Bratwurst', nameEn: 'Sausage' })],
  }

  it('lists the items, advances single items and finishes the order', async () => {
    const w = mount(OrderCard, { props: { group, busyIds: new Set<string>() } })
    expect(w.text()).toContain('staff.detail.table')
    expect(w.text()).toContain('2 × Fries')
    expect(w.text()).toContain('2 × Sausage')
    expect(w.find('header span').classes()).toContain('bg-rose-100')
    const buttons = w.findAll('button')
    await buttons[0]!.trigger('click')
    await buttons[1]!.trigger('click')
    await buttons[2]!.trigger('click')
    expect(w.emitted('advance')).toEqual([[['a'], 'in_progress'], [['b'], 'done']])
    expect(w.emitted('finish')).toHaveLength(1)
  })

  it('merges items of the same article, note and status into one line', async () => {
    const items = [
      item('a', 'o1', '', { nameEn: 'Beer' }),
      item('b', 'o1', '', { nameEn: 'Cola', quantity: 1 }),
      item('c', 'o1', '', { nameEn: 'Beer', quantity: 3 }),
      item('d', 'o1', '', { nameEn: 'Cola', quantity: 1, note: 'no ice' }),
      item('e', 'o1', '', { nameEn: 'Beer', productionStatus: 'in_progress' }),
    ]
    const w = mount(OrderCard, { props: { group: { ...group, items }, busyIds: new Set<string>(['c']) } })
    const lines = w.findAll('[data-test="order-line"]')
    expect(lines.map((l) => l.find('p').text())).toEqual(['5 × Beer', '1 × Cola', '1 × Cola', '2 × Beer'])
    expect(lines[3]!.text()).toContain('production.preparing')
    expect(lines[0]!.text()).not.toContain('production.preparing')
    // Busy while any of its items is being saved.
    expect(lines[0]!.find('button').attributes('disabled')).toBeDefined()
    await lines[1]!.find('button').trigger('click')
    await lines[3]!.find('button').trigger('click')
    expect(w.emitted('advance')).toEqual([[['b'], 'in_progress'], [['e'], 'done']])
    await w.setProps({ busyIds: new Set<string>() })
    await w.findAll('[data-test="order-line"]')[0]!.find('button').trigger('click')
    expect(w.emitted('advance')![2]).toEqual([['a', 'c'], 'in_progress'])
  })

  it('lists all order numbers of a table', () => {
    const w = mount(OrderCard, { props: { group: { ...group, orderIds: ['17a888', '9d9096'] }, busyIds: new Set<string>() } })
    expect(w.find('[data-test="order-number"]').text()).toContain('#17A888 · #9D9096')
  })

  it('finishes open items in one tap at the bar', async () => {
    const w = mount(OrderCard, { props: { group, busyIds: new Set<string>(), oneStep: true } })
    const buttons = w.findAll('[data-test="order-line"] button')
    expect(buttons.map((b) => b.text())).toEqual(['production.done', 'production.done'])
    await buttons[0]!.trigger('click')
    expect(w.emitted('advance')).toEqual([[['a'], 'done']])
  })

  it('names counter sales instead of table 0', () => {
    const w = mount(OrderCard, { props: { group: { ...group, tableNo: 0, orderKind: 'walkin' as const }, busyIds: new Set<string>() } })
    expect(w.find('h2').text()).toBe('production.counter')
  })
})

describe('waiter sees what is ready', () => {
  const ticket: TicketSummary = {
    ticketKey: 't-8', tableNo: 8, status: 'open', totalCents: 900, unpaidCents: 900,
    oldestItemAt: new Date().toISOString(), lockedBy: null, ready: { kitchen: 2, bar: 0 },
  }

  it('flags tickets with finished food or drinks', () => {
    const w = mount(TicketCard, { props: { ticket }, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
    expect(w.find('[data-test="ticket-ready"]').text()).toContain('staff.ticket.foodReady')
    expect(w.find('[data-test="ticket-ready"]').text()).not.toContain('staff.ticket.drinksReady')
    const none = mount(TicketCard, {
      props: { ticket: { ...ticket, ready: { kitchen: 0, bar: 0 } } },
      global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } },
    })
    expect(none.find('[data-test="ticket-ready"]').exists()).toBe(false)
  })

  it('marks items as brought', async () => {
    const s = useTicketsStore()
    fetchMock.mockResolvedValueOnce({ ticketKey: 't-8', servedItemIds: ['x'] })
    await expect(s.markServed('t-8')).resolves.toBe(true)
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/tickets/t-8/served')
    fetchMock.mockRejectedValueOnce({ statusCode: 403 })
    await expect(s.markServed('t-8', 'bar')).resolves.toBe(false)
    expect((fetchMock.mock.calls[1]![1] as { body: unknown }).body).toEqual({ station: 'bar' })
  })
})
