import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProductionStore } from '~/stores/production'
import type { ProductionQueueItem } from '~/../server/lib/contracts/production'
import { useCookie } from './setup/imports'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => vi.unstubAllGlobals())

const item = (id: string, orderId = 'o1', over: Partial<ProductionQueueItem> = {}): ProductionQueueItem => ({
  orderItemId: id, orderId, tableNo: 4, orderKind: 'guest', nameDe: 'Pommes', nameEn: 'Fries', quantity: 1,
  note: null, productionStatus: 'in_progress', orderedAt: `2026-06-01T18:0${id.charCodeAt(0) % 10}:00Z`, ...over,
})
const queue = (...items: ProductionQueueItem[]) => ({ station: 'kitchen', items })

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('production store — polling race and undo', () => {
  it('a poll that was running while "Fertig" was tapped does not bring the item back', async () => {
    const s = useProductionStore()
    fetchMock.mockResolvedValueOnce(queue(item('a'), item('b', 'o2')))
    await s.fetchQueue()

    // Poll starts, then the item is finished before the (stale) answer arrives.
    const stale = deferred<unknown>()
    fetchMock.mockReturnValueOnce(stale.promise)
    const polling = s.fetchQueue()
    fetchMock.mockResolvedValueOnce({})
    await s.advance('a', 'done')
    stale.resolve(queue(item('a'), item('b', 'o2')))
    await polling
    expect(s.queue.map((i) => i.orderItemId)).toEqual(['b'])

    // The next poll (started after the change) is the truth again.
    fetchMock.mockResolvedValueOnce(queue(item('b', 'o2')))
    await s.fetchQueue()
    expect(s.queue.map((i) => i.orderItemId)).toEqual(['b'])
    fetchMock.mockResolvedValueOnce(queue(item('a'), item('b', 'o2')))
    await s.fetchQueue()
    expect(s.queue.map((i) => i.orderItemId)).toEqual(['a', 'b'])
  })

  it('keeps an optimistic "in progress" against a stale poll', async () => {
    const s = useProductionStore()
    fetchMock.mockResolvedValueOnce(queue(item('a', 'o1', { productionStatus: 'pending' })))
    await s.fetchQueue()
    const stale = deferred<unknown>()
    fetchMock.mockReturnValueOnce(stale.promise)
    const polling = s.fetchQueue()
    fetchMock.mockResolvedValueOnce({})
    await s.advance('a', 'in_progress')
    stale.resolve(queue(item('a', 'o1', { productionStatus: 'pending' })))
    await polling
    expect(s.queue[0]!.productionStatus).toBe('in_progress')
  })

  it('finishOrder returns the finished items, undoDone brings them back in progress', async () => {
    const s = useProductionStore()
    fetchMock.mockResolvedValueOnce(queue(item('a'), item('b'), item('c', 'o2')))
    await s.fetchQueue()
    fetchMock.mockResolvedValueOnce({ orderId: 'o1', doneItemIds: ['a', 'b'] })
    const done = await s.finishOrder('o1')
    expect(done.map((i) => i.orderItemId)).toEqual(['a', 'b'])
    expect(s.queue.map((i) => i.orderItemId)).toEqual(['c'])

    // A poll that started before the undo still lacks a and b.
    const stale = deferred<unknown>()
    fetchMock.mockReturnValueOnce(stale.promise)
    const polling = s.fetchQueue()
    fetchMock.mockResolvedValue({})
    await s.undoDone(done)
    const patches = fetchMock.mock.calls.filter((c) => (c[1] as { method?: string })?.method === 'PATCH')
    expect(patches.map((c) => [c[0], (c[1] as { body: unknown }).body])).toEqual([
      ['/api/production/items/a', { nextStatus: 'in_progress' }],
      ['/api/production/items/b', { nextStatus: 'in_progress' }],
    ])
    stale.resolve(queue(item('c', 'o2')))
    await polling
    expect(s.queue.map((i) => [i.orderItemId, i.productionStatus])).toEqual([['a', 'in_progress'], ['b', 'in_progress'], ['c', 'in_progress']])
  })

  it('an undo the server refuses (already served) keeps the item away and reports it', async () => {
    const s = useProductionStore()
    fetchMock.mockResolvedValueOnce(queue(item('a')))
    await s.fetchQueue()
    fetchMock.mockResolvedValueOnce({})
    await s.advance('a', 'done')
    fetchMock.mockRejectedValueOnce({ statusCode: 409, data: { code: 'ALREADY_SERVED' } })
    await expect(s.undoDone([item('a')])).rejects.toMatchObject({ statusCode: 409 })
    expect(s.queue).toEqual([])
  })
})
