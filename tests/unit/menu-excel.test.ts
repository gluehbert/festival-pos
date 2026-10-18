import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildMenuWorkbook, parseCsv, parseMenuRows, parsePriceCents, readMenuFile } from '../../server/lib/menu-excel'

describe('parsePriceCents', () => {
  it('accepts German and English decimal notations', () => {
    expect(parsePriceCents(3.5)).toBe(350)
    expect(parsePriceCents('3,50')).toBe(350)
    expect(parsePriceCents('3.50 €')).toBe(350)
    expect(parsePriceCents('12')).toBe(1200)
    expect(parsePriceCents('1.234,50')).toBe(123450)
    expect(parsePriceCents('abc')).toBeNull()
    expect(parsePriceCents('')).toBeNull()
  })
})

describe('parseMenuRows', () => {
  const header = ['Name (DE)', 'Name (EN)', 'Price (€)', 'Category', 'Station', 'Sort order', 'Available']

  it('maps rows by header name, defaults EN name and availability, skips empty rows', () => {
    const { items, errors } = parseMenuRows([
      ['Summer festival menu'],
      header,
      ['Fries', '', '3,50', 'Food', 'Kitchen', 10, ''],
      [null, null, null, null, null, null, null],
      ['Bier', 'Beer', 4, 'Drinks', 'bar', '', 'no'],
    ])
    expect(errors).toEqual([])
    expect(items).toEqual([
      { row: 3, nameDe: 'Fries', nameEn: 'Fries', priceCents: 350, category: 'Food', station: 'kitchen', sortOrder: 10, isAvailable: true },
      { row: 5, nameDe: 'Bier', nameEn: 'Beer', priceCents: 400, category: 'Drinks', station: 'bar', sortOrder: undefined, isAvailable: false },
    ])
  })

  it('reads an optional subcategory column; empty cells clear it, a missing column leaves it alone', () => {
    const { items, errors } = parseMenuRows([
      ['Name (DE)', 'Price (€)', 'Category', 'Subcategory', 'Station'],
      ['Pils', '4', 'Drinks', ' Beers ', 'Bar'],
      ['Sausage', '4', 'Food', '', 'Kitchen'],
    ])
    expect(errors).toEqual([])
    expect(items.map((i) => i.subcategory)).toEqual(['Beers', null])
    expect(parseMenuRows([header, ['Pils', '', '4', 'Drinks', 'Bar', '', '']]).items[0]).not.toHaveProperty('subcategory')
  })

  it('accepts reordered English headers', () => {
    const { items, errors } = parseMenuRows([
      ['Station', 'Price', 'Name', 'Category'],
      ['Bar', '2.00', 'Water', 'Drinks'],
    ])
    expect(errors).toEqual([])
    expect(items[0]).toMatchObject({ nameDe: 'Water', priceCents: 200, station: 'bar', category: 'Drinks' })
  })

  it('reports every bad row with its row number', () => {
    const { items, errors } = parseMenuRows([
      header,
      ['Fries', '', 'free', 'Food', 'Grill', '', 'maybe'],
      ['Bier', '', '4', '', 'Bar', '1.5', ''],
      ['Bier', '', '4', 'Drinks', 'Bar', '', ''],
      ['bier', '', '4', 'Drinks', 'Bar', '', ''],
    ])
    expect(items.map((i) => i.row)).toEqual([4])
    expect(errors.map((e) => e.row)).toEqual([2, 3, 5])
    expect(errors[0]!.message).toMatch(/Price.*Station.*Available/)
    expect(errors[1]!.message).toMatch(/Category|Sort order/)
    expect(errors[2]!.message).toMatch(/twice.*row 4/)
  })

  it('rejects files without the required columns', () => {
    expect(parseMenuRows([['foo', 'bar']]).errors[0]!.message).toMatch(/Header row/)
    expect(parseMenuRows([['Name (DE)', 'Price']]).errors.map((e) => e.message).join()).toMatch(/Category.*Station/)
    expect(parseMenuRows([header]).errors[0]!.message).toMatch(/no items/)
  })
})

describe('legacy German files', () => {
  it('still imports old German headers and values', () => {
    const { items, errors } = parseMenuRows([
      ['Name (DE)', 'Name (EN)', 'Preis (€)', 'Pfand (€)', 'Kategorie', 'Unterkategorie', 'Station', 'Sortierung', 'Verfügbar', 'Allergene', 'Vegetarisch/Vegan'],
      ['Bier', 'Beer', '4,00', '2,00', 'Getränke', 'Biere', 'Bar', 20, 'nein', 'A', ''],
      ['Salat', 'Salad', '6,00', '', 'Essen', '', 'Küche', 30, 'ja', 'keine', 'vegetarisch'],
    ])
    expect(errors).toEqual([])
    expect(items).toMatchObject([
      { nameDe: 'Bier', priceCents: 400, depositCents: 200, category: 'Getränke', subcategory: 'Biere', station: 'bar', sortOrder: 20, isAvailable: false, allergens: ['gluten'] },
      { nameDe: 'Salat', priceCents: 600, station: 'kitchen', isAvailable: true, allergens: [], diet: 'vegetarian' },
    ])
  })
})

describe('parseCsv', () => {
  it('reads semicolon CSV with quotes and a BOM', () => {
    expect(parseCsv('﻿Name (DE);Price\r\n"Bier ""Hell""";4,00\nWasser;"2,00"\n')).toEqual([
      ['Name (DE)', 'Price'],
      ['Bier "Hell"', '4,00'],
      ['Wasser', '2,00'],
    ])
  })

  it('falls back to comma delimiters', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('allergen and diet columns', () => {
  const header = ['Name (DE)', 'Price (€)', 'Category', 'Station', 'Allergens', 'Vegetarian/Vegan']

  it('reads codes and names; empty = not recorded, "none" = none', () => {
    const { items, errors } = parseMenuRows([
      header,
      ['Burger', '8,50', 'Food', 'Kitchen', 'a, G; senf', ''],
      ['Fries', '3,50', 'Food', 'Kitchen', 'none', 'vegan'],
      ['Salad', '6', 'Food', 'Kitchen', '', 'vegetarian'],
      ['Pretzel', '2', 'Food', 'Kitchen', 'Milch und Weizen', 'V'],
    ])
    expect(errors).toEqual([])
    expect(items.map((i) => [i.nameDe, i.allergens, i.diet])).toEqual([
      ['Burger', ['gluten', 'milk', 'mustard'], null],
      ['Fries', [], 'vegan'],
      ['Salad', null, 'vegetarian'],
      ['Pretzel', ['gluten', 'milk'], 'vegetarian'],
    ])
  })

  it('reports unknown allergens and diet values per row', () => {
    const { errors } = parseMenuRows([
      header,
      ['Burger', '8,50', 'Food', 'Kitchen', 'A, Zimt', 'meaty'],
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toMatch(/Allergens unknown: Zimt/)
    expect(errors[0]!.message).toMatch(/Vegetarian\/Vegan/)
  })

  it('leaves allergens and diet alone when the columns are missing', () => {
    const { items } = parseMenuRows([header.slice(0, 4), ['Burger', '8,50', 'Food', 'Kitchen']])
    expect(items[0]).not.toHaveProperty('allergens')
    expect(items[0]).not.toHaveProperty('diet')
  })
})

describe('xlsx template', () => {
  it('round-trips: the downloaded template imports without errors', async () => {
    const buffer = await buildMenuWorkbook([
      { nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, depositCents: 0, category: 'Food', subcategory: null, station: 'kitchen', sortOrder: 10, isAvailable: true, allergens: [], diet: 'vegan' },
      { nameDe: 'Bier', nameEn: 'Beer', priceCents: 450, depositCents: 200, category: 'Drinks', subcategory: 'Beers', station: 'bar', sortOrder: 20, isAvailable: false, allergens: ['gluten'], diet: null },
      { nameDe: 'Burger', nameEn: 'Burger', priceCents: 850, depositCents: 0, category: 'Food', subcategory: null, station: 'kitchen', sortOrder: 30, isAvailable: true, allergens: null, diet: null },
    ])
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
    const { items, errors } = await readMenuFile(buffer)
    expect(errors).toEqual([])
    expect(items.map(({ row: _row, ...i }) => i)).toEqual([
      { nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, depositCents: 0, category: 'Food', subcategory: null, station: 'kitchen', sortOrder: 10, isAvailable: true, allergens: [], diet: 'vegan' },
      { nameDe: 'Bier', nameEn: 'Beer', priceCents: 450, depositCents: 200, category: 'Drinks', subcategory: 'Beers', station: 'bar', sortOrder: 20, isAvailable: false, allergens: ['gluten'], diet: null },
      { nameDe: 'Burger', nameEn: 'Burger', priceCents: 850, depositCents: 0, category: 'Food', subcategory: null, station: 'kitchen', sortOrder: 30, isAvailable: true, allergens: null, diet: null },
    ])
  })

  it('reads an optional deposit column and rejects invalid amounts', () => {
    const header = ['Name (DE)', 'Price', 'Deposit', 'Category', 'Station']
    const ok = parseMenuRows([header, ['Bier', '4,00', '2,00', 'Drinks', 'Bar'], ['Wurst', '4,50', '', 'Food', 'Kitchen']])
    expect(ok.errors).toEqual([])
    expect(ok.items.map((i) => i.depositCents)).toEqual([200, 0])
    const bad = parseMenuRows([header, ['Bier', '4,00', 'two', 'Drinks', 'Bar']])
    expect(bad.errors[0]!.message).toMatch(/Deposit invalid/)
    // Without the column the deposit of existing items stays untouched.
    expect(parseMenuRows([['Name (DE)', 'Price', 'Kategorie', 'Station'], ['Bier', '4', 'G', 'Bar']]).items[0]!.depositCents).toBeUndefined()
  })

  it('fills example rows when the menu is empty, and rejects unreadable files', async () => {
    const { items } = await readMenuFile(await buildMenuWorkbook([]))
    expect(items.length).toBeGreaterThan(0)
    expect((await readMenuFile(Buffer.from('PK\u0003\u0004garbage'))).errors[0]!.message).toMatch(/could not be read/)
  })
})

describe('examples/menu-example.csv', () => {
  it('imports without errors, with categories and subcategories', async () => {
    const { items, errors } = await readMenuFile(readFileSync(resolve(import.meta.dirname, '../../examples/menu-example.csv')))
    expect(errors).toEqual([])
    expect(new Set(items.map((i) => i.category))).toEqual(new Set(['Food', 'Coffee & Cake', 'Drinks']))
    expect(items.find((i) => i.nameDe === 'Pils 0,5 l')).toMatchObject({ subcategory: 'Beers', station: 'bar', priceCents: 350 })
    expect(items.find((i) => i.nameDe === 'Brezel')!.subcategory).toBeNull()
  })
})

describe('allergen helpers and notice', () => {
  it('maps keys to codes in list order', async () => {
    const { allergenCodes, parseAllergenCell, parseDietCell } = await import('../../server/lib/allergens')
    expect(allergenCodes(['mustard', 'gluten', 'milk'])).toBe('A, G, M')
    expect(parseAllergenCell('-')).toEqual({ ok: true, value: [] })
    expect(parseAllergenCell('Schwefeldioxid und Sulfite, Schalenfrüchte (Nüsse)')).toEqual({ ok: true, value: ['nuts', 'sulphites'] })
    expect(parseAllergenCell('Q')).toEqual({ ok: false, unknown: ['Q'] })
    expect(parseDietCell('Vegan')).toBe('vegan')
    expect(parseDietCell('')).toBeNull()
    expect(parseDietCell('fleisch')).toBeUndefined()
  })

  it('the PDF notice spans more pages for a long menu', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const { generateAllergenPdf } = await import('../../server/lib/allergen-pdf')
    const item = (i: number) => ({ nameDe: `Item ${i} with a very long name that has to be truncated`, category: `Category ${Math.floor(i / 10)}`, subcategory: i % 2 ? 'Sub' : null, allergens: i % 3 ? ['gluten' as const] : null, diet: i % 4 ? null : 'vegan' as const })
    const short = await PDFDocument.load(await generateAllergenPdf('Summer festival', [item(1), item(2)]))
    expect(short.getPageCount()).toBe(1)
    const long = await PDFDocument.load(await generateAllergenPdf('Summer festival', Array.from({ length: 120 }, (_, i) => item(i))))
    expect(long.getPageCount()).toBeGreaterThan(2)
  })
})
