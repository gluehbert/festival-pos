import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { useStaffOrderStore } from '~/stores/staffOrder'
import { buildPayRequest, countsForOrders, groupOpenItems, openOrders, selectionCents } from '~/composables/usePaySelection'
import PayGroupRow from '~/components/staff/PayGroupRow.vue'
import PaymentSummary from '~/components/staff/PaymentSummary.vue'
import type { TicketDetailItem } from '~/../server/lib/contracts/staff'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'
import { sendBlock } from '~/utils/send-block'
import { useCookie } from './setup/imports'

const BEER = '00000000-0000-4000-8000-000000000001'
const WURST = '00000000-0000-4000-8000-000000000002'

function line(id: string, menuItemId: string, quantity: number, at: string, extra: Partial<TicketDetailItem> = {}): TicketDetailItem {
  return {
    orderItemId: id,
    orderId: 'o',
    menuItemId,
    nameDe: menuItemId === BEER ? 'Bier' : 'Currywurst',
    nameEn: menuItemId === BEER ? 'Beer' : 'Curry sausage',
    quantity,
    unitPriceCents: menuItemId === BEER ? 400 : 550,
    station: menuItemId === BEER ? 'bar' : 'kitchen',
    productionStatus: 'done',
    paymentStatus: 'unpaid',
    createdAt: at,
    ...extra,
  }
}

describe('pay selection', () => {
  const items = [
    line('b2', BEER, 3, '2026-06-01T18:10:00Z'),
    line('b1', BEER, 1, '2026-06-01T18:00:00Z'),
    line('w1', WURST, 2, '2026-06-01T18:05:00Z'),
    line('paid', BEER, 1, '2026-06-01T17:00:00Z', { paymentStatus: 'paid' }),
    line('void', WURST, 1, '2026-06-01T17:00:00Z', { productionStatus: 'cancelled' }),
  ]

  it('groups open lines per article, oldest line first', () => {
    const groups = groupOpenItems(items)
    expect(groups.map((g) => [g.sample.nameDe, g.openQuantity])).toEqual([['Bier', 4], ['Currywurst', 2]])
    expect(groups[0]!.lines.map((l) => l.orderItemId)).toEqual(['b1', 'b2'])
  })

  it('spreads "2 beers and 1 sausage" over the lines', () => {
    const groups = groupOpenItems(items)
    const counts = { [groups[0]!.key]: 2, [groups[1]!.key]: 1 }
    expect(buildPayRequest(groups, counts)).toEqual({
      orderItemIds: ['b1', 'b2', 'w1'],
      quantities: { b1: 1, b2: 1, w1: 1 },
    })
    expect(selectionCents(groups, counts)).toBe(2 * 400 + 550)
  })

  it('pay by order: lists open orders oldest first and pays exactly their lines', () => {
    const groups = groupOpenItems([
      line('a1', BEER, 2, '2026-06-01T18:00:00Z', { orderId: 'oa' }),
      line('b1', BEER, 1, '2026-06-01T18:05:00Z', { orderId: 'ob' }),
      line('b2', WURST, 1, '2026-06-01T18:05:00Z', { orderId: 'ob' }),
      line('paid', BEER, 1, '2026-06-01T17:00:00Z', { orderId: 'oc', paymentStatus: 'paid' }),
    ])
    expect(openOrders(groups).map((o) => [o.orderId, o.openCents, o.lines.map((l) => l.orderItemId)])).toEqual([
      ['oa', 800, ['a1']],
      ['ob', 950, ['b1', 'b2']],
    ])
    const chosen = new Set(['ob'])
    const counts = countsForOrders(groups, chosen)
    expect(counts).toEqual({ [groups[0]!.key]: 1, [groups[1]!.key]: 1 })
    // Without the chosen order the oldest beer (order oa) would be taken.
    expect(buildPayRequest(groups, counts).orderItemIds).toEqual(['a1', 'b2'])
    expect(buildPayRequest(groups, counts, chosen)).toEqual({ orderItemIds: ['b1', 'b2'], quantities: { b1: 1, b2: 1 } })
  })

  it('never pays more than is open', () => {
    const groups = groupOpenItems(items)
    expect(buildPayRequest(groups, { [groups[1]!.key]: 9 }).quantities).toEqual({ w1: 2 })
    expect(buildPayRequest(groups, {})).toEqual({ orderItemIds: [], quantities: {} })
  })

  it('steps a group up and down, all/none', async () => {
    const group = groupOpenItems(items)[0]!
    const w = mount(PayGroupRow, { props: { group, count: 0 } })
    const buttons = w.findAll('button')
    await buttons[1]!.trigger('click') // +
    await buttons[2]!.trigger('click') // all
    expect(w.emitted('update')).toEqual([[1], [4]])
    await w.setProps({ count: 4 })
    // The row carries its own padding, so the highlight reaches the edges of the list.
    expect(w.find('li').classes()).toEqual(expect.arrayContaining(['bg-emerald-50', 'px-2']))
    await w.findAll('button')[2]!.trigger('click') // none
    expect(w.emitted('update')!.at(-1)).toEqual([0])
  })

  it('computes change from the amount given', async () => {
    const w = mount(PaymentSummary, { props: { selectedCents: 1350, totalCents: 3000 } })
    await w.find('[data-test="pay-given"]').setValue('20')
    expect(w.find('[data-test="pay-change"]').text()).toContain('6.50')
    await w.find('[data-test="pay-given"]').setValue('10')
    expect(w.find('[data-test="pay-change"]').exists()).toBe(false)
  })
})

const fetchMock = vi.fn()
const menuItem = (id: string, priceCents: number): MenuItemDto => ({
  id, nameDe: 'X', nameEn: 'X', priceCents, category: 'c', station: 'bar', isAvailable: true, sortOrder: 0,
})

describe('staff order store', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('collects items and sends a table order with a stable idempotency key', async () => {
    const pad = useStaffOrderStore()
    pad.add(menuItem(BEER, 400))
    pad.add(menuItem(BEER, 400))
    pad.add(menuItem(WURST, 550))
    pad.setQty(WURST, 0)
    expect(pad.totalCents).toBe(800)
    expect(pad.itemCount).toBe(2)

    fetchMock.mockRejectedValueOnce({ statusCode: 400, data: { message: 'offline' } })
    await expect(pad.submit('staff_table', 12)).resolves.toBeNull()
    expect(pad.error).toBe('offline')
    expect(pad.isEmpty).toBe(false)

    fetchMock.mockResolvedValueOnce({ orderId: 'o1', tableNo: 12, items: [], tableBalanceCents: 800 })
    const res = await pad.submit('staff_table', 12)
    expect(res).toMatchObject({ ticketKey: 't-12', paid: null })
    const [first, second] = fetchMock.mock.calls.map((c) => c[1] as { body: unknown; headers: Record<string, string> })
    expect(second!.body).toEqual({ tableNo: 12, mode: 'staff_table', items: [{ menuItemId: BEER, quantity: 2 }] })
    expect(second!.headers['idempotency-key']).toBe(first!.headers['idempotency-key'])
    expect(pad.isEmpty).toBe(true)
  })

  it('walk-in with pay now cashes all items right after ordering', async () => {
    const pad = useStaffOrderStore()
    pad.add(menuItem(BEER, 400))
    fetchMock
      .mockResolvedValueOnce({ orderId: 'o2', tableNo: 0, items: [{ orderItemId: 'i1' }], tableBalanceCents: 0 })
      .mockResolvedValueOnce({ paymentId: 'p', totalCents: 400, ticketStatusAfter: 'paid' })
    const res = await pad.submit('walkin', 0, true)
    expect(res?.paid?.totalCents).toBe(400)
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/payments')
    expect((fetchMock.mock.calls[1]![1] as { body: unknown }).body).toEqual({ ticketKey: 'w-o2', orderItemIds: ['i1'] })
  })

  it('keeps the order when paying right away fails', async () => {
    const pad = useStaffOrderStore()
    pad.add(menuItem(BEER, 400))
    fetchMock
      .mockResolvedValueOnce({ orderId: 'o3', tableNo: 0, items: [{ orderItemId: 'i1' }], tableBalanceCents: 0 })
      .mockRejectedValueOnce({ statusCode: 409 })
    const res = await pad.submit('walkin', 0, true)
    expect(res).toMatchObject({ ticketKey: 'w-o3', paid: null })
    expect(pad.error).toBe('pay_failed')
  })
})

describe('send block reason', () => {
  it('tells why the pad cannot be sent yet', () => {
    const ok = { empty: false, tableValid: true, mealValid: true }
    expect(sendBlock(ok)).toBeNull()
    expect(sendBlock({ ...ok, tableValid: false })).toBe('table')
    expect(sendBlock({ ...ok, mealValid: false })).toBe('mealReason')
    // An empty pad is obvious from the summary, no extra hint needed.
    expect(sendBlock({ ...ok, empty: true, tableValid: false })).toBe('empty')
  })
})

describe('staff order store retry', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('sends once after two lost tries and keeps pad changes made meanwhile', async () => {
    const pad = useStaffOrderStore()
    pad.add(menuItem(BEER, 400))
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ orderId: 'o1', tableNo: 4, items: [], tableBalanceCents: 400 })
    const p = pad.submit('staff_table', 4)
    await vi.advanceTimersByTimeAsync(1000)
    expect(pad.sending).toEqual({ attempt: 1, max: 4 })
    // Another beer while the send is waiting: belongs to the next order.
    pad.add(menuItem(BEER, 400))
    await vi.advanceTimersByTimeAsync(2000)
    await expect(p).resolves.toMatchObject({ ticketKey: 't-4' })
    const keys = fetchMock.mock.calls.map((c) => (c[1] as { headers: Record<string, string> }).headers['idempotency-key'])
    expect(new Set(keys).size).toBe(1)
    expect(pad.itemCount).toBe(1)
    expect(pad.sending).toBeNull()
  })

  it('gives up after four retries and keeps the pad and the key', async () => {
    const pad = useStaffOrderStore()
    pad.add(menuItem(BEER, 400))
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const p = pad.submit('staff_table', 4)
    await vi.advanceTimersByTimeAsync(16000)
    await expect(p).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(pad.isEmpty).toBe(false)
    expect(pad.error).toBe('order_failed')
  })
})
