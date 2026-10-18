import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { useProductionStore } from '~/stores/production'
import { useTicketsStore } from '~/stores/tickets'
import { usePolling } from '~/composables/usePolling'
import { createIncreaseTracker, createSeenTracker } from '~/utils/arrivals'
import StaleBanner from '~/components/common/StaleBanner.vue'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('polling stores report failed syncs', () => {
  it('production: throws, flags the queue as outdated and keeps the last data', async () => {
    const s = useProductionStore()
    fetchMock.mockResolvedValueOnce({ station: 'kitchen', items: [{ orderItemId: 'a' }] })
    await s.fetchQueue()
    expect(s.syncFailed).toBe(false)
    const at = s.lastSyncAt
    expect(at).toEqual(expect.any(Number))

    fetchMock.mockRejectedValueOnce(new Error('timeout'))
    await expect(s.fetchQueue()).rejects.toThrow('timeout')
    expect(s.syncFailed).toBe(true)
    expect(s.lastSyncAt).toBe(at)
    expect(s.queue).toHaveLength(1)

    fetchMock.mockResolvedValueOnce({ station: 'kitchen', items: [] })
    await s.fetchQueue()
    expect(s.syncFailed).toBe(false)
  })

  it('tickets: the list throws; a failed reload of the detail keeps the ticket', async () => {
    const s = useTicketsStore()
    fetchMock.mockRejectedValueOnce(new Error('down'))
    await expect(s.refresh()).rejects.toThrow('down')
    expect(s.syncFailed).toBe(true)
    expect(s.lastSyncAt).toBeNull()

    fetchMock.mockResolvedValueOnce({ ticketKey: 't-3', items: [] })
    await s.load('t-3')
    expect(s.syncFailed).toBe(false)
    expect(s.lastSyncAt).toEqual(expect.any(Number))

    fetchMock.mockRejectedValueOnce(new Error('down'))
    await expect(s.load('t-3')).resolves.toBeNull()
    expect(s.syncFailed).toBe(true)
    expect(s.selected?.ticketKey).toBe('t-3')

    // Another ticket must not show the old one.
    fetchMock.mockRejectedValueOnce(new Error('down'))
    await s.load('t-4')
    expect(s.selected).toBeNull()
  })

  it('lets the poller back off while the queue cannot be loaded', async () => {
    vi.useFakeTimers()
    const s = useProductionStore()
    fetchMock.mockRejectedValue(new Error('down'))
    const p = usePolling(() => s.fetchQueue(), { intervalMs: 1000, maxBackoffMs: 4000 })
    p.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // 2 s, then 4 s (capped) instead of every second.
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(4000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    p.stop()
  })

  it('retries at once when the device comes back online', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue(1)
    const w = mount({ setup: () => void usePolling(fn, { intervalMs: 60_000 }), render: () => null })
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(2)
    w.unmount()
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('StaleBanner', () => {
  it('is hidden while polls succeed', () => {
    const w = mount(StaleBanner, { props: { failed: false, since: Date.now() } })
    expect(w.find('[data-test="stale-banner"]').exists()).toBe(false)
  })

  it('names the time of the last good data and offers a retry', async () => {
    const since = new Date(2026, 5, 13, 18, 42, 7).getTime()
    const w = mount(StaleBanner, { props: { failed: true, since } })
    expect(w.attributes('role')).toBe('alert')
    expect(w.text()).toContain('common.stale.since')
    expect(w.text()).toContain('18:42:07')
    await w.find('button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })

  it('says so when nothing was loaded yet', () => {
    const w = mount(StaleBanner, { props: { failed: true, since: null } })
    expect(w.text()).toContain('common.stale.never')
  })
})

describe('arrival trackers', () => {
  it('seen tracker: quiet on the first load, reports new IDs once', () => {
    const t = createSeenTracker()
    expect(t.update(['a', 'b'])).toEqual([])
    expect(t.update(['a', 'b', 'c'])).toEqual(['c'])
    expect(t.update(['c'])).toEqual([])
    // Back after a rollback: no news.
    expect(t.update(['a', 'c'])).toEqual([])
    t.reset()
    expect(t.update(['x'])).toEqual([])
  })

  it('increase tracker: reports keys whose count grew', () => {
    const t = createIncreaseTracker()
    expect(t.update(new Map([['t-1', 2]]))).toEqual([])
    expect(t.update(new Map([['t-1', 2], ['t-2', 0]]))).toEqual([])
    expect(t.update(new Map([['t-1', 3], ['t-2', 1], ['t-5', 1]]))).toEqual(['t-1', 't-2', 't-5'])
    // Served (back to 0), then ready again: news.
    expect(t.update(new Map([['t-1', 0]]))).toEqual([])
    expect(t.update(new Map([['t-1', 1]]))).toEqual(['t-1'])
    t.reset()
    expect(t.update(new Map([['t-1', 9]]))).toEqual([])
  })
})
