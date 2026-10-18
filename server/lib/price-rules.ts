import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { priceRules, type PriceRule } from '../db/schema-pricing'
import { menuItems, type MenuItem } from '../db/schema'
import { PriceRuleInputSchema, type PricePreviewRow, type PriceRuleDto, type PriceRuleInput, type PriceRulesList } from './contracts/pricing'
import { AppError } from './errors'
import { toDay } from './events'
import { effectivePrice, ruleEndsAt, type EffectivePrice, type PricingRule } from './pricing'

const pad = (n: number) => String(n).padStart(2, '0')

export const toClock = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`

export function fromClock(time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number]
  return h * 60 + m
}

export const weekdaysToMask = (days: readonly number[]) => days.reduce((mask, d) => mask | (1 << (d - 1)), 0)

export const maskToWeekdays = (mask: number) => [1, 2, 3, 4, 5, 6, 7].filter((d) => (mask & (1 << (d - 1))) !== 0)

const toIso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString()

export function toPricingRule(r: PriceRule): PricingRule {
  return {
    id: r.id,
    name: r.name,
    isActive: r.isActive,
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    weekdays: r.weekdays,
    validFrom: toDay(r.validFrom),
    validTo: toDay(r.validTo),
    menuItemIds: r.menuItemIds ?? [],
    categories: r.categories ?? [],
    kind: r.kind as PricingRule['kind'],
    value: r.value,
  }
}

export function toPriceRuleDto(r: PriceRule, now: Date): PriceRuleDto {
  const endsAt = ruleEndsAt(toPricingRule(r), now)
  return {
    id: r.id,
    eventId: r.eventId,
    name: r.name,
    isActive: r.isActive,
    startTime: toClock(r.startMinute),
    endTime: toClock(r.endMinute),
    weekdays: maskToWeekdays(r.weekdays),
    validFrom: toDay(r.validFrom),
    validTo: toDay(r.validTo),
    menuItemIds: r.menuItemIds ?? [],
    categories: r.categories ?? [],
    kind: r.kind as PriceRuleDto['kind'],
    value: r.value,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
    runningUntil: endsAt ? endsAt.toISOString() : null,
  }
}

// Columns for insert/update from a validated rule.
export function ruleValues(raw: PriceRuleInput) {
  const v = PriceRuleInputSchema.parse(raw)
  return {
    name: v.name,
    isActive: v.isActive,
    startMinute: fromClock(v.startTime),
    endMinute: fromClock(v.endTime),
    weekdays: weekdaysToMask(v.weekdays),
    validFrom: v.validFrom ?? null,
    validTo: v.validTo ?? null,
    menuItemIds: [...new Set(v.menuItemIds)],
    categories: [...new Set(v.categories)],
    kind: v.kind,
    value: v.value,
  }
}

export async function loadPriceRuleRows(db: Db, eventId: string): Promise<PriceRule[]> {
  return await db.select().from(priceRules).where(eq(priceRules.eventId, eventId))
}

export async function loadPricingRules(db: Db, eventId: string): Promise<PricingRule[]> {
  return (await loadPriceRuleRows(db, eventId)).filter((r) => r.isActive).map(toPricingRule)
}

// Prices for menu items at `now`, by id.
export function priceItems(items: readonly MenuItem[], rules: readonly PricingRule[], now: Date): Map<string, EffectivePrice> {
  return new Map(items.map((m) => [m.id, effectivePrice(m, rules, now)]))
}

export function previewRows(items: readonly MenuItem[], rules: readonly PricingRule[], now: Date): PricePreviewRow[] {
  const rows: PricePreviewRow[] = []
  for (const m of items) {
    const p = effectivePrice(m, rules, now)
    if (!p.rule) continue
    rows.push({
      menuItemId: m.id,
      nameDe: m.nameDe,
      nameEn: m.nameEn,
      regularPriceCents: p.regularPriceCents,
      priceCents: p.priceCents,
      ruleName: p.rule.name,
      endsAt: p.rule.endsAt,
    })
  }
  return rows
}

// Listed articles must belong to the event the rule is for.
export async function assertRuleTargets(db: Db, eventId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const found = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.eventId, eventId), inArray(menuItems.id, [...ids])))
  if (found.length !== ids.length) throw new AppError('VALIDATION', 400, 'Unknown menu item in price rule')
}

export async function loadPriceRulesList(db: Db, eventId: string, now = new Date()): Promise<PriceRulesList> {
  const rows = await loadPriceRuleRows(db, eventId)
  const items = await db.select().from(menuItems).where(eq(menuItems.eventId, eventId)).orderBy(asc(menuItems.sortOrder))
  const rules = rows.filter((r) => r.isActive).map(toPricingRule)
  return {
    eventId,
    now: now.toISOString(),
    rules: rows
      .sort((a, b) => a.startMinute - b.startMinute || a.name.localeCompare(b.name, 'de'))
      .map((r) => toPriceRuleDto(r, now)),
    preview: previewRows(items, rules, now),
  }
}
