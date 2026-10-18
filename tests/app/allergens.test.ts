import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AllergenCodes from '~/components/common/AllergenCodes.vue'
import AllergenPicker from '~/components/admin/AllergenPicker.vue'
import MenuItemForm from '~/components/admin/MenuItemForm.vue'
import MenuItemTable from '~/components/admin/MenuItemTable.vue'
import MenuList from '~/components/guest/MenuList.vue'
import OrderMenuRow from '~/components/staff/OrderMenuRow.vue'
import type { AdminMenuItem } from '~/../server/lib/contracts/admin'

const adminItem = (over: Partial<AdminMenuItem> = {}): AdminMenuItem => ({
  id: '00000000-0000-4000-8000-000000000001', eventId: '00000000-0000-4000-8000-000000000002',
  nameDe: 'Burger', nameEn: 'Burger', priceCents: 850, category: 'Food', subcategory: null, station: 'kitchen',
  isAvailable: true, sortOrder: 0, allergens: null, diet: null, createdAt: new Date().toISOString(), ...over,
})

describe('AllergenCodes', () => {
  it('shows letter codes with full names for screen readers, "on request" when not recorded', () => {
    const w = mount(AllergenCodes, { props: { allergens: ['mustard', 'gluten'], diet: 'vegetarian' } })
    expect(w.find('[aria-hidden="true"]').text()).toBe('A, M')
    expect(w.find('.sr-only').text()).toContain('common.allergens.codesAria')
    expect(w.find('[data-test="diet-tag"]').text()).toBe('common.allergens.diet.vegetarian')

    expect(mount(AllergenCodes, { props: { allergens: null, diet: null } }).text()).toBe('common.allergens.onRequest')
    expect(mount(AllergenCodes, { props: { allergens: [], diet: null } }).text()).toBe('')
  })
})

describe('AllergenPicker', () => {
  it('switches between "not recorded" (null) and a checked list', async () => {
    const w = mount(AllergenPicker, { props: { allergens: null, diet: null } })
    expect(w.find('[data-test="allergen-gluten"]').exists()).toBe(false)
    await w.find('[data-test="allergens-recorded"]').setValue(true)
    expect(w.emitted('update:allergens')!.at(-1)).toEqual([[]])

    await w.setProps({ allergens: ['milk'] })
    await w.find('[data-test="allergen-gluten"]').setValue(true)
    expect(w.emitted('update:allergens')!.at(-1)).toEqual([['gluten', 'milk']])
    await w.find('[data-test="diet-select"]').setValue('vegan')
    expect(w.emitted('update:diet')!.at(-1)).toEqual(['vegan'])
  })
})

describe('admin menu', () => {
  it('MenuItemForm submits allergens and diet', async () => {
    const w = mount(MenuItemForm)
    const inputs = w.findAll('input')
    await inputs[0]!.setValue('Burger')
    await inputs[1]!.setValue('Burger')
    await inputs[2]!.setValue('8,50')
    await w.find('input[required][list]').setValue('Food') // Kategorie
    await w.find('[data-test="allergens-recorded"]').setValue(true)
    await w.find('[data-test="allergen-eggs"]').setValue(true)
    await w.find('[data-test="diet-select"]').setValue('vegetarian')
    await w.find('form').trigger('submit')
    expect(w.emitted('submit')![0]![0]).toMatchObject({ nameDe: 'Burger', allergens: ['eggs'], diet: 'vegetarian' })
  })

  it('MenuItemTable flags missing allergens and saves edits per row', async () => {
    const w = mount(MenuItemTable, { props: { items: [adminItem(), adminItem({ id: '00000000-0000-4000-8000-000000000003', nameDe: 'Wasser', allergens: [] })] } })
    const cells = w.findAll('[data-test="allergen-edit"]')
    expect(cells[0]!.text()).toContain('admin.menu.allergensMissing')
    expect(cells[1]!.text()).toContain('common.allergens.none')

    await cells[0]!.trigger('click')
    const row = w.find('[data-test="allergen-dialog"]')
    await row.find('[data-test="allergens-recorded"]').setValue(true)
    await row.find('[data-test="allergen-milk"]').setValue(true)
    await row.find('[data-test="allergen-save"]').trigger('click')
    expect(w.emitted('patch')![0]).toEqual([adminItem().id, { allergens: ['milk'], diet: null }])
    expect(w.find('[data-test="allergen-dialog"]').exists()).toBe(false)
  })
})

describe('guest menu', () => {
  it('hides codes and legend until the central toggle is switched on, and remembers it', async () => {
    const w = mount(MenuList, { props: { items: [{ ...adminItem({ allergens: ['gluten'], diet: 'vegan' }) }] as never } })
    expect(w.find('[data-test="allergen-codes"]').exists()).toBe(false)
    expect(w.find('[data-test="allergen-legend"]').exists()).toBe(false)

    const toggle = w.find('[data-test="allergen-toggle"]')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(localStorage.getItem('show-allergens')).toBe('on')
    expect(w.find('[data-test="allergen-codes"]').text()).toContain('A')
    expect(w.find('[data-test="diet-tag"]').exists()).toBe(true)
    const legend = w.find('[data-test="allergen-legend"]')
    expect(legend.findAll('dt').map((d) => d.text())).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'L', 'M', 'N', 'O', 'P', 'R'])
    expect(legend.text()).toContain('common.allergens.disclaimer')

    // Same switch for the waiter's order rows.
    const row = mount(OrderMenuRow, { props: { item: adminItem({ allergens: ['milk'] }) as never, quantity: 0 } })
    expect(row.find('[data-test="allergen-codes"]').text()).toContain('G')
    await toggle.trigger('click')
    expect(row.find('[data-test="allergen-codes"]').exists()).toBe(false)
    expect(localStorage.getItem('show-allergens')).toBe('off')
  })
})
