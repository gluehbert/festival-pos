import { describe, expect, it } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import ItemRow from '~/components/staff/ItemRow.vue'
import TicketCard from '~/components/staff/TicketCard.vue'
import StationFilter from '~/components/production/StationFilter.vue'
import MenuList from '~/components/guest/MenuList.vue'
import OrderConfirmation from '~/components/guest/OrderConfirmation.vue'
import AvailabilityToggle from '~/components/admin/AvailabilityToggle.vue'
import AdminNav from '~/components/admin/AdminNav.vue'
import EventForm from '~/components/admin/EventForm.vue'
import QrRangeForm from '~/components/admin/QrRangeForm.vue'
import MenuItemForm from '~/components/admin/MenuItemForm.vue'
import RevenueTable from '~/components/admin/reports/RevenueTable.vue'
import VoidsTable from '~/components/admin/reports/VoidsTable.vue'
import PerStaffTable from '~/components/admin/reports/PerStaffTable.vue'
import TopItemsTable from '~/components/admin/reports/TopItemsTable.vue'
import OrdersPerHourTable from '~/components/admin/reports/OrdersPerHourTable.vue'
import { locale } from './setup/imports'
import type { TicketDetailItem, TicketSummary } from '~/../server/lib/contracts/staff'

const stubs = { NuxtLink: RouterLinkStub }

const detailItem = (over: Partial<TicketDetailItem> = {}) => ({
  orderItemId: 'i', orderId: 'o-1', menuItemId: 'm', nameDe: 'Bier', nameEn: 'Beer', quantity: 2, unitPriceCents: 450,
  station: 'bar', productionStatus: 'pending', paymentStatus: 'unpaid', ...over,
}) as TicketDetailItem

describe('ItemRow', () => {
  it('offers void for unpaid and refund for paid items', async () => {
    const unpaid = mount(ItemRow, { props: { item: detailItem(), canVoid: true, canRefund: true } })
    expect(unpaid.text()).toMatch(/2 × Beer/)
    expect(unpaid.text()).toMatch(/€9\.00/)
    expect(unpaid.text()).toContain('staff.void.button')
    expect(unpaid.text()).not.toContain('staff.refund.button')
    await unpaid.find('button').trigger('click')
    expect(unpaid.emitted('void')).toHaveLength(1)

    const paid = mount(ItemRow, { props: { item: detailItem({ paymentStatus: 'paid' }), canVoid: true, canRefund: true } })
    expect(paid.text()).toContain('staff.ticket.paid')
    await paid.find('button').trigger('click')
    expect(paid.emitted('refund')).toHaveLength(1)

    const cancelled = mount(ItemRow, { props: { item: detailItem({ productionStatus: 'cancelled' }), canVoid: true, canRefund: true } })
    expect(cancelled.text()).toContain('staff.ticket.voided')
    expect(cancelled.findAll('button')).toHaveLength(0)
  })

  it('marks finished items to bring only while they are unpaid', () => {
    const toBring = (over: Partial<TicketDetailItem>, walkin = false) => mount(ItemRow, {
      props: { item: detailItem({ productionStatus: 'done', served: false, ...over }), walkin },
    }).text().includes('staff.ticket.readyToServe')
    expect(toBring({})).toBe(true)
    expect(toBring({ served: true })).toBe(false)
    // Food paid at ordering is handed out by other helpers.
    expect(toBring({ paymentStatus: 'paid' })).toBe(false)
    // A walk-in pays first and collects at the counter.
    expect(toBring({ paymentStatus: 'paid' }, true)).toBe(true)
  })

  it('lets waiters void only unfinished items, admins also finished ones', () => {
    const voidable = (status: string, finished = false) => mount(ItemRow, {
      props: { item: detailItem({ productionStatus: status as TicketDetailItem['productionStatus'] }), canVoid: true, canVoidFinished: finished },
    }).text().includes('staff.void.button')
    expect(voidable('pending')).toBe(true)
    expect(voidable('in_progress')).toBe(true)
    expect(voidable('done')).toBe(false)
    expect(voidable('done', true)).toBe(true)
  })

  it('is selectable on the payment screen', async () => {
    const w = mount(ItemRow, { props: { item: detailItem(), selectable: true, selected: false } })
    await w.find('input[type="checkbox"]').trigger('change')
    expect(w.emitted('toggle')).toBeTruthy()
  })
})

describe('TicketCard', () => {
  const ticket = {
    ticketKey: 't-4', tableNo: 4, status: 'open', totalCents: 1200, unpaidCents: 800, lockedBy: null, ready: { kitchen: 0, bar: 0, cafe: 0 }, foodToPay: 0,
    oldestItemAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  } as unknown as TicketSummary

  it('links to the table and shows open and total amounts', () => {
    const w = mount(TicketCard, { props: { ticket }, global: { stubs } })
    expect(w.findComponent(RouterLinkStub).props('to')).toBe('/staff/4')
    expect(w.text()).toMatch(/€8\.00/)
    expect(w.text()).toContain('staff.ticket.openSince:{"n":5}')
    expect(w.text()).toContain('staff.ticket.total')
  })

  it('handles walk-ins and locks', () => {
    const w = mount(TicketCard, { props: { ticket: { ...ticket, ticketKey: 'w-abc', lockedBy: 'x', totalCents: 800 } }, global: { stubs } })
    expect(w.findComponent(RouterLinkStub).props('to')).toBe('/staff/w-abc')
    expect(w.text()).toContain('staff.detail.walkin')
    expect(w.text()).toContain('staff.ticket.locked')
  })
})

describe('guest components', () => {
  const items = [
    { id: '1', nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, category: 'Snacks', subcategory: null, station: 'kitchen', isAvailable: true, sortOrder: 0 },
    { id: '2', nameDe: 'Bier', nameEn: 'Beer', priceCents: 450, category: 'Beer', subcategory: null, station: 'bar', isAvailable: true, sortOrder: 1 },
  ]

  it('MenuList shows one tab per category and emits add', async () => {
    const w = mount(MenuList, { props: { items: items as never } })
    expect(w.findAll('[data-test="menu-tab"]').map((b) => b.text())).toEqual(['Snacks', 'Beer'])
    expect(w.text()).toContain('Fries')
    expect(w.text()).not.toContain('Beer 0')
    await w.findAll('[data-test="menu-tab"]')[1]!.trigger('click')
    await w.find('[aria-label^="guest.menu.addAria"]').trigger('click')
    expect(w.emitted('add')![0]).toEqual([items[1]])
    locale.value = 'de'
    await w.setProps({ items: [...items] as never })
    // German literal on purpose: item names follow the UI language.
    expect(w.text()).toContain('Bier')
  })

  it('OrderConfirmation shows the table balance and starts a new order', async () => {
    const w = mount(OrderConfirmation, { props: { order: { orderId: 'o-1', tableBalanceCents: 1250, items: [] } as never } })
    expect(w.text()).toContain('#O1')
    expect(w.text()).toMatch(/€12\.50/)
    await w.find('button').trigger('click')
    expect(w.emitted('new-order')).toHaveLength(1)
  })
})

describe('admin components', () => {
  it('StationFilter and AvailabilityToggle emit v-model updates', async () => {
    const f = mount(StationFilter, {
      props: { modelValue: 'kitchen' },
      global: { stubs: { UPopover: { template: '<div><slot /><slot name="content" :close="() => {}" /></div>' } } },
    })
    expect(f.get('[data-test="station-picker"]').text()).toContain('common.station.kitchen')
    expect(f.get('[data-station="kitchen"]').attributes('aria-selected')).toBe('true')
    await f.get('[data-station="bar"]').trigger('click')
    expect(f.emitted('update:modelValue')).toEqual([['bar']])
    const t = mount(AvailabilityToggle, { props: { modelValue: true } })
    await t.find('button').trigger('click')
    expect(t.emitted('update:modelValue')).toEqual([[false]])
  })

  it('AdminNav links the global admin pages', () => {
    const w = mount(AdminNav, { global: { stubs } })
    const targets = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(targets).toEqual(['/admin/events', '/admin/staff'])
  })

  it('EventForm validates the PIN and table range', async () => {
    const w = mount(EventForm)
    const inputs = w.findAll('input')
    await inputs[0]!.setValue('Summer Fair')
    await inputs[1]!.setValue('ab')
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('admin.validation.eventPin')
    await inputs[1]!.setValue('SF2026')
    await inputs[2]!.setValue(10)
    await inputs[3]!.setValue(5)
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('admin.validation.toGteFrom')
    await inputs[3]!.setValue(20)
    await inputs[4]!.setValue('2026-06-14')
    await inputs[5]!.setValue('2026-06-13')
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('admin.validation.endsAfterStart')
    await inputs[5]!.setValue('2026-06-15')
    await w.find('form').trigger('submit')
    expect(w.emitted('submit')![0]).toEqual([{
      name: 'Summer Fair',
      pinCode: 'SF2026',
      tableRangeFrom: 10,
      tableRangeTo: 20,
      startsOn: '2026-06-14',
      endsOn: '2026-06-15',
    }])
  })

  it('QrRangeForm rejects inverted ranges', async () => {
    const w = mount(QrRangeForm, { props: { defaultFrom: 1, defaultTo: 24 } })
    const [from, to] = w.findAll('input')
    await from!.setValue(5)
    await to!.setValue(2)
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('admin.validation.toGteFrom')
    await to!.setValue(8)
    await w.find('form').trigger('submit')
    expect(w.emitted('submit')![0]).toEqual([5, 8])
  })

  it('MenuItemForm requires both names and a valid price', async () => {
    const w = mount(MenuItemForm)
    await w.find('form').trigger('submit')
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('report tables format money/dates and show empty states', () => {
    expect(mount(RevenueTable, { props: { rows: [{ category: 'Beer', totalCents: 900, itemCount: 2 }] } }).text()).toMatch(/€9\.00/)
    expect(mount(RevenueTable, { props: { rows: [] } }).text()).toContain('admin.reports.empty')
    expect(mount(TopItemsTable, { props: { rows: [{ menuItemId: 'm', nameDe: 'Bier', nameEn: 'Beer', quantity: 3, totalCents: 1350 }] } }).text()).toMatch(/€13\.50/)
    const voids = mount(VoidsTable, { props: { rows: [
      { orderItemId: 'a', nameDe: 'Bier', nameEn: 'Beer', reason: 'cold', voidedAt: new Date().toISOString(), voidedByStaffId: null, refundedCents: 450 },
      { orderItemId: 'b', nameDe: 'Wurst', nameEn: 'Sausage', reason: 'wrong-pw', voidedAt: new Date().toISOString(), voidedByStaffId: null, refundedCents: 0 },
    ] } })
    expect(voids.text()).toMatch(/€4\.50/)
    expect(voids.text()).toContain('–')
    expect(mount(PerStaffTable, { props: { rows: [{ staffId: 's', username: 'anna', paymentCount: 2, totalCents: 1000, refundedCents: 0 }] } }).text()).toContain('anna')
    const perHourTable = mount(OrdersPerHourTable, { props: { rows: [{ hour: '2026-07-04T18:00', orderCount: 7, guestOrderCount: 5 }] } })
    const perHour = perHourTable.text()
    expect(perHourTable.findAll('td').slice(1).map((td) => td.text())).toEqual(['7', '5'])
    // Shown as the Berlin hour from the server, not shifted to the device zone.
    expect(perHour).toContain('18:00')
  })
})
