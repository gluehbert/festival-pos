// Time-dependent prices, evaluated in Europe/Berlin wall-clock time.
//
// A rule's window starts at startMinute on a day that matches its weekdays
// and optional date range, and ends at endMinute: the same day, or the next
// day when endMinute < startMinute ("Fr 22–02 Uhr" still applies on Saturday
// at 01:00). endMinute = startMinute means a full day from startMinute.
// Clock times are wall-clock times, so on the day clocks change a window
// keeps its printed times ("17–18 Uhr" stays 17–18 Uhr local time).
//
// Overlaps: rules never stack. Of all running rules for an article the one
// giving the lowest price wins; on a tie the more specific rule (article
// listed by name over whole category), then the earlier ending, then the
// name. Lowest price is what a guest expects at the counter and needs no
// manual ordering of rules by the club.

export const PRICE_TIME_ZONE = 'Europe/Berlin'

export type PriceRuleKind = 'fixed' | 'percent' | 'amount'

export interface PricingRule {
  id: string
  name: string
  isActive: boolean
  startMinute: number
  endMinute: number
  weekdays: number
  validFrom: string | null
  validTo: string | null
  menuItemIds: readonly string[]
  categories: readonly string[]
  kind: PriceRuleKind
  value: number
}

export interface PricedArticle {
  id: string
  category: string
  priceCents: number
}

export interface EffectivePrice {
  priceCents: number
  regularPriceCents: number
  rule: { id: string; name: string; endsAt: string } | null
}

interface LocalTime {
  date: string // YYYY-MM-DD
  weekday: number // 1 = Monday … 7 = Sunday
  minute: number // minutes after midnight
}

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PRICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function parts(t: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of formatter.formatToParts(new Date(t))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return out
}

const pad = (n: number) => String(n).padStart(2, '0')

export function berlinLocal(t: Date): LocalTime {
  const p = parts(t.getTime())
  const date = `${p.year}-${pad(p.month!)}-${pad(p.day!)}`
  const weekday = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1
  return { date, weekday, minute: p.hour! * 60 + p.minute! }
}

function offsetMs(t: number): number {
  const p = parts(t)
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - Math.floor(t / 1000) * 1000
}

// Instant of a Berlin wall-clock time. A time skipped in spring maps to the
// hour after; a time that occurs twice in autumn to its second occurrence.
export function berlinToUtc(date: string, minute: number): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const guess = Date.UTC(y, m - 1, d, 0, minute)
  const first = guess - offsetMs(guess)
  const second = guess - offsetMs(first)
  return new Date(second)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function dayMatches(rule: PricingRule, date: string): boolean {
  const weekday = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1
  if ((rule.weekdays & (1 << (weekday - 1))) === 0) return false
  if (rule.validFrom && date < rule.validFrom) return false
  if (rule.validTo && date > rule.validTo) return false
  return true
}

// End of the window running at `now`, or null when the rule is not running.
export function ruleEndsAt(rule: PricingRule, now: Date): Date | null {
  if (!rule.isActive) return null
  const { date, minute } = berlinLocal(now)
  const { startMinute: s, endMinute: e } = rule
  if (s < e) {
    return minute >= s && minute < e && dayMatches(rule, date) ? berlinToUtc(date, e) : null
  }
  // Over midnight (e < s) or a full day (e = s): today's window or the one
  // that started yesterday.
  if (minute >= s && dayMatches(rule, date)) return berlinToUtc(addDays(date, 1), e)
  if (minute < e && dayMatches(rule, addDays(date, -1))) return berlinToUtc(date, e)
  return null
}

// Percentages are rounded half up on the resulting price (commercial rounding).
export function applyRule(regularCents: number, kind: PriceRuleKind, value: number): number {
  let price: number
  if (kind === 'fixed') price = value
  else if (kind === 'amount') price = regularCents - value
  else price = Math.floor((regularCents * (100 - value) + 50) / 100)
  return Math.max(0, Math.trunc(price))
}

export function ruleCovers(rule: PricingRule, article: PricedArticle): 'item' | 'category' | null {
  if (rule.menuItemIds.includes(article.id)) return 'item'
  if (rule.categories.includes(article.category)) return 'category'
  return null
}

export function effectivePrice(article: PricedArticle, rules: readonly PricingRule[], now: Date): EffectivePrice {
  let best: Candidate | null = null
  for (const rule of rules) {
    const covers = ruleCovers(rule, article)
    if (!covers) continue
    const endsAt = ruleEndsAt(rule, now)
    if (!endsAt) continue
    const cand = { price: applyRule(article.priceCents, rule.kind, rule.value), specific: covers === 'item' ? 1 : 0, endsAt, rule }
    if (!best || better(cand, best)) best = cand
  }
  // A rule that would raise the price is ignored: promotions only lower it.
  if (!best || best.price >= article.priceCents) {
    return { priceCents: article.priceCents, regularPriceCents: article.priceCents, rule: null }
  }
  return {
    priceCents: best.price,
    regularPriceCents: article.priceCents,
    rule: { id: best.rule.id, name: best.rule.name, endsAt: best.endsAt.toISOString() },
  }
}

type Candidate = { price: number; specific: number; endsAt: Date; rule: PricingRule }

function better(a: Candidate, b: Candidate): boolean {
  if (a.price !== b.price) return a.price < b.price
  if (a.specific !== b.specific) return a.specific > b.specific
  if (a.endsAt.getTime() !== b.endsAt.getTime()) return a.endsAt < b.endsAt
  return a.rule.name.localeCompare(b.rule.name, 'de') < 0
}
