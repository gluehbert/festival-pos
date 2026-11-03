// The demo menu: `pnpm db:seed` (scripts/seed.ts) and the sample event of
// preview deployments (lib/preview-demo.ts).
export interface MenuSeed {
  nameDe: string
  nameEn: string
  priceCents: number
  category: string
  station: 'kitchen' | 'bar' | 'cafe'
  sortOrder: number
  // Allergen keys (server/lib/allergens.ts); left out = not recorded yet.
  allergens?: string[]
  diet?: 'vegetarian' | 'vegan'
}

export const DEMO_MENU: MenuSeed[] = [
  { nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, category: 'Snacks', station: 'kitchen', sortOrder: 10, allergens: [], diet: 'vegan' },
  { nameDe: 'Bratwurst', nameEn: 'Sausage', priceCents: 450, category: 'Snacks', station: 'kitchen', sortOrder: 20, allergens: ['celery', 'mustard'] },
  { nameDe: 'Burger', nameEn: 'Burger', priceCents: 850, category: 'Mains', station: 'kitchen', sortOrder: 30, allergens: ['gluten', 'eggs', 'milk', 'mustard', 'sesame'] },
  { nameDe: 'Vegane Bowl', nameEn: 'Vegan Bowl', priceCents: 950, category: 'Mains', station: 'kitchen', sortOrder: 40, allergens: ['soy', 'sesame'], diet: 'vegan' },
  { nameDe: 'Pommes Spezial', nameEn: 'Loaded Fries', priceCents: 550, category: 'Snacks', station: 'kitchen', sortOrder: 50, allergens: ['eggs', 'milk', 'mustard'], diet: 'vegetarian' },
  { nameDe: 'Bier 0,5', nameEn: 'Beer 0.5', priceCents: 450, category: 'Beer', station: 'bar', sortOrder: 110, allergens: ['gluten'] },
  { nameDe: 'Radler 0,5', nameEn: 'Shandy 0.5', priceCents: 450, category: 'Beer', station: 'bar', sortOrder: 120, allergens: ['gluten'] },
  { nameDe: 'Cola 0,33', nameEn: 'Cola 0.33', priceCents: 300, category: 'Softdrinks', station: 'bar', sortOrder: 130, allergens: [], diet: 'vegan' },
  { nameDe: 'Wasser 0,5', nameEn: 'Water 0.5', priceCents: 250, category: 'Softdrinks', station: 'bar', sortOrder: 140, allergens: [], diet: 'vegan' },
  { nameDe: 'Aperol Spritz', nameEn: 'Aperol Spritz', priceCents: 650, category: 'Cocktails', station: 'bar', sortOrder: 150 },
  { nameDe: 'Kuchen', nameEn: 'Cake', priceCents: 350, category: 'Cafe', station: 'cafe', sortOrder: 210, allergens: ['gluten', 'eggs', 'milk'], diet: 'vegetarian' },
  { nameDe: 'Kaffee', nameEn: 'Coffee', priceCents: 250, category: 'Cafe', station: 'cafe', sortOrder: 220, allergens: [], diet: 'vegan' },
]
