import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import LanesView from '~/components/production/LanesView.vue'
import type { ProductionQueueItem } from '~/../server/lib/contracts/production'

// The screen is too small for the order even in the smallest type.
vi.mock('~/utils/fit-text', () => ({ fitText: () => false }))

const item: ProductionQueueItem = {
  orderItemId: crypto.randomUUID(), orderId: crypto.randomUUID(), tableNo: 12, orderKind: 'guest',
  nameDe: 'Pommes', nameEn: 'Fries', quantity: 1, note: null, productionStatus: 'in_progress', orderedAt: '2026-06-01T18:00:00Z',
}

describe('LanesView on a screen too small for the order', () => {
  it('says that not everything is visible', async () => {
    const group = { key: 'table:12', orderIds: [item.orderId], tableNo: 12, orderKind: 'guest' as const, orderedAt: item.orderedAt, items: [item] }
    const w = mount(LanesView, {
      props: { groups: [group], lanes: [{ lane: 1, key: 'F9', groupKey: 'table:12', assignedAt: item.orderedAt }], finishing: new Set<string>() },
      attachTo: document.body,
    })
    await flushPromises()
    expect(w.find('[data-test="lane-cut"]').text()).toBe('production.lanes.cut')
    w.unmount()
  })
})
