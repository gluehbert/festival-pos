import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import MenuBrowser from '~/components/common/MenuBrowser.vue'
import { buildMenuTabs, normalizeSearch, searchMenu } from '~/utils/menu-tabs'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'

let n = 0
const item = (nameDe: string, category: string, sortOrder: number, subcategory: string | null = null): MenuItemDto => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  nameDe,
  nameEn: `${nameDe} EN`,
  priceCents: 100,
  category,
  subcategory,
  station: 'bar',
  isAvailable: true,
  sortOrder,
})

const pils = item('Pils', 'Drinks', 110, 'Beers')
const riesling = item('Riesling', 'Drinks', 120, 'Wines')
const weizen = item('Weißbier', 'Drinks', 115, 'Beers')
const wasser = item('Water', 'Drinks', 100)
const wurst = item('Sausage', 'Food', 10)
const kuchen = item('Käsekuchen', 'Cake', 50)
const all = [pils, riesling, weizen, wasser, wurst, kuchen]

describe('buildMenuTabs', () => {
  it('orders tabs and subcategories by their smallest sort order, plain items first', () => {
    const tabs = buildMenuTabs(all)
    expect(tabs.map((t) => t.category)).toEqual(['Food', 'Cake', 'Drinks'])
    expect(tabs[2]!.sections.map((s) => [s.title, s.items.map((i) => i.nameDe)])).toEqual([
      [null, ['Water']],
      ['Beers', ['Pils', 'Weißbier']],
      ['Wines', ['Riesling']],
    ])
  })
})

describe('searchMenu', () => {
  it('matches every word across names and categories, umlaut-tolerant (German names on purpose)', () => {
    expect(normalizeSearch(' Weißbier ')).toBe('weissbier')
    expect(searchMenu(all, 'weiss').map((i) => i.nameDe)).toEqual(['Weißbier'])
    expect(searchMenu(all, 'kaese').map((i) => i.nameDe)).toEqual(['Käsekuchen'])
    expect(searchMenu(all, 'beers pils').map((i) => i.nameDe)).toEqual(['Pils'])
    expect(searchMenu(all, 'DRINKS wine').map((i) => i.nameDe)).toEqual(['Riesling'])
    expect(searchMenu(all, '  ')).toEqual([])
  })
})

function mountBrowser(props: Record<string, unknown> = {}) {
  return mount(MenuBrowser, {
    props: { items: all, ...props },
    slots: { item: ({ item: i }: { item: MenuItemDto }) => h('li', { 'data-test': 'row' }, i.nameDe) },
    attachTo: document.body,
  })
}
const rows = (w: ReturnType<typeof mountBrowser>) => w.findAll('[data-test="row"]').map((r) => r.text())
const tabs = (w: ReturnType<typeof mountBrowser>) => w.findAll('[data-test="menu-tab"]')

describe('MenuBrowser', () => {
  it('shows one category at a time with subcategory shortcuts and order badges', async () => {
    const w = mountBrowser({ quantities: { [pils.id]: 2, [riesling.id]: 1 } })
    expect(tabs(w).map((t) => t.text())).toEqual(['Food', 'Cake', 'Drinks 3'])
    expect(rows(w)).toEqual(['Sausage'])
    expect(w.findAll('[data-test="menu-subcategory"]')).toHaveLength(0)

    await tabs(w)[2]!.trigger('click')
    expect(tabs(w)[2]!.attributes('aria-selected')).toBe('true')
    expect(rows(w)).toEqual(['Water', 'Pils', 'Weißbier', 'Riesling'])
    expect(w.findAll('[data-test="menu-subcategory"]').map((b) => b.text())).toEqual(['Beers', 'Wines'])
    await w.findAll('[data-test="menu-subcategory"]')[1]!.trigger('click')
    w.unmount()
  })

  it('preselects "Popular" with the table and best-seller sections, until a tab is picked', async () => {
    const w = mountBrowser()
    expect(rows(w)).toEqual(['Sausage'])
    await w.setProps({ popular: { tableNo: 4, table: [riesling.id, 'ffffffff-ffff-4fff-8fff-ffffffffffff'], event: [wurst.id] } })
    expect(tabs(w)[0]!.text()).toContain('common.menuTabs.popular')
    expect(rows(w)).toEqual(['Riesling', 'Sausage'])
    expect(w.findAll('h3').map((x) => x.text())).toEqual(['common.menuTabs.tableSection:{"table":4}', 'common.menuTabs.eventSection'])

    await tabs(w)[1]!.trigger('click')
    await w.setProps({ popular: { tableNo: 5, table: [pils.id], event: [] } })
    expect(rows(w)).toEqual(['Sausage'])
    w.unmount()
  })

  it('does not jump to "Popular" once someone tapped in the menu', async () => {
    const w = mountBrowser()
    await w.find('[data-test="row"]').trigger('click')
    await w.setProps({ popular: { tableNo: 4, table: [riesling.id], event: [] } })
    expect(tabs(w)[0]!.text()).toContain('common.menuTabs.popular')
    expect(rows(w)).toEqual(['Sausage'])
    w.unmount()
  })

  it('searches across all tabs', async () => {
    const w = mountBrowser()
    await w.find('[data-test="menu-search-toggle"]').trigger('click')
    await w.find('[data-test="menu-search"]').setValue('beer')
    expect(rows(w)).toEqual(['Pils', 'Weißbier'])
    expect(w.text()).toContain('common.menuTabs.results:{"n":2}')
    await w.find('[data-test="menu-search"]').setValue('xyz')
    expect(w.text()).toContain('common.menuTabs.noResults')
    await w.find('[data-test="menu-search-toggle"]').trigger('click')
    expect(rows(w)).toEqual(['Sausage'])
    w.unmount()
  })

  it('keeps search, tabs and the allergen switch in one swipeable row', () => {
    const w = mountBrowser()
    const row = w.find('[data-test="menu-tabrow"]')
    expect(row.classes()).toContain('overflow-x-auto')
    expect(row.classes()).not.toContain('flex-wrap')
    for (const t of tabs(w)) expect(t.classes()).toContain('shrink-0')
    const order = Array.from(row.element.children).map((c) => c.getAttribute('data-test'))
    expect(order).toEqual(['menu-search-toggle', 'menu-tablist', 'allergen-toggle'])
    w.unmount()
  })

  it('tucks the search to the left with a peek only when asked (staff)', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(44)
    const scrolled = vi.spyOn(Element.prototype, 'scrollLeft', 'set')
    mountBrowser().unmount()
    expect(scrolled).not.toHaveBeenCalled()
    mountBrowser({ tuckSearch: true }).unmount()
    expect(scrolled).toHaveBeenCalledWith(24)
    vi.restoreAllMocks()
  })

  it('has no tab bar for a single category', () => {
    const w = mountBrowser({ items: [wurst] })
    expect(w.find('[data-test="menu-tabbar"]').exists()).toBe(false)
    expect(w.find('h3').text()).toBe('Food')
    w.unmount()
  })
})
