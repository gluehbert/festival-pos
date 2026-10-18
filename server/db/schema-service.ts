import { index, integer, pgTable, primaryKey, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
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
