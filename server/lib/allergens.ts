import { z } from 'zod'

// The 14 main allergens that must be declared for loose food (EU 1169/2011,
// Annex II). The letter codes follow the common A–R scheme used on German and
// Austrian menus. Order here is the order shown everywhere.
export const ALLERGENS = [
  { key: 'gluten', code: 'A', de: 'Glutenhaltiges Getreide', en: 'Cereals containing gluten' },
  { key: 'crustaceans', code: 'B', de: 'Krebstiere', en: 'Crustaceans' },
  { key: 'eggs', code: 'C', de: 'Eier', en: 'Eggs' },
  { key: 'fish', code: 'D', de: 'Fisch', en: 'Fish' },
  { key: 'peanuts', code: 'E', de: 'Erdnüsse', en: 'Peanuts' },
  { key: 'soy', code: 'F', de: 'Soja', en: 'Soybeans' },
  { key: 'milk', code: 'G', de: 'Milch (inkl. Laktose)', en: 'Milk (incl. lactose)' },
  { key: 'nuts', code: 'H', de: 'Schalenfrüchte (Nüsse)', en: 'Tree nuts' },
  { key: 'celery', code: 'L', de: 'Sellerie', en: 'Celery' },
  { key: 'mustard', code: 'M', de: 'Senf', en: 'Mustard' },
  { key: 'sesame', code: 'N', de: 'Sesam', en: 'Sesame' },
  { key: 'sulphites', code: 'O', de: 'Schwefeldioxid und Sulfite', en: 'Sulphur dioxide and sulphites' },
  { key: 'lupin', code: 'P', de: 'Lupinen', en: 'Lupin' },
  { key: 'molluscs', code: 'R', de: 'Weichtiere', en: 'Molluscs' },
] as const

export type Allergen = (typeof ALLERGENS)[number]['key']
export const AllergenEnum = z.enum(ALLERGENS.map((a) => a.key) as [Allergen, ...Allergen[]])

export const DietEnum = z.enum(['vegetarian', 'vegan'])
export type Diet = z.infer<typeof DietEnum>

const ORDER = new Map<string, number>(ALLERGENS.map((a, i) => [a.key, i]))

// Deduplicated and in list order, so stored values compare cleanly.
export function sortAllergens(keys: readonly Allergen[]): Allergen[] {
  return [...new Set(keys)].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!)
}

// null = not recorded yet ("ask the staff"), [] = checked, contains none.
export const AllergenListSchema = z.array(AllergenEnum).max(ALLERGENS.length).transform(sortAllergens).nullable()

export function allergenCode(key: Allergen): string {
  return ALLERGENS[ORDER.get(key)!]!.code
}

export function allergenCodes(keys: readonly Allergen[]): string {
  return sortAllergens(keys).map(allergenCode).join(', ')
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()
}

// Extra spellings people actually type into a price list.
const ALIASES: Record<Allergen, string[]> = {
  gluten: ['gluten', 'getreide', 'weizen', 'cereals'],
  crustaceans: ['krebstier', 'krebse', 'krebs', 'garnelen', 'shellfish'],
  eggs: ['ei', 'egg'],
  fish: [],
  peanuts: ['erdnuss', 'peanut'],
  soy: ['soja', 'soya'],
  milk: ['milch', 'laktose', 'lactose'],
  nuts: ['schalenfruechte', 'nuesse', 'nuss', 'nut'],
  celery: [],
  mustard: [],
  sesame: [],
  sulphites: ['sulfite', 'sulfit', 'schwefeldioxid', 'schwefel', 'sulfites', 'sulphite', 'sulphur dioxide'],
  lupin: ['lupine', 'lupinen'],
  molluscs: ['weichtier', 'mollusken', 'mollusks', 'mollusc'],
}

const LOOKUP = new Map<string, Allergen>()
for (const a of ALLERGENS) {
  for (const name of [a.key, a.code, a.de, a.en, ...ALIASES[a.key]]) LOOKUP.set(norm(name), a.key)
}
const NONE = new Set(['keine', 'kein', 'none', 'no', 'nein', 'ohne'])

export type ParsedAllergens =
  | { ok: true; value: Allergen[] | null }
  | { ok: false; unknown: string[] }

// Spreadsheet cell → allergen list. Empty = not recorded (null),
// "none" or "-" = checked, contains none. Codes ("A, G") and names
// ("Gluten; Milch") are both accepted.
export function parseAllergenCell(value: unknown): ParsedAllergens {
  const raw = String(value ?? '').trim()
  if (!raw) return { ok: true, value: null }
  if (/^[-–—0]$/.test(raw) || NONE.has(norm(raw))) return { ok: true, value: [] }
  const found: Allergen[] = []
  const unknown: string[] = []
  for (const token of raw.split(/[,;/+\n]|\s+und\s+|\s+and\s+/i)) {
    const t = token.trim()
    if (!t) continue
    const key = LOOKUP.get(norm(t))
    if (key) found.push(key)
    else unknown.push(t)
  }
  return unknown.length > 0 ? { ok: false, unknown } : { ok: true, value: sortAllergens(found) }
}

export function parseDietCell(value: unknown): Diet | null | undefined {
  const n = norm(String(value ?? ''))
  if (!n || NONE.has(n)) return null
  if (['vegan', 'vg'].includes(n)) return 'vegan'
  if (['vegetarisch', 'vegetarian', 'veggie', 'v', 'veg'].includes(n)) return 'vegetarian'
  return undefined
}

export const DIET_LABEL: Record<Diet, string> = { vegetarian: 'vegetarian', vegan: 'vegan' }
