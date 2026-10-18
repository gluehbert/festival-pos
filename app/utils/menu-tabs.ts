import type { MenuItemDto } from '~/../server/lib/contracts/guest'

// A subcategory block inside a tab; title null = items without subcategory.
export interface MenuSection {
  title: string | null
  items: MenuItemDto[]
}

export interface MenuTab {
  category: string
  sections: MenuSection[]
}

function minSort(items: MenuItemDto[]): number {
  return Math.min(...items.map((i) => i.sortOrder))
}

function groupBy(items: MenuItemDto[], key: (i: MenuItemDto) => string): Array<[string, MenuItemDto[]]> {
  const map = new Map<string, MenuItemDto[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k) ?? []
    list.push(item)
    map.set(k, list)
  }
  return [...map.entries()]
}

// One tab per category, ordered by the smallest sort order of its items (so
// "Food" 10–90 comes before "Drinks" 100+). Inside a tab, items without a
// subcategory come first, then one section per subcategory, ordered the same way.
export function buildMenuTabs(items: MenuItemDto[]): MenuTab[] {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder)
  return groupBy(sorted, (i) => i.category)
    .sort((a, b) => minSort(a[1]) - minSort(b[1]))
    .map(([category, list]) => {
      const sections = groupBy(list, (i) => i.subcategory?.trim() ?? '')
        .sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : minSort(a[1]) - minSort(b[1])))
        .map(([title, sectionItems]) => ({ title: title || null, items: sectionItems }))
      return { category, sections }
    })
}

// Lower case without accents; ä/ö/ü/ß also match ae/oe/ue/ss.
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim()
}

// Items whose names (DE or EN), category or subcategory contain every word of
// the query, in menu order.
export function searchMenu(items: MenuItemDto[], query: string): MenuItemDto[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((i) => {
      const hay = normalizeSearch([i.nameDe, i.nameEn, i.category, i.subcategory ?? ''].join(' '))
      return words.every((w) => hay.includes(w))
    })
}
