import { describe, expect, it } from 'vitest'
import { addDays, applyRule, berlinLocal, berlinToUtc, effectivePrice, ruleEndsAt, type PricingRule } from '../../server/lib/pricing'
import { fromClock, maskToWeekdays, toClock, weekdaysToMask } from '../../server/lib/price-rules'

const BEER = { id: '00000000-0000-4000-8000-000000000001', category: 'Getränke', priceCents: 350 }
const WURST = { id: '00000000-0000-4000-8000-000000000002', category: 'Essen', priceCents: 400 }

function rule(over: Partial<PricingRule> = {}): PricingRule {
  return {
    id: 'r1',
    name: 'Happy Hour',
    isActive: true,
    startMinute: 17 * 60,
    endMinute: 18 * 60,
    weekdays: 127,
    validFrom: null,
    validTo: null,
    menuItemIds: [BEER.id],
    categories: [],
    kind: 'fixed',
    value: 300,
    ...over,
  }
}

// Local Berlin time as an instant (summer: UTC+2, winter: UTC+1).
const at = (iso: string) => new Date(iso)

describe('pricing — time zone helpers', () => {
  it('reads Berlin wall-clock time in summer and winter', () => {
    expect(berlinLocal(at('2026-07-10T15:30:00Z'))).toEqual({ date: '2026-07-10', weekday: 5, minute: 17 * 60 + 30 })
    expect(berlinLocal(at('2026-01-09T16:30:00Z'))).toEqual({ date: '2026-01-09', weekday: 5, minute: 17 * 60 + 30 })
    expect(berlinLocal(at('2026-07-12T22:30:00Z'))).toEqual({ date: '2026-07-13', weekday: 1, minute: 30 })
  })

  it('turns a Berlin time into the instant, also on clock-change days', () => {
    expect(berlinToUtc('2026-07-10', 18 * 60).toISOString()).toBe('2026-07-10T16:00:00.000Z')
    expect(berlinToUtc('2026-01-10', 18 * 60).toISOString()).toBe('2026-01-10T17:00:00.000Z')
    // 29 March 2026: 02:00 → 03:00. 02:30 does not exist and moves on.
    expect(berlinToUtc('2026-03-29', 2 * 60 + 30).toISOString()).toBe('2026-03-29T01:30:00.000Z')
    expect(berlinToUtc('2026-03-29', 4 * 60).toISOString()).toBe('2026-03-29T02:00:00.000Z')
    // 25 October 2026: 03:00 → 02:00.
    expect(berlinToUtc('2026-10-25', 4 * 60).toISOString()).toBe('2026-10-25T03:00:00.000Z')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('converts clock times and weekdays', () => {
    expect(fromClock('17:30')).toBe(1050)
    expect(toClock(1050)).toBe('17:30')
    expect(toClock(0)).toBe('00:00')
    expect(weekdaysToMask([1, 5, 7])).toBe(0b1010001)
    expect(maskToWeekdays(0b1010001)).toEqual([1, 5, 7])
  })
})

describe('pricing — windows', () => {
  it('runs from start (inclusive) to end (exclusive) and reports its end', () => {
    const r = rule()
    expect(ruleEndsAt(r, at('2026-07-10T14:59:00Z'))).toBeNull() // 16:59
    expect(ruleEndsAt(r, at('2026-07-10T15:00:00Z'))?.toISOString()).toBe('2026-07-10T16:00:00.000Z')
    expect(ruleEndsAt(r, at('2026-07-10T15:59:59Z'))).not.toBeNull()
    expect(ruleEndsAt(r, at('2026-07-10T16:00:00Z'))).toBeNull() // 18:00
    expect(ruleEndsAt({ ...r, isActive: false }, at('2026-07-10T15:30:00Z'))).toBeNull()
  })

  it('runs over midnight and counts the night for the day it started', () => {
    // Friday 22:00 – 02:00, Fridays only (bit 4).
    const r = rule({ startMinute: 22 * 60, endMinute: 2 * 60, weekdays: 1 << 4 })
    expect(ruleEndsAt(r, at('2026-07-10T20:30:00Z'))?.toISOString()).toBe('2026-07-11T00:00:00.000Z') // Fr 22:30
    expect(ruleEndsAt(r, at('2026-07-10T23:30:00Z'))?.toISOString()).toBe('2026-07-11T00:00:00.000Z') // Sa 01:30
    expect(ruleEndsAt(r, at('2026-07-11T00:00:00Z'))).toBeNull() // Sa 02:00
    expect(ruleEndsAt(r, at('2026-07-11T20:30:00Z'))).toBeNull() // Sa 22:30
    expect(ruleEndsAt(r, at('2026-07-09T23:30:00Z'))).toBeNull() // Fr 01:30 belongs to Thursday
  })

  it('treats start = end as a full day from that time', () => {
    const r = rule({ startMinute: 0, endMinute: 0, validFrom: '2026-07-11', validTo: '2026-07-11' })
    expect(ruleEndsAt(r, at('2026-07-10T21:59:00Z'))).toBeNull()
    expect(ruleEndsAt(r, at('2026-07-10T22:00:00Z'))?.toISOString()).toBe('2026-07-11T22:00:00.000Z')
    expect(ruleEndsAt(r, at('2026-07-11T21:59:00Z'))).not.toBeNull()
    expect(ruleEndsAt(r, at('2026-07-11T22:00:00Z'))).toBeNull()
  })

  it('honours the date range', () => {
    const r = rule({ validFrom: '2026-07-11', validTo: '2026-07-12' })
    expect(ruleEndsAt(r, at('2026-07-10T15:30:00Z'))).toBeNull()
    expect(ruleEndsAt(r, at('2026-07-11T15:30:00Z'))).not.toBeNull()
    expect(ruleEndsAt(r, at('2026-07-12T15:30:00Z'))).not.toBeNull()
    expect(ruleEndsAt(r, at('2026-07-13T15:30:00Z'))).toBeNull()
  })

  it('keeps wall-clock times across the switch to summer time', () => {
    // Saturday 28 → Sunday 29 March 2026, 23:00 – 04:00 local.
    const r = rule({ startMinute: 23 * 60, endMinute: 4 * 60 })
    expect(ruleEndsAt(r, at('2026-03-28T21:59:00Z'))).toBeNull() // 22:59 CET
    const end = ruleEndsAt(r, at('2026-03-28T22:00:00Z')) // 23:00 CET
    expect(end?.toISOString()).toBe('2026-03-29T02:00:00.000Z') // 04:00 CEST: 4 h, not 5
    expect(ruleEndsAt(r, at('2026-03-29T01:59:00Z'))).not.toBeNull() // 03:59 CEST
    expect(ruleEndsAt(r, at('2026-03-29T02:00:00Z'))).toBeNull()
  })

  it('keeps wall-clock times across the switch to winter time', () => {
    // Saturday 24 → Sunday 25 October 2026, 23:00 – 04:00 local: 6 h long.
    const r = rule({ startMinute: 23 * 60, endMinute: 4 * 60 })
    expect(ruleEndsAt(r, at('2026-10-24T21:00:00Z'))?.toISOString()).toBe('2026-10-25T03:00:00.000Z')
    expect(ruleEndsAt(r, at('2026-10-25T02:59:00Z'))).not.toBeNull() // 03:59 CET
    expect(ruleEndsAt(r, at('2026-10-25T03:00:00Z'))).toBeNull()
    // 17–18 Uhr on the change day is still 17–18 Uhr local (now UTC+1).
    expect(ruleEndsAt(rule(), at('2026-10-25T16:30:00Z'))?.toISOString()).toBe('2026-10-25T17:00:00.000Z')
  })
})

describe('pricing — price changes', () => {
  it('rounds percentages half up on the price, never below 0', () => {
    expect(applyRule(350, 'percent', 10)).toBe(315)
    expect(applyRule(345, 'percent', 10)).toBe(311) // 310.5 → 311
    expect(applyRule(333, 'percent', 50)).toBe(167) // 166.5 → 167
    expect(applyRule(999, 'percent', 33)).toBe(669) // 669.33 → 669
    expect(applyRule(350, 'percent', 100)).toBe(0)
    expect(applyRule(350, 'amount', 50)).toBe(300)
    expect(applyRule(350, 'amount', 500)).toBe(0)
    expect(applyRule(350, 'fixed', 200)).toBe(200)
  })

  it('applies to listed articles and whole categories', () => {
    const now = at('2026-07-10T15:30:00Z')
    const byCategory = rule({ menuItemIds: [], categories: ['Essen'], kind: 'amount', value: 100 })
    expect(effectivePrice(WURST, [byCategory], now)).toEqual({
      priceCents: 300,
      regularPriceCents: 400,
      rule: { id: 'r1', name: 'Happy Hour', endsAt: '2026-07-10T16:00:00.000Z' },
    })
    expect(effectivePrice(BEER, [byCategory], now)).toEqual({ priceCents: 350, regularPriceCents: 350, rule: null })
  })

  it('takes the lowest price on overlaps, then the more specific rule', () => {
    const now = at('2026-07-10T15:30:00Z')
    const cheap = rule({ id: 'a', name: 'Bier-Aktion', kind: 'fixed', value: 250 })
    const pct = rule({ id: 'b', name: 'Getränke -20 %', menuItemIds: [], categories: ['Getränke'], kind: 'percent', value: 20 })
    expect(effectivePrice(BEER, [pct, cheap], now).rule?.name).toBe('Bier-Aktion')
    expect(effectivePrice(BEER, [pct, cheap], now).priceCents).toBe(250)
    // Same price (280): the article rule wins over the category rule.
    const same = rule({ id: 'c', name: 'Zzz', kind: 'fixed', value: 280 })
    expect(effectivePrice(BEER, [pct, same], now).rule?.id).toBe('c')
    // Rules do not stack: never 250 − 20 %.
    expect(effectivePrice(BEER, [cheap, pct], now).priceCents).toBe(250)
  })

  it('ignores rules that are not running or would raise the price', () => {
    const now = at('2026-07-10T15:30:00Z')
    expect(effectivePrice(BEER, [rule({ kind: 'fixed', value: 500 })], now).rule).toBeNull()
    expect(effectivePrice(BEER, [rule({ startMinute: 20 * 60, endMinute: 21 * 60 })], now).priceCents).toBe(350)
  })
})
