import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { useStaffJoinStore } from '~/stores/staff-join'
import { useAuthStore } from '~/stores/auth'
import JoinPage from '~/pages/staff/join/[code].vue'
import JoinRequests from '~/components/admin/JoinRequests.vue'
import JoinLink from '~/components/admin/JoinLink.vue'
import { navigateTo, useCookie } from './setup/imports'

vi.mock('qrcode', () => ({ default: { toDataURL: async (url: string) => `data:image/png;base64,${btoa(url)}` } }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { code: 'abc' }, path: '/staff/join/abc' }) }))

const fetchMock = vi.fn()
const notFound = { statusCode: 404 }
const SESSION = { staffId: 's', username: 'Anna', role: 'waiter', theme: 'system' }

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('staff join store', () => {
  it('maps failures to messages', async () => {
    const s = useStaffJoinStore()
    fetchMock.mockResolvedValueOnce({ status: 'pending', name: 'Anna' })
    expect(await s.join('abc', 'Anna')).toEqual({ status: 'pending', name: 'Anna' })
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: { code: 'abc', name: 'Anna' } })
    for (const [statusCode, expected] of [[404, 'closed'], [409, 'nameWaiting'], [429, 'full'], [400, 'invalidName'], [500, 'failed']] as const) {
      fetchMock.mockRejectedValueOnce({ statusCode })
      expect(await s.join('abc', 'Anna')).toBe(expected)
    }
    fetchMock.mockRejectedValueOnce(notFound)
    expect(await s.status()).toBeNull()
  })

  it('loads the waiting room and decides', async () => {
    const s = useStaffJoinStore()
    const overview = { code: 'abc', url: 'https://x/staff/join/abc', pending: [], members: [] }
    fetchMock.mockResolvedValue(overview)
    await s.load('e1')
    expect(s.overview).toEqual(overview)
    await s.decide('e1', 'r1', 'approve', 'bar')
    expect(fetchMock.mock.calls.at(-1)).toEqual(['/api/admin/events/e1/join-requests/r1', expect.objectContaining({ method: 'POST', body: { decision: 'approve', role: 'bar' } })])
    await s.newLink('e1')
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/admin/events/e1/join-code')).toBe(true)
    await s.setActive('e1', 'st1', false)
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/admin/staff/st1' && c[1].method === 'PATCH')).toBe(true)
  })
})

describe('join page', () => {
  it('asks for a name, waits and goes to work once let in', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async (path: string, opts: { method?: string } = {}) => {
      if (path === '/api/auth/me') throw { statusCode: 401 }
      if (path === '/api/join/status') throw notFound
      if (path === '/api/join' && opts.method === 'POST') return { status: 'pending', name: 'Anna' }
      if (path === '/api/csrf-token') return { csrfToken: 'c'.repeat(64) }
      return {}
    })
    const w = mount(JoinPage)
    await flushPromises()
    expect(navigateTo).not.toHaveBeenCalled()
    await w.get('#join-name').setValue('Anna')
    await w.get('[data-test="join-form"]').trigger('submit')
    await flushPromises()
    expect(w.get('[data-test="join-waiting"]').text()).toContain('"name":"Anna"')

    fetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/join/status') return { status: 'approved', name: 'Anna', role: 'waiter' }
      if (path === '/api/auth/me') return SESSION
      return {}
    })
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(useAuthStore().staff?.username).toBe('Anna')
    expect(navigateTo).toHaveBeenCalledWith('/staff')
  })

  it('explains a turned-away request and a taken name', async () => {
    fetchMock.mockImplementation(async (path: string, opts: { method?: string } = {}) => {
      if (path === '/api/auth/me') throw { statusCode: 401 }
      if (path === '/api/join/status') return { status: 'rejected', name: 'Anna' }
      if (path === '/api/join' && opts.method === 'POST') throw { statusCode: 409 }
      return {}
    })
    const w = mount(JoinPage)
    await flushPromises()
    expect(w.get('[data-test="join-error"]').text()).toBe('staff.join.error.rejected')
    await w.get('#join-name').setValue('Anna')
    await w.get('[data-test="join-form"]').trigger('submit')
    await flushPromises()
    expect(w.get('[data-test="join-error"]').text()).toBe('staff.join.error.nameWaiting')
  })

  it('sends people who are already signed in straight to work', async () => {
    useAuthStore().staff = { ...SESSION, role: 'kitchen' } as never
    mount(JoinPage)
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledWith('/production')
  })
})

describe('admin waiting room', () => {
  const pending = [
    { id: 'r1', name: 'Tom', rejoin: false, role: null, createdAt: '2026-10-15T10:00:00.000Z' },
    { id: 'r2', name: 'Anna', rejoin: true, role: 'bar' as const, createdAt: '2026-10-15T10:01:00.000Z' },
  ]
  const members = [{ id: 'm1', username: 'Anna', role: 'bar' as const, isActive: true }]

  it('lets people in with a role, all at once, and locks members', async () => {
    const w = mount(JoinRequests, { props: { pending, members, busy: false } })
    expect(w.findAll('[data-test="join-request"]')[1]!.text()).toContain('admin.join.rejoin')
    const selects = w.findAll('select')
    expect((selects[0]!.element as HTMLSelectElement).value).toBe('waiter')
    expect((selects[1]!.element as HTMLSelectElement).value).toBe('bar')
    await selects[0]!.setValue('kitchen')
    await w.findAll('[data-test="join-approve"]')[0]!.trigger('click')
    await w.findAll('[data-test="join-reject"]')[1]!.trigger('click')
    expect(w.emitted('decide')).toEqual([['r1', 'approve', 'kitchen'], ['r2', 'reject', 'bar']])
    await w.get('[data-test="join-approve-all"]').trigger('click')
    expect(w.emitted('approveAll')).toEqual([[{ r1: 'kitchen', r2: 'bar' }]])
    await w.get('[data-test="join-member-toggle"]').trigger('click')
    expect(w.emitted('setActive')).toEqual([['m1', false]])
  })

  it('shows the link as QR code, or a button to create it', async () => {
    const none = mount(JoinLink, { props: { url: null, busy: false } })
    await none.get('[data-test="join-create"]').trigger('click')
    expect(none.emitted('create')).toHaveLength(1)

    const w = mount(JoinLink, { props: { url: 'https://pos.example/staff/join/abc', busy: false } })
    await flushPromises()
    expect(w.get('[data-test="join-url"]').text()).toBe('https://pos.example/staff/join/abc')
    expect(w.get('[data-test="join-qr"]').attributes('src')).toMatch(/^data:image\/png;base64,/)
  })
})
