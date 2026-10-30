import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SoldOutPanel from '~/components/production/SoldOutPanel.vue'
import MenuItem from '~/components/guest/MenuItem.vue'
import MenuItemForm from '~/components/admin/MenuItemForm.vue'
import MenuItemTable from '~/components/admin/MenuItemTable.vue'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'
import type { AdminMenuItem } from '~/../server/lib/contracts/admin'
import { useCookie } from './setup/imports'
import { useMenuStore } from '~/stores/menu'
import { useStaffOrderStore } from '~/stores/staffOrder'
import { useCartStore } from '~/stores/cart'

const cake = { id: 'c', nameDe: 'Kuchen', nameEn: 'Cake', priceCents: 250, depositCents: 0, stock: 3, category: 'Food', subcategory: null, station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto

// The popover renders trigger and content inline, so tests see both.
const UPopover = { template: '<div><slot /><slot name="content" /></div>' }

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => vi.unstubAllGlobals())

describe('Stock in the app', () => {
  it('kitchen loads its articles and marks one sold out', async () => {
    fetchMock.mockResolvedValueOnce({ eventId: 'e', items: [cake, { ...cake, id: 'd', nameDe: 'Torte', stock: 0, isAvailable: false }] })
    const w = mount(SoldOutPanel, { props: {}, global: { stubs: { UPopover } } })
    // Opening the list (the button in the app bar) loads it.
    await w.find('[data-test="sold-out-panel"]').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/production/menu')
    const rows = w.findAll('[data-test="sold-out-item"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('production.soldOut.stock')
    // Stock 0: only the admin can bring it back by restocking.
    expect(rows[1]!.find('button').attributes('disabled')).toBeDefined()

    fetchMock.mockResolvedValueOnce({})
    await rows[0]!.find('button').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[1]).toMatchObject(['/api/menu/c/availability', { method: 'PATCH', body: { isAvailable: false } }])
    expect(w.emitted('result')).toEqual([[true]])
    expect(w.findAll('[data-test="sold-out-item"]')[0]!.text()).toContain('production.soldOut.markAvailable')
  })

  it('admin station is passed on and failures are reported', async () => {
    fetchMock.mockRejectedValueOnce({ statusCode: 500 })
    const w = mount(SoldOutPanel, { props: { station: 'bar' }, global: { stubs: { UPopover } } })
    await w.find('[data-test="sold-out-panel"]').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/production/menu?station=bar')
    expect(w.emitted('result')).toEqual([[false]])
  })

  it('guests see "only n left" when stock runs low', () => {
    expect(mount(MenuItem, { props: { item: cake } }).find('[data-test="menu-low-stock"]').exists()).toBe(true)
    expect(mount(MenuItem, { props: { item: { ...cake, stock: 30 } } }).find('[data-test="menu-low-stock"]').exists()).toBe(false)
    expect(mount(MenuItem, { props: { item: { ...cake, stock: null } } }).find('[data-test="menu-low-stock"]').exists()).toBe(false)
  })

  it('admin enters stock in the form and edits it in the table', async () => {
    const form = mount(MenuItemForm)
    const inputs = form.findAll('input')
    await inputs[0]!.setValue('Kuchen')
    await inputs[1]!.setValue('Cake')
    await inputs[2]!.setValue('2,50')
    await form.find('[data-test="menu-form-stock"]').setValue('1.5')
    await form.find('form').trigger('submit')
    expect(form.emitted('submit')).toBeUndefined()
    await form.find('[data-test="menu-form-stock"]').setValue('12')
    await form.find('form').trigger('submit')
    expect(form.emitted('submit')![0]![0]).toMatchObject({ stock: 12, depositCents: 0 })

    const item = { ...cake, eventId: 'e', createdAt: new Date().toISOString() } as AdminMenuItem
    const table = mount(MenuItemTable, { props: { items: [item] } })
    const stockCell = table.findAll('[data-test="inline-number"]')[2]!
    await stockCell.trigger('click')
    await table.find('[data-test="inline-number-input"]').setValue('')
    await table.find('form').trigger('submit')
    expect(table.emitted('patch')).toEqual([['c', { stock: null }]])
  })

  it('a refused sold-out article leaves the menu and the pad, nothing else', async () => {
    const schorle = { ...cake, id: 's', nameDe: 'Apfelschorle', station: 'bar' } as MenuItemDto
    const menu = useMenuStore()
    fetchMock.mockResolvedValueOnce({ eventId: 'e', items: [cake, schorle] })
    await menu.refresh()
    const pad = useStaffOrderStore()
    pad.add(cake)
    pad.add(schorle)
    fetchMock.mockRejectedValueOnce({ statusCode: 409, data: { code: 'SOLD_OUT', message: 'x', details: { menuItemIds: ['s'] } } })
    expect(await pad.submit('staff_table', 4)).toBeNull()
    expect(pad.error).toBe('sold_out')
    expect(menu.items.map((i) => i.id)).toEqual(['c'])
    // The page's menu watch syncs the pad and names what was taken off.
    expect(pad.syncWithMenu(menu.items).map((i) => i.nameDe)).toEqual(['Apfelschorle'])
    expect(pad.lines.map((l) => l.menuItem.id)).toEqual(['c'])
  })

  it('the guest cart drops articles gone from the reloaded menu and names them', () => {
    const schorle = { ...cake, id: 's', nameDe: 'Apfelschorle' } as MenuItemDto
    const cart = useCartStore()
    cart.setTable(2)
    cart.add(cake)
    cart.add(schorle)
    cart.add(schorle)
    expect(cart.syncWithMenu([cake]).map((i) => i.nameDe)).toEqual(['Apfelschorle'])
    expect(cart.itemCount).toBe(1)
    expect(cart.syncWithMenu([cake])).toEqual([])
  })

  it('lists the station\'s articles by name, so the sizes stand together', async () => {
    const drink = (id: string, nameDe: string) => ({ ...cake, id, nameDe, nameEn: nameDe })
    fetchMock.mockResolvedValueOnce({ eventId: 'e', items: [drink('1', 'Apfelschorle 0,5 l'), drink('2', 'Pils 0,5 l'), drink('3', 'Cola 0,33 l'), drink('4', 'Apfelschorle 0,4 l'), drink('5', 'Cola 0,3 l')] })
    const w = mount(SoldOutPanel, { props: {}, global: { stubs: { UPopover } } })
    await w.find('[data-test="sold-out-panel"]').trigger('click')
    await flushPromises()
    expect(w.findAll('[data-test="sold-out-item"] p:first-child').map((p) => p.text()))
      .toEqual(['Apfelschorle 0,4 l', 'Apfelschorle 0,5 l', 'Cola 0,3 l', 'Cola 0,33 l', 'Pils 0,5 l'])
  })
})
