import { sql } from 'drizzle-orm'
import { bigint, check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { events, staff } from './schema'

// Failed staff logins for brute-force throttling; the sweep drops rows older than the window.
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    ip: text('ip').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('login_attempts_username_created_idx').on(t.username, t.createdAt),
    index('login_attempts_ip_created_idx').on(t.ip, t.createdAt),
  ],
)

// Passkeys (WebAuthn): the device keeps the private key and unlocks it with a
// fingerprint, face or device PIN; only the public key is stored here.
export const staffPasskeys = pgTable(
  'staff_passkeys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    staffId: uuid('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull().unique(), // base64url
    publicKey: text('public_key').notNull(), // base64url COSE key
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    transports: text('transports'), // comma-separated hints for the browser (internal, hybrid, usb ...)
    name: text('name').notNull(), // "Pixel von Anna", shown in the device lists
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('staff_passkeys_staff_idx').on(t.staffId)],
)

// Single-use WebAuthn challenges (lib/passkeys.ts); the sweep drops expired ones.
export const webauthnChallenges = pgTable(
  'webauthn_challenges',
  {
    challenge: text('challenge').primaryKey(),
    kind: text('kind').notNull(),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'cascade' }), // set for 'register'
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('webauthn_challenges_kind_chk', sql`${t.kind} IN ('register','login')`),
    index('webauthn_challenges_expires_idx').on(t.expiresAt),
  ],
)

// Waiting room of the join link: a helper's name until an admin lets them in
// (creating an event staff account, or for a known name signing that one in
// on the new device) or turns them away. The device holds the token in a
// cookie and polls; only its hash is stored.
export const staffJoinRequests = pgTable(
  'staff_join_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    status: text('status').notNull().default('pending'),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'cascade' }), // known name, or the account after approval
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    check('staff_join_requests_status_chk', sql`${t.status} IN ('pending','approved','rejected')`),
    index('staff_join_requests_event_status_idx').on(t.eventId, t.status),
  ],
)
