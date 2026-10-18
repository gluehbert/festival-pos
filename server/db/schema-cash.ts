import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { events, orderItems, payments, staff } from './schema'

// Cash drawer of one waiter: opened with the change float, closed with the
// counted cash. The expected amount (Soll) is computed from payments,
// refunds and deposit returns booked by this waiter while it was open, and
// frozen on close.
export const cashSessions = pgTable(
  'cash_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').notNull().references(() => staff.id),
    openingCents: integer('opening_cents').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    expectedCents: integer('expected_cents'),
    countedCents: integer('counted_cents'),
    note: text('note'),
  },
  (t) => [
    index('cash_sessions_event_idx').on(t.eventId, t.openedAt),
    // One open drawer per waiter and event.
    uniqueIndex('cash_sessions_open_uq').on(t.eventId, t.staffId).where(sql`${t.closedAt} IS NULL`),
    check('cash_sessions_opening_chk', sql`${t.openingCents} >= 0`),
    check('cash_sessions_counted_chk', sql`${t.countedCents} IS NULL OR ${t.countedCents} >= 0`),
    check(
      'cash_sessions_closed_chk',
      sql`(${t.closedAt} IS NULL) = (${t.countedCents} IS NULL) AND (${t.closedAt} IS NULL) = (${t.expectedCents} IS NULL)`,
    ),
  ],
)

export type CashSession = typeof cashSessions.$inferSelect

// Pfand handed back to a guest for returned glasses/mugs. Booked by the
// waiter as a negative amount: it lowers the cash expected in their drawer
// and the deposit balance, never revenue.
export const depositReturns = pgTable(
  'deposit_returns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').notNull().references(() => staff.id),
    unitCents: integer('unit_cents').notNull(),
    quantity: integer('quantity').notNull(),
    amountCents: integer('amount_cents').notNull(), // = -unit × quantity
    isTrial: boolean('is_trial').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('deposit_returns_event_idx').on(t.eventId, t.createdAt),
    check('deposit_returns_amount_chk', sql`${t.unitCents} >= 1 AND ${t.quantity} >= 1 AND ${t.amountCents} = -(${t.unitCents} * ${t.quantity})`),
  ],
)

// Cash handed back for a paid item (the item is cancelled); per payment, so cash-per-staff reports stay correct.
export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id').notNull().unique().references(() => orderItems.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').notNull().references(() => staff.id),
    amountCents: integer('amount_cents').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('refunds_event_idx').on(t.eventId),
    index('refunds_payment_idx').on(t.paymentId),
    check('refunds_amount_chk', sql`${t.amountCents} >= 1`),
  ],
)
