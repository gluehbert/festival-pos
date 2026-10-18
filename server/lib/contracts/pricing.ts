import { z } from 'zod'
import { OptionalEventDateSchema, datesInOrder } from './admin'

// Price rules (Happy Hour & Co.), see lib/pricing.ts for how they apply.

export const PriceRuleKindEnum = z.enum(['fixed', 'percent', 'amount'])

// Wall-clock time in Europe/Berlin, "17:00".
export const ClockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Uhrzeit im Format HH:MM')

export const PriceRuleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    isActive: z.boolean().default(true),
    startTime: ClockTimeSchema,
    endTime: ClockTimeSchema,
    // ISO weekdays of the day the window starts, 1 = Monday … 7 = Sunday.
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).default([1, 2, 3, 4, 5, 6, 7]),
    validFrom: OptionalEventDateSchema,
    validTo: OptionalEventDateSchema,
    menuItemIds: z.array(z.string().uuid()).max(500).default([]),
    categories: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    kind: PriceRuleKindEnum,
    // fixed: price in cent · percent: 1–100 · amount: cent off.
    value: z.number().int().min(0).max(100000),
  })
  .refine((v) => v.menuItemIds.length + v.categories.length > 0, { message: 'At least one item or category', path: ['menuItemIds'] })
  .refine((v) => v.kind !== 'percent' || (v.value >= 1 && v.value <= 100), { message: 'Prozent 1–100', path: ['value'] })
  .refine((v) => v.kind !== 'amount' || v.value >= 1, { message: 'Rabatt mindestens 1 Cent', path: ['value'] })
  .refine((v) => datesInOrder({ startsOn: v.validFrom, endsOn: v.validTo }), { message: 'validTo must be >= validFrom', path: ['validTo'] })
export type PriceRuleInput = z.input<typeof PriceRuleInputSchema>

// Only switching on/off is common enough for its own shape; everything else
// is sent as a full rule.
export const PriceRulePatchSchema = z.union([z.object({ isActive: z.boolean() }).strict(), PriceRuleInputSchema])
export type PriceRulePatch = z.input<typeof PriceRulePatchSchema>

export const PriceRuleSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
  startTime: ClockTimeSchema,
  endTime: ClockTimeSchema,
  weekdays: z.array(z.number().int().min(1).max(7)),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  menuItemIds: z.array(z.string().uuid()),
  categories: z.array(z.string()),
  kind: PriceRuleKindEnum,
  value: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // End of the window running right now; null when not running.
  runningUntil: z.string().datetime().nullable(),
})
export type PriceRuleDto = z.infer<typeof PriceRuleSchema>

// "Gerade aktiv": articles whose price a rule lowers right now.
export const PricePreviewRowSchema = z.object({
  menuItemId: z.string().uuid(),
  nameDe: z.string(),
  nameEn: z.string(),
  regularPriceCents: z.number().int(),
  priceCents: z.number().int(),
  ruleName: z.string(),
  endsAt: z.string().datetime(),
})
export type PricePreviewRow = z.infer<typeof PricePreviewRowSchema>

export const PriceRulesListSchema = z.object({
  eventId: z.string().uuid(),
  now: z.string().datetime(),
  rules: z.array(PriceRuleSchema),
  preview: z.array(PricePreviewRowSchema),
})
export type PriceRulesList = z.infer<typeof PriceRulesListSchema>

// Shown with a menu item while a rule lowers its price.
export const MenuPromoSchema = z.object({
  name: z.string(),
  endsAt: z.string().datetime(),
})
export type MenuPromo = z.infer<typeof MenuPromoSchema>

// Report: units and revenue sold under each rule, per article.
export const PriceRuleReportRowSchema = z.object({
  ruleId: z.string().uuid().nullable(),
  ruleName: z.string(),
  menuItemId: z.string().uuid(),
  nameDe: z.string(),
  nameEn: z.string(),
  quantity: z.number().int(),
  totalCents: z.number().int(),
  // Regular price minus promotion price, times quantity.
  discountCents: z.number().int(),
})
export type PriceRuleReportRow = z.infer<typeof PriceRuleReportRowSchema>
