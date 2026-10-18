import { sql } from 'drizzle-orm'
import { boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { events } from './schema'

// Time-dependent prices ("Happy Hour 17–18 Uhr Bier 3 €"). Evaluated in
// Europe/Berlin wall-clock time by lib/pricing.ts when the menu is served and
// when an order is booked; the order line keeps the price and the rule name.
export const priceRules = pgTable(
  'price_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    // Minutes after local midnight. end < start runs over midnight,
    // end = start is a full day from start.
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    // ISO weekdays of the day the window starts: bit 0 = Monday … bit 6 = Sunday.
    weekdays: integer('weekdays').notNull().default(127),
    // Optional calendar days (of the window start), both inclusive.
    validFrom: date('valid_from', { mode: 'string' }),
    validTo: date('valid_to', { mode: 'string' }),
    // Affected articles: listed items and/or whole categories.
    menuItemIds: jsonb('menu_item_ids').$type<string[]>().notNull().default([]),
    categories: jsonb('categories').$type<string[]>().notNull().default([]),
    // fixed: price in cent · percent: 1–100 off · amount: cent off.
    kind: text('kind').notNull(),
    value: integer('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('price_rules_event_idx').on(t.eventId),
    check('price_rules_kind_chk', sql`${t.kind} IN ('fixed','percent','amount')`),
    check(
      'price_rules_value_chk',
      sql`(${t.kind} = 'fixed' AND ${t.value} >= 0) OR (${t.kind} = 'percent' AND ${t.value} BETWEEN 1 AND 100) OR (${t.kind} = 'amount' AND ${t.value} >= 1)`,
    ),
    check('price_rules_minutes_chk', sql`${t.startMinute} BETWEEN 0 AND 1439 AND ${t.endMinute} BETWEEN 0 AND 1439`),
    check('price_rules_weekdays_chk', sql`${t.weekdays} BETWEEN 1 AND 127`),
    check('price_rules_dates_chk', sql`${t.validTo} IS NULL OR ${t.validFrom} IS NULL OR ${t.validTo} >= ${t.validFrom}`),
  ],
)

export type PriceRule = typeof priceRules.$inferSelect
