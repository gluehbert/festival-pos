import { readSheet } from 'read-excel-file/node'
import writeXlsxFile from 'write-excel-file/node'
import type { SheetData } from 'write-excel-file/node'
import { CreateMenuItemSchema, type CreateMenuItem } from './contracts/admin'
import { ALLERGENS, DIET_LABEL, allergenCodes, parseAllergenCell, parseDietCell, type Allergen, type Diet } from './allergens'

// Excel price list: one row per menu item. Header names are matched loosely
// (English, or the old German labels as aliases; case/space-insensitive), so a
// re-ordered or older German sheet still imports.

export const MAX_IMPORT_ROWS = 500
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024

export type ImportItem = CreateMenuItem & { isAvailable: boolean }

export interface ImportRowError {
  row: number
  message: string
}

export interface ParsedMenuSheet {
  items: Array<ImportItem & { row: number }>
  errors: ImportRowError[]
}

type Field = 'nameDe' | 'nameEn' | 'price' | 'deposit' | 'category' | 'subcategory' | 'station' | 'sortOrder' | 'available' | 'allergens' | 'diet'

const HEADERS: Array<{ field: Field; label: string; aliases: string[]; width: number }> = [
  { field: 'nameDe', label: 'Name (DE)', aliases: ['name de', 'name', 'artikel', 'bezeichnung'], width: 28 },
  { field: 'nameEn', label: 'Name (EN)', aliases: ['name en', 'englisch', 'english'], width: 28 },
  { field: 'price', label: 'Price (€)', aliases: ['preis', 'preis eur', 'preis euro'], width: 12 },
  { field: 'deposit', label: 'Deposit (€)', aliases: ['pfand', 'pfand eur'], width: 10 },
  { field: 'category', label: 'Category', aliases: ['kategorie', 'gruppe'], width: 18 },
  { field: 'subcategory', label: 'Subcategory', aliases: ['unterkategorie', 'untergruppe'], width: 18 },
  { field: 'station', label: 'Station', aliases: ['ausgabe'], width: 12 },
  { field: 'sortOrder', label: 'Sort order', aliases: ['sort', 'sortierung', 'reihenfolge'], width: 12 },
  { field: 'available', label: 'Available', aliases: ['verfuegbar', 'aktiv'], width: 12 },
  { field: 'allergens', label: 'Allergens', aliases: ['allergene', 'allergen', 'allergenkennzeichnung'], width: 18 },
  { field: 'diet', label: 'Vegetarian/Vegan', aliases: ['vegetarisch vegan', 'diet', 'ernaehrung', 'veggie'], width: 18 },
]

function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[()€.:_/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function headerField(cell: unknown): Field | null {
  const n = norm(cell)
  if (!n) return null
  for (const h of HEADERS) {
    if (norm(h.label) === n || h.aliases.some((a) => norm(a) === n)) return h.field
  }
  return null
}

export function parsePriceCents(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : null
  const s = String(value ?? '').replace(/€|eur/gi, '').replace(/\s/g, '')
  if (!s) return null
  // "3,50" and "3.50" are both 3.50 €; "1.234,50" is 1234.50 €.
  const normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  return Math.round(Number(normalized) * 100)
}

function parseStation(value: unknown): 'kitchen' | 'bar' | null {
  const n = norm(value)
  if (['kitchen', 'kueche', 'k', 'essen', 'food'].includes(n)) return 'kitchen'
  if (['bar', 'b', 'getraenke', 'drinks', 'theke'].includes(n)) return 'bar'
  return null
}

function parseAvailable(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return true
  if (typeof value === 'boolean') return value
  const n = norm(value)
  if (['ja', 'yes', 'y', 'x', '1', 'true', 'wahr'].includes(n)) return true
  if (['nein', 'no', 'n', '0', 'false', 'falsch'].includes(n)) return false
  return null
}

export function parseMenuRows(rows: unknown[][]): ParsedMenuSheet {
  const errors: ImportRowError[] = []
  const items: ParsedMenuSheet['items'] = []
  const headerIndex = rows.findIndex((r) => r.some((c) => headerField(c) === 'nameDe'))
  if (headerIndex === -1) {
    return { items, errors: [{ row: 1, message: 'Header row with "Name (DE)" not found. Please use the template.' }] }
  }
  const columns = new Map<Field, number>()
  rows[headerIndex]!.forEach((cell, i) => {
    const field = headerField(cell)
    if (field && !columns.has(field)) columns.set(field, i)
  })
  for (const required of ['nameDe', 'price', 'category', 'station'] as const) {
    if (!columns.has(required)) {
      const label = HEADERS.find((h) => h.field === required)!.label
      errors.push({ row: headerIndex + 1, message: `Column "${label}" is missing.` })
    }
  }
  if (errors.length > 0) return { items, errors }

  const seen = new Map<string, number>()
  const dataRows = rows.slice(headerIndex + 1)
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return { items, errors: [{ row: headerIndex + 2, message: `At most ${MAX_IMPORT_ROWS} rows per import.` }] }
  }
  dataRows.forEach((r, i) => {
    const rowNo = headerIndex + 2 + i
    const get = (f: Field) => (columns.has(f) ? r[columns.get(f)!] : undefined)
    if (r.every((c) => c === null || c === undefined || String(c).trim() === '')) return

    const nameDe = String(get('nameDe') ?? '').trim()
    const nameEn = String(get('nameEn') ?? '').trim() || nameDe
    const priceCents = parsePriceCents(get('price'))
    const depositRaw = get('deposit')
    const depositCents = depositRaw === null || depositRaw === undefined || String(depositRaw).trim() === '' ? 0 : parsePriceCents(depositRaw)
    const station = parseStation(get('station'))
    const isAvailable = parseAvailable(get('available'))
    const sortRaw = get('sortOrder')
    const sortOrder = sortRaw === null || sortRaw === undefined || sortRaw === '' ? undefined : Number(sortRaw)
    // Missing column: leave the item's value as it is.
    const allergens = columns.has('allergens') ? parseAllergenCell(get('allergens')) : null
    const diet = columns.has('diet') ? parseDietCell(get('diet')) : null

    const problems: string[] = []
    if (priceCents === null) problems.push('Price invalid (e.g. 3.50)')
    if (depositCents === null) problems.push('Deposit invalid (e.g. 2.00)')
    if (station === null) problems.push('Station must be "Kitchen" or "Bar"')
    if (isAvailable === null) problems.push('Available must be "yes" or "no"')
    if (sortOrder !== undefined && !Number.isInteger(sortOrder)) problems.push('Sort order must be a whole number')
    if (allergens && !allergens.ok) problems.push(`Allergens unknown: ${allergens.unknown.join(', ')} (codes A–R, names or "none")`)
    if (diet === undefined) problems.push('Vegetarian/Vegan must be "vegetarian", "vegan" or empty')
    const key = nameDe.toLowerCase()
    if (nameDe && seen.has(key)) problems.push(`"${nameDe}" appears twice (also row ${seen.get(key)})`)

    const parsed = CreateMenuItemSchema.safeParse({
      nameDe,
      nameEn,
      priceCents: priceCents ?? 0,
      // Column missing: leave the item's deposit as it is; empty cell: none.
      ...(columns.has('deposit') ? { depositCents: depositCents ?? 0 } : {}),
      category: String(get('category') ?? '').trim(),
      // Column missing: leave the item's subcategory as it is; empty cell: none.
      ...(columns.has('subcategory') ? { subcategory: String(get('subcategory') ?? '').trim() } : {}),
      station: station ?? 'kitchen',
      sortOrder,
      ...(allergens?.ok ? { allergens: allergens.value } : {}),
      ...(columns.has('diet') && diet !== undefined ? { diet } : {}),
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = { priceCents: 'price', depositCents: 'deposit' }[String(issue.path[0])] ?? issue.path[0]
        const label = HEADERS.find((h) => h.field === field)?.label
        problems.push(label ? `${label}: ${issue.message}` : issue.message)
      }
    }
    if (problems.length > 0 || !parsed.success) {
      errors.push({ row: rowNo, message: problems.join('; ') })
      return
    }
    seen.set(key, rowNo)
    items.push({ ...parsed.data, isAvailable: isAvailable!, row: rowNo })
  })
  if (items.length === 0 && errors.length === 0) {
    errors.push({ row: headerIndex + 2, message: 'The file contains no items.' })
  }
  return { items, errors }
}

// Minimal RFC 4180 CSV reader. German Excel/LibreOffice exports with ';', so the
// delimiter is taken from the header line.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    }
    else if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    }
    else cell += ch
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows
}

// Accepts Office Open XML (.xlsx) or CSV, detected by content (xlsx is a zip).
export async function readMenuFile(data: Buffer): Promise<ParsedMenuSheet> {
  const isZip = data.length > 3 && data[0] === 0x50 && data[1] === 0x4B
  let rows: unknown[][]
  try {
    rows = isZip ? await readSheet(data) as unknown[][] : parseCsv(data.toString('utf8'))
  }
  catch {
    return { items: [], errors: [{ row: 0, message: 'File could not be read. Please upload an .xlsx or .csv file.' }] }
  }
  return parseMenuRows(rows)
}

export interface TemplateItem {
  nameDe: string
  nameEn: string
  priceCents: number
  depositCents: number
  category: string
  subcategory: string | null
  station: 'kitchen' | 'bar'
  sortOrder: number
  isAvailable: boolean
  allergens: Allergen[] | null
  diet: Diet | null
}

const EXAMPLES: TemplateItem[] = [
  { nameDe: 'Bratwurst', nameEn: 'Sausage', priceCents: 450, depositCents: 0, category: 'Food', subcategory: null, station: 'kitchen', sortOrder: 10, isAvailable: true, allergens: ['mustard'], diet: null },
  { nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, depositCents: 0, category: 'Food', subcategory: null, station: 'kitchen', sortOrder: 20, isAvailable: true, allergens: [], diet: 'vegan' },
  { nameDe: 'Bier 0,5 l', nameEn: 'Beer 0.5 l', priceCents: 400, depositCents: 200, category: 'Drinks', subcategory: 'Beers', station: 'bar', sortOrder: 100, isAvailable: true, allergens: ['gluten'], diet: null },
  { nameDe: 'Wasser 0,5 l', nameEn: 'Water 0.5 l', priceCents: 200, depositCents: 200, category: 'Drinks', subcategory: 'Non-alcoholic', station: 'bar', sortOrder: 110, isAvailable: true, allergens: [], diet: 'vegan' },
]

const HELP = [
  'How the import works',
  '',
  '1. Fill in one row per item on the "Menu" sheet. Do not change the header row.',
  '2. Name (DE), Price, Category and Station are required. Name (EN) is optional (Name (DE) is used otherwise).',
  '3. Price in euros, e.g. 3.50. Deposit (optional) is charged in addition when ordering, e.g. 2.00 (empty = no deposit).',
  '   Station: "Kitchen" or "Bar". Available: "yes" or "no" (empty = yes).',
  '4. Each category becomes its own tab in the order view (e.g. "Food", "Drinks"). Subcategory is optional',
  '   and divides a tab further (e.g. "Beers", "Wines", "Non-alcoholic"). Empty = no subcategory.',
  '5. Sort order: smaller numbers appear higher in the menu (optional). Tabs appear in the order of',
  '   their smallest sort value.',
  '6. Allergens: codes A–R (see the "Allergens" sheet) or names, several separated by commas, e.g. "A, G".',
  '   "none" = checked, contains none of the 14 allergens. Empty = not recorded yet (guests see "on request").',
  '   Vegetarian/Vegan: "vegetarian", "vegan" or empty.',
  '7. Upload it in the app under Admin → Menu → "Import Excel". You will see a preview before anything is applied.',
  '',
  'Items with the same Name (DE) are updated, new items are created.',
  'Items missing from the file stay unchanged (set them to "not available" in the app).',
  'The import always applies to the active event.',
]

export async function buildMenuWorkbook(items: TemplateItem[]): Promise<Buffer> {
  const rows = items.length > 0 ? items : EXAMPLES
  const header = HEADERS.map((h) => ({ value: h.label, fontWeight: 'bold' as const, backgroundColor: '#ede9fe' }))
  const data: SheetData = [
    header,
    ...rows.map((it) => [
      { value: it.nameDe },
      { value: it.nameEn },
      { value: it.priceCents / 100, type: Number, format: '#,##0.00' },
      it.depositCents > 0 ? { value: it.depositCents / 100, type: Number, format: '#,##0.00' } : null,
      { value: it.category },
      it.subcategory ? { value: it.subcategory } : null,
      { value: it.station === 'bar' ? 'Bar' : 'Kitchen' },
      { value: it.sortOrder, type: Number },
      { value: it.isAvailable ? 'yes' : 'no' },
      it.allergens ? { value: it.allergens.length > 0 ? allergenCodes(it.allergens) : 'none' } : null,
      it.diet ? { value: DIET_LABEL[it.diet] } : null,
    ]),
  ]
  const legend: SheetData = [
    [{ value: 'Code', fontWeight: 'bold' as const }, { value: 'Allergen', fontWeight: 'bold' as const }],
    ...ALLERGENS.map((a) => [{ value: a.code }, { value: a.en }]),
  ]
  const help: SheetData = HELP.map((line, i) => [{ value: line, fontWeight: i === 0 ? 'bold' as const : undefined }])
  return await writeXlsxFile([
    { data, sheet: 'Menu', columns: HEADERS.map((h) => ({ width: h.width })), stickyRowsCount: 1 },
    { data: help, sheet: 'Instructions', columns: [{ width: 110 }] },
    { data: legend, sheet: 'Allergens', columns: [{ width: 10 }, { width: 40 }] },
  ]).toBuffer()
}
