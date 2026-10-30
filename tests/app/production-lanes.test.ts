import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import LanesView from '~/components/production/LanesView.vue'
import type { ProductionOrderGroup } from '~/stores/production'
import { LANE_ROUND_MS, productionCards, type ProductionLane, type ProductionQueueItem } from '~/../server/lib/contracts/production'

const item = (tableNo: number, nameEn: string, over: Partial<ProductionQueueItem> = {}): ProductionQueueItem => ({
  orderItemId: crypto.randomUUID(), orderId: crypto.randomUUID(), tableNo, orderKind: 'guest',
  nameDe: nameEn, nameEn, quantity: 1, note: null, productionStatus: 'in_progress', orderedAt: '2026-06-01T18:00:00Z', ...over,
})
const group = (tableNo: number, items: ProductionQueueItem[]): ProductionOrderGroup => ({
  key: `table:${tableNo}`, orderIds: items.map((i) => i.orderId), tableNo, orderKind: 'guest', orderedAt: items[0]!.orderedAt, items,
})

const t12 = group(12, [item(12, 'Lager'), item(12, 'Lager', { quantity: 2 }), item(12, 'Spritz', { note: 'no ice' })])
const t7 = group(7, [item(7, 'Wheat beer')])
const t3 = group(3, [item(3, 'Cola')])
const AT = '2026-06-01T18:00:30Z'
const lanes: ProductionLane[] = [{ lane: 1, key: 'F9', groupKey: 'table:12', assignedAt: AT }, { lane: 2, key: 'F10', groupKey: 'table:7', assignedAt: AT }]

function press(key: string) {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('LanesView', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows each lane\'s card large, with merged lines and notes, and the rest as "next up"', () => {
    const w = mount(LanesView, { props: { groups: [t12, t7, t3], lanes, finishing: new Set<string>() } })
    const one = w.find('[data-test="lane-1"]')
    expect(one.find('[data-test="lane-label"]').text()).toBe('staff.detail.table:{"n":12}')
    expect(one.text()).toContain('3 × Lager')
    expect(one.find('[data-test="note-badge"]').text()).toContain('no ice')
    expect(w.find('[data-test="lane-2"] [data-test="lane-label"]').text()).toBe('staff.detail.table:{"n":7}')
    const next = w.findAll('[data-test="lane-queue-card"]')
    expect(next).toHaveLength(1)
    expect(next[0]!.text()).toContain('1 × Cola')
  })

  it('each buzzer finishes the card of its own lane, named in the toast', () => {
    const w = mount(LanesView, { props: { groups: [t12, t7, t3], lanes, finishing: new Set<string>() }, attachTo: document.body })
    press('F10')
    expect(w.emitted('finish')).toEqual([[t7, true]])
    press('F9')
    expect(w.emitted('finish')).toEqual([[t7, true], [t12, true]])
    w.unmount()
  })

  it('a buzzer does nothing while its card is being finished or its lane is free', () => {
    const free: ProductionLane[] = [{ lane: 1, key: 'F9', groupKey: 'table:12', assignedAt: AT }, { lane: 2, key: 'F10', groupKey: null, assignedAt: null }]
    const w = mount(LanesView, { props: { groups: [t12], lanes: free, finishing: new Set(['table:12']) }, attachTo: document.body })
    expect(w.find('[data-test="lane-2"]').text()).toContain('production.lanes.free')
    press('F9')
    press('F10')
    expect(w.emitted('finish')).toBeUndefined()
    w.unmount()
  })

  it('a tap finishes a lane card or any waiting card without a named toast', async () => {
    const w = mount(LanesView, { props: { groups: [t12, t7, t3], lanes, finishing: new Set<string>() } })
    await w.find('[data-test="lane-queue-card"] button').trigger('click')
    await w.find('[data-test="lane-1"] button').trigger('click')
    expect(w.emitted('finish')).toEqual([[t3, false], [t12, false]])
  })

  it('marks what came in after the lane took the card and keeps it out of the old quantity', () => {
    const late = item(12, 'Lager', { orderedAt: '2026-06-01T18:00:45Z' })
    const card = group(12, [...t12.items, late])
    const w = mount(LanesView, { props: { groups: [card, t7], lanes, finishing: new Set<string>() } })
    expect(w.find('[data-test="lane-1"]').text()).toContain('3 × Lager')
    const added = w.findAll('[data-test="lane-line-new"]')
    expect(added).toHaveLength(1)
    expect(added[0]!.text()).toContain('production.lanes.new')
    expect(added[0]!.text()).toContain('1 × Lager')
  })

  it('tags a later round of a table and previews a long waiting order', () => {
    const later = { ...group(12, ['A', 'B', 'C', 'D', 'E'].map((n) => item(12, n, { orderedAt: '2026-06-01T18:05:00Z' }))), key: 'table:12:later' }
    const w = mount(LanesView, { props: { groups: [t12, t7, later], lanes, finishing: new Set<string>() } })
    expect(w.find('[data-test="lane-1"] [data-test="follow-up"]').exists()).toBe(false)
    const card = w.find('[data-test="lane-queue-card"]')
    expect(card.find('[data-test="follow-up"]').text()).toBe('production.lanes.followUp')
    expect(card.text()).toContain('1 × C')
    expect(card.text()).not.toContain('1 × D')
    expect(card.text()).toContain('production.lanes.more:{"n":2}')
  })
})

describe('productionCards', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 5, 1, 18, 0, s)).toISOString()
  const first = item(12, 'Lager', { orderedAt: at(0) })
  const sameOrder = { ...item(12, 'Cola', { orderedAt: at(0) }), orderId: first.orderId }
  const soon = item(12, 'Spritz', { orderedAt: at(55) })
  const later = item(12, 'Water', { orderedAt: new Date(Date.parse(at(0)) + LANE_ROUND_MS + 1000).toISOString() })
  const counter = item(0, 'Lager', { orderKind: 'walkin', orderedAt: at(1) })

  it('keeps all rounds of a table together without lanes', () => {
    expect(productionCards([first, sameOrder, counter, soon, later]).map((c) => c.items.length)).toEqual([4, 1])
  })

  it('with lanes, only orders within a minute of the first join its card', () => {
    const cards = productionCards([first, sameOrder, counter, soon, later], LANE_ROUND_MS)
    expect(cards.map((c) => c.items.map((i) => i.nameEn))).toEqual([['Lager', 'Cola', 'Spritz'], ['Lager'], ['Water']])
    expect(cards[0]!.key).toBe(`table:12:${first.orderId}`)
    expect(cards[2]!.key).toBe(`table:12:${later.orderId}`)
  })
})
