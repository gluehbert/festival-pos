import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import LanesView from '~/components/production/LanesView.vue'
import type { ProductionOrderGroup } from '~/stores/production'
import type { ProductionLane, ProductionQueueItem } from '~/../server/lib/contracts/production'

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
const lanes: ProductionLane[] = [{ lane: 1, key: 'F9', groupKey: 'table:12' }, { lane: 2, key: 'F10', groupKey: 'table:7' }]

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
    const free: ProductionLane[] = [{ lane: 1, key: 'F9', groupKey: 'table:12' }, { lane: 2, key: 'F10', groupKey: null }]
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
})
