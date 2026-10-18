import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MenuItemForm from '~/components/admin/MenuItemForm.vue'
import MenuItemTable from '~/components/admin/MenuItemTable.vue'
import type { AdminMenuItem } from '~/../server/lib/contracts/admin'

const item: AdminMenuItem = {
  id: '00000000-0000-4000-8000-000000000001', eventId: '00000000-0000-4000-8000-000000000002',
  nameDe: 'Bier', nameEn: 'Beer', priceCents: 350, depositCents: 200, stock: null, category: 'Drinks', subcategory: 'Beers',
  station: 'bar', isAvailable: true, sortOrder: 2, allergens: ['gluten'], diet: null, createdAt: new Date().toISOString(),
}

describe('editing menu items after the import', () => {
  it('edits the price in place', async () => {
    const w = mount(MenuItemTable, { props: { items: [item] } })
    await w.findAll('[data-test="inline-number"]')[0]!.trigger('click')
    await w.find('[data-test="inline-number-input"]').setValue('3,80')
    await w.find('form').trigger('submit')
    expect(w.emitted('patch')).toEqual([[item.id, { priceCents: 380 }]])
  })

  it('opens a prefilled form in a dialog and emits only the changed fields', async () => {
    const w = mount(MenuItemTable, { props: { items: [item] } })
    expect(w.find('[data-test="modal"]').exists()).toBe(false)
    await w.find('[data-test="menu-item-edit"]').trigger('click')
    expect(w.get('[data-test="modal"]').attributes('data-title')).toBe('admin.menu.editTitle:{"name":"Bier"}')
    const row = w.find('[data-test="menu-item-dialog"]')
    const inputs = row.findAll('input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('Bier')
    expect((inputs[2]!.element as HTMLInputElement).value).toBe('3,50')

    await inputs[0]!.setValue('Helles')
    await inputs[2]!.setValue('4,00')
    await row.find('form').trigger('submit')
    expect(w.emitted('patch')).toEqual([[item.id, { nameDe: 'Helles', priceCents: 400 }]])
    expect(w.find('[data-test="menu-item-dialog"]').exists()).toBe(false)
  })

  it('keeps the screen-reader labels inside the scrolling table box', () => {
    // Without a positioned scroller the absolute sr-only labels widened the
    // whole admin page on phones.
    const w = mount(MenuItemTable, { props: { items: [item] } })
    expect(w.get('.overflow-x-auto').classes()).toContain('relative')
  })

  it('saves nothing when nothing changed, and cancel closes the form', async () => {
    const w = mount(MenuItemTable, { props: { items: [item] } })
    await w.find('[data-test="menu-item-edit"]').trigger('click')
    await w.find('[data-test="menu-item-dialog"] form').trigger('submit')
    expect(w.emitted('patch')).toBeUndefined()

    const form = mount(MenuItemForm, { props: { item } })
    await form.findAll('button[type="button"]').at(-1)!.trigger('click')
    expect(form.emitted('cancel')).toHaveLength(1)
  })
})
