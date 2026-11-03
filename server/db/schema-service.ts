import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { events, staff } from './schema'

// "Asked at the table, nothing wanted": one row per table, overwritten on each
// check. The waiter overview shows it next to the time since the last order.
export const tableChecks = pgTable(
  'table_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    tableNo: integer('table_no').notNull(),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'set null' }),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('table_checks_event_table_uq').on(t.eventId, t.tableNo)],
)

// "My table": at most one responsible waiter per table and event. A waiter
// can hold several tables; deactivating the waiter frees them.
export const tableAssignments = pgTable(
  'table_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    tableNo: integer('table_no').notNull(),
    staffId: uuid('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('table_assignments_event_table_uq').on(t.eventId, t.tableNo),
    index('table_assignments_staff_idx').on(t.staffId),
  ],
)

// How many phones signed in at each table (QR code or event PIN). Guest
// sessions without orders are swept after 7 days; this count stays for the
// usage report. Holds no personal data.
export const guestScans = pgTable(
  'guest_scans',
  {
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    tableNo: integer('table_no').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.tableNo] })],
)

// "Call the service": a guest asks for someone to come to the table, with a
// reason. Open while acknowledged_at is NULL (one open call per table); a
// waiter, the bar or a payment / order / check at the table acknowledges it.
export const waiterCalls = pgTable(
  'waiter_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    tableNo: integer('table_no').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: uuid('acknowledged_by').references(() => staff.id, { onDelete: 'set null' }),
    // Someone served the table (order, payment, "asked"): the guest's notice ends.
    visitedAt: timestamp('visited_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('waiter_calls_open_uq').on(t.eventId, t.tableNo).where(sql`${t.acknowledgedAt} IS NULL`),
    index('waiter_calls_event_created_idx').on(t.eventId, t.createdAt),
    check('waiter_calls_reason_chk', sql`${t.reason} IN ('pay','order','question')`),
  ],
)

// Buzzers at the kitchen/bar, each a one-key keyboard (KeyboardEvent.key)
// with its own lane on that station's screen. Up to four per station; the
// two stations have their own screens, so they may use the same key.
export const stationBuzzers = pgTable(
  'station_buzzers',
  {
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    station: text('station').notNull(),
    lane: integer('lane').notNull(),
    key: varchar('key', { length: 32 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.station, t.lane] }),
    uniqueIndex('station_buzzers_key_uq').on(t.eventId, t.station, t.key),
    check('station_buzzers_lane_chk', sql`${t.lane} BETWEEN 1 AND 4`),
    check('station_buzzers_station_chk', sql`${t.station} IN ('kitchen','bar','cafe')`),
  ],
)

// Buzzer lanes at the kitchen/bar, one per buzzer of the station: the card
// (key from productionCards) a person behind the counter works on. A card
// stays in its lane until it is finished; then the lane takes the oldest
// card no other lane holds.
export const productionLanes = pgTable(
  'production_lanes',
  {
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    station: text('station').notNull(),
    lane: integer('lane').notNull(),
    groupKey: text('group_key').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.station, t.lane] }),
    uniqueIndex('production_lanes_group_uq').on(t.eventId, t.station, t.groupKey),
    check('production_lanes_lane_chk', sql`${t.lane} BETWEEN 1 AND 4`),
    check('production_lanes_station_chk', sql`${t.station} IN ('kitchen','bar','cafe')`),
  ],
)

// Last run per background job; lib/sweep.ts claims its slot here, so all instances together sweep at most hourly.
export const maintenanceRuns = pgTable('maintenance_runs', { job: text('job').primaryKey(), lastRunAt: timestamp('last_run_at', { withTimezone: true }).notNull() })
