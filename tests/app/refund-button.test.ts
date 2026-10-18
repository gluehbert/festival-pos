import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { useAuthStore } from '~/stores/auth'
import { usePaymentsStore } from '~/stores/payments'
import TablePage from '~/pages/staff/[table]/index.vue'
import VoidDialog from '~/components/staff/VoidDialog.vue'
import { useCookie } from './setup/imports'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { table: '5' }, path: '/staff/5' }) }))

const fetchMock = vi.fn()
const stubs = { NuxtLink: RouterLinkStub }
const NOW = '2026-10-16T18:00:00.000Z'
const ticket = {
  ticketKey: 't-5', tableNo: 5, status: 'paid', totalCents: 400, unpaidCents: 0, lockedBy: null, lockExpiresAt: null,
  lastOrderAt: NOW, lastCheckAt: null, assignee: null, serverNow: NOW,
  items: [{
    orderItemId: '00000000-0000-4000-8000-000000000001', orderId: '00000000-0000-4000-8000-0000000000aa', menuItemId: 'beer',
    nameDe: 'Bier', nameEn: 'Beer', quantity: 1, unitPriceCents: 400, depositCents: 0, note: null, station: 'bar',
    productionStatus: 'done', paymentStatus: 'paid', served: true, createdAt: NOW,
  }],
}

function mountAs(role: 'lead' | 'waiter' | 'admin') {
  useAuthStore().staff = { staffId: 's', username: 'u', role, theme: 'system' }
  return mount(TablePage, { global: { stubs } })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
  fetchMock.mockResolvedValue(ticket)
})
afterEach(() => vi.unstubAllGlobals())

describe('refund button on the table page', () => {
  it.each([['lead', true], ['admin', true], ['waiter', false]] as const)('%s: visible = %s', async (role, visible) => {
    const w = mountAs(role)
    await flushPromises()
    expect(w.text().includes('staff.refund.button')).toBe(visible)
  })
})

describe('refund without an open drawer', () => {
  it('keeps the server code and links to the cash page', async () => {
    // Shape of a real server response: the code sits in `data.data`.
    fetchMock.mockRejectedValue({ data: { message: 'Open your drawer first, then refund', data: { code: 'CASH_SESSION_REQUIRED' } } })
    const payments = usePaymentsStore()
    expect(await payments.refundItem('id', 'too cold')).toBe(false)
    expect(payments.errorCode).toBe('CASH_SESSION_REQUIRED')

    const w = mount(VoidDialog, {
      props: { open: true, itemName: 'x', refund: true, error: payments.error, errorCode: payments.errorCode },
      global: { stubs },
    })
    expect(w.find('[role="alert"]').text()).toContain('staff.refund.needsDrawer')
    expect(w.findComponent(RouterLinkStub).props('to')).toBe('/staff/cash')
  })
})
