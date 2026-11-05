import { jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { events } from './schema'

// The guided setup of an event (lib/event-setup.ts), kept on the server so
// every admin device shows the same ticks. One row per event, created on the
// first write; not copied by "Einrichten wie".
export const eventSetup = pgTable('event_setup', {
  eventId: uuid('event_id').primaryKey().references(() => events.id, { onDelete: 'cascade' }),
  // Steps the admin went past with "Weiter" (keys of app/utils/setup-steps.ts).
  confirmed: jsonb('confirmed').$type<string[]>().notNull().default([]),
  qrDownloadedAt: timestamp('qr_downloaded_at', { withTimezone: true }),
  // Last rehearsal that ended with at least one test order.
  trialHeldAt: timestamp('trial_held_at', { withTimezone: true }),
})
