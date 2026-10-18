import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { usePaymentsStore } from '~/stores/payments'
import { useStaffOrderStore } from '~/stores/staffOrder'
import ReceiptPrint from '~/components/staff/ReceiptPrint.vue'
import LastReceipt from '~/components/staff/LastReceipt.vue'
import type { PaymentResponse, Receipt } from '~/../server/lib/contracts/staff'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'
import { useCookie } from './setup/imports'

const receipt: Receipt = {
  paymentId: '00000000-0000-4000-8000-000000000009',
  eventName: 'Summer Fair',
  tableNo: 12,
  lines: [
    { nameDe: 'Bier', nameEn: 'Beer', quantity: 2, unitPriceCents: 400, depositCents: 200, note: null },
    { nameDe: 'Wurst', nameEn: 'Sausage', quantity: 1, unitPriceCents: 450, depositCents: 0, note: 'no mustard' },
  ],
  totalCents: 1650,
  tipCents: 0,
  depositCents: 400,
  paidAt: '2026-06-14T18:30:00.000Z',
  staffUsername: 'anna',
}
const payment: PaymentResponse = { paymentId: receipt.paymentId, totalCents: 1650, tipCents: 0, ticketStatusAfter: 'paid', receipt }

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('receipt', () => {
  it('shows event, table, lines with deposit and note, total, cashier and the tax disclaimer', () => {
    const w = mount(ReceiptPrint, { props: { receipt } })
    const text = w.text()
    expect(text).toContain('Summer Fair')
    expect(text).toContain('staff.detail.table')
    expect(text).toContain('2 × Beer')
    expect(text).toContain('receipt.deposit')
    expect(text).toContain('no mustard')
    expect(w.find('[data-test="receipt-total"]').text()).toContain('16.50')
    expect(text).toContain('receipt.servedBy')
    expect(w.find('[data-test="receipt-disclaimer"]').text()).toBe('receipt.noTaxReceipt')
    expect(w.find('.print-receipt').exists()).toBe(true)
    expect(mount(ReceiptPrint, { props: { receipt: { ...receipt, tableNo: null } } }).text()).toContain('production.counter')
  })

  it('prints only the receipt and can be dismissed', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print) // happy-dom has no window.print
    const payments = usePaymentsStore()
    payments.lastReceipt = payment
    const w = mount(LastReceipt)
    await w.find('[data-test="print-receipt"]').trigger('click')
    expect(print).toHaveBeenCalledTimes(1)
    expect(document.documentElement.classList.contains('printing-receipt')).toBe(true)
    window.dispatchEvent(new Event('afterprint'))
    expect(document.documentElement.classList.contains('printing-receipt')).toBe(false)
    await w.find('[aria-label="receipt.dismiss"]').trigger('click')
    expect(payments.lastReceipt).toBeNull()
  })

  it('keeps the receipt of a walk-in paid right away', async () => {
    const pad = useStaffOrderStore()
    pad.add({ id: 'w', nameDe: 'Wurst', nameEn: 'Sausage', priceCents: 450, depositCents: 0, stock: null, category: 'Food', subcategory: null, station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto)
    fetchMock
      .mockResolvedValueOnce({ orderId: 'o', tableNo: 0, items: [{ orderItemId: 'i' }], tableBalanceCents: 0 })
      .mockResolvedValueOnce(payment)
    await pad.submit('walkin', 0, true)
    expect(usePaymentsStore().lastReceipt?.receipt.eventName).toBe('Summer Fair')
  })
})
