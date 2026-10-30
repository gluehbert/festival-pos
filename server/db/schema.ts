import { sql } from 'drizzle-orm'
import { boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    pinCode: varchar('pin_code', { length: 10 }).notNull().unique(),
    tableRangeFrom: integer('table_range_from').notNull(),
    tableRangeTo: integer('table_range_to').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    // Branding shown to guests: accent color (#rrggbb), greeting, programme.
    accentColor: varchar('accent_color', { length: 7 }),
    welcomeText: text('welcome_text'),
    program: text('program'),
    // Shown to guests only; ordering is controlled by isActive, not by date.
    startsOn: date('starts_on', { mode: 'string' }),
    endsOn: date('ends_on', { mode: 'string' }),
    trialMode: boolean('trial_mode').notNull().default(false), // rehearsal: orders/payments flagged, out of reports, deletable
    depositEnabled: boolean('deposit_enabled').notNull().default(false), // Pfand: charged with orders, paid back on return
    staffMealsEnabled: boolean('staff_meals_enabled').notNull().default(false), // free meals for helpers
    waiterCallsEnabled: boolean('waiter_calls_enabled').notNull().default(false), // guests can call the service
    foodPrepayEnabled: boolean('food_prepay_enabled').notNull().default(false), // kitchen gets food only once paid (lib/food-prepay.ts)
    // Legal pages for guests (Impressum, Datenschutz), plain text per event.
    imprintText: text('imprint_text'),
    privacyText: text('privacy_text'),
    // Shared join link for helpers (/staff/join/<code>): they enter a name and
    // wait until an admin lets them in. Null until an admin creates one.
    joinCode: varchar('join_code', { length: 32 }).unique(),
    // Most one guest phone may have ordered and not paid yet, per station (bar = drinks,
    // kitchen = food), so a passer-by cannot load a table with orders. NULL = no limit.
    guestOpenLimitBarCents: integer('guest_open_limit_bar_cents').default(5000),
    guestOpenLimitKitchenCents: integer('guest_open_limit_kitchen_cents').default(8000),
  },
  (t) => [
    uniqueIndex('events_only_one_active').on(t.isActive).where(sql`${t.isActive} = true`),
    check('events_table_range_chk', sql`${t.tableRangeFrom} >= 1 AND ${t.tableRangeTo} >= ${t.tableRangeFrom}`),
    check('events_dates_chk', sql`${t.endsOn} IS NULL OR ${t.startsOn} IS NULL OR ${t.endsOn} >= ${t.startsOn}`),
  ],
)

export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    nameDe: text('name_de').notNull(),
    nameEn: text('name_en').notNull(),
    priceCents: integer('price_cents').notNull(),
    depositCents: integer('deposit_cents').notNull().default(0), // Pfand per unit, on top of the price
    category: text('category').notNull(),
    subcategory: text('subcategory'), // optional second level, e.g. Drinks → Beers
    station: text('station').notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    stock: integer('stock'), // units left; NULL = not counted. At 0 the item is sold out
    sortOrder: integer('sort_order').notNull().default(0),
    allergens: text('allergens').array(), // keys from lib/allergens.ts; NULL = not recorded, {} = none
    diet: text('diet'), // 'vegetarian' | 'vegan' | NULL
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('menu_items_event_sort_idx').on(t.eventId, t.sortOrder),
    index('menu_items_event_avail_idx').on(t.eventId, t.isAvailable),
    check('menu_items_price_chk', sql`${t.priceCents} >= 0`),
    check('menu_items_deposit_chk', sql`${t.depositCents} >= 0`),
    check('menu_items_stock_chk', sql`${t.stock} IS NULL OR ${t.stock} >= 0`),
    check('menu_items_station_chk', sql`${t.station} IN ('kitchen','bar')`),
    check('menu_items_diet_chk', sql`${t.diet} IS NULL OR ${t.diet} IN ('vegetarian','vegan')`),
  ],
)

export const staff = pgTable(
  'staff',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    passwordHash: text('password_hash'),
    pinHash: text('pin_hash'),
    role: text('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sessionVersion: integer('session_version').notNull().default(0), // in the JWT; +1 logs out all devices (lib/auth.ts)
    theme: text('theme').notNull().default('system'), // UI colour scheme: follow the OS, light or dark
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Helpers who joined by link belong to one event: no PIN or password, and
    // they can only work while that event is active (auth middleware).
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
  },
  (t) => [
    check('staff_theme_chk', sql`${t.theme} IN ('system','light','dark')`),
    check('staff_role_chk', sql`${t.role} IN ('admin','lead','waiter','kitchen','bar')`),
    check('staff_secret_chk', sql`${t.passwordHash} IS NOT NULL OR ${t.pinHash} IS NOT NULL OR ${t.eventId} IS NOT NULL`),
    check('staff_event_role_chk', sql`${t.eventId} IS NULL OR ${t.role} <> 'admin'`),
    // Login names are unique among permanent staff; a joined name only
    // within its event ("Anna" may help at every fest).
    uniqueIndex('staff_username_uq').on(t.username).where(sql`${t.eventId} IS NULL`),
    uniqueIndex('staff_event_username_uq').on(t.eventId, t.username).where(sql`${t.eventId} IS NOT NULL`),
  ],
)

export const guestSessions = pgTable(
  'guest_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    tableNo: integer('table_no').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('guest_sessions_event_table_idx').on(t.eventId, t.tableNo),
    index('guest_sessions_expires_idx').on(t.expiresAt),
  ],
)

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    tableNo: integer('table_no').notNull(),
    // 'guest' (QR code) and 'staff_table' (taken by a waiter) both land on the table ticket; 'walkin' is its own ticket.
    kind: text('kind').notNull().default('guest'),
    guestSessionId: uuid('guest_session_id').references(() => guestSessions.id, { onDelete: 'set null' }),
    createdByStaff: uuid('created_by_staff').references(() => staff.id, { onDelete: 'set null' }),
    idempotencyKey: text('idempotency_key'),
    isTrial: boolean('is_trial').notNull().default(false),
    staffMealReason: text('staff_meal_reason'), // 'staff_meal': helpers eat for 0 €, reason required
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('orders_event_table_idx').on(t.eventId, t.tableNo),
    index('orders_event_created_idx').on(t.eventId, t.createdAt),
    index('orders_guest_session_idx').on(t.guestSessionId),
    uniqueIndex('orders_idem_uq')
      .on(t.eventId, t.guestSessionId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    // Staff orders have no guest session, and NULLs never collide in the index above, so they get their own: one key per waiter.
    uniqueIndex('orders_staff_idem_uq')
      .on(t.eventId, t.createdByStaff, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL AND ${t.guestSessionId} IS NULL`),
    check(
      'orders_origin_chk',
      sql`(${t.guestSessionId} IS NOT NULL AND ${t.createdByStaff} IS NULL) OR (${t.guestSessionId} IS NULL AND ${t.createdByStaff} IS NOT NULL)`,
    ),
    check(
      'orders_kind_chk',
      sql`(${t.kind} = 'guest' AND ${t.guestSessionId} IS NOT NULL) OR (${t.kind} IN ('staff_table','walkin','staff_meal') AND ${t.createdByStaff} IS NOT NULL)`,
    ),
    check('orders_staff_meal_chk', sql`(${t.kind} = 'staff_meal') = (${t.staffMealReason} IS NOT NULL)`),
  ],
)

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    menuItemId: uuid('menu_item_id').notNull().references(() => menuItems.id),
    quantity: integer('quantity').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    depositCents: integer('deposit_cents').notNull().default(0), // Pfand per unit; paid with the item, not revenue
    listPriceCents: integer('list_price_cents'), // staff meals (price 0): menu price at the time, for the goods value
    // Price rule that set unit_price_cents (schema-pricing.ts): menu price at the time and a
    // name snapshot, so reports survive renaming or deleting the rule. NULL = regular price.
    priceRuleId: uuid('price_rule_id'),
    priceRuleName: text('price_rule_name'),
    regularPriceCents: integer('regular_price_cents'),
    station: text('station').notNull(),
    productionStatus: text('production_status').notNull().default('pending'),
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    voidReason: text('void_reason'),
    voidedByStaff: uuid('voided_by_staff').references(() => staff.id, { onDelete: 'set null' }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    // Set when the waiter brought a finished item to the table.
    servedAt: timestamp('served_at', { withTimezone: true }),
    note: text('note'), // guest/waiter wish for kitchen/bar, e.g. "ohne Zwiebeln"
    // Menu name and category at order time, so reports survive later menu edits; NULL on rows from before 0018.
    nameDe: text('name_de'),
    nameEn: text('name_en'),
    category: text('category'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    index('order_items_station_status_idx').on(t.station, t.productionStatus),
    index('order_items_payment_status_idx').on(t.paymentStatus),
    check('order_items_quantity_chk', sql`${t.quantity} >= 1`),
    check('order_items_price_chk', sql`${t.unitPriceCents} >= 0 AND ${t.depositCents} >= 0`),
    check('order_items_station_chk', sql`${t.station} IN ('kitchen','bar')`),
    check(
      'order_items_prod_status_chk',
      sql`${t.productionStatus} IN ('pending','in_progress','done','cancelled')`,
    ),
    check('order_items_pay_status_chk', sql`${t.paymentStatus} IN ('unpaid','paid')`),
    check('order_items_note_chk', sql`${t.note} IS NULL OR char_length(${t.note}) <= 80`),
  ],
)

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').notNull().references(() => staff.id),
    totalCents: integer('total_cents').notNull(),
    // Tip given with this payment: stays in the drawer, is no revenue.
    tipCents: integer('tip_cents').notNull().default(0),
    isTrial: boolean('is_trial').notNull().default(false),
    // Sent by the cash screen; a retry after a lost response returns the booked payment instead of charging the next units again.
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_event_created_idx').on(t.eventId, t.createdAt),
    uniqueIndex('payments_idem_uq')
      .on(t.eventId, t.staffId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    check('payments_total_chk', sql`${t.totalCents} >= 0`), // 0: only 0-€ items settled, no cash
    check('payments_tip_chk', sql`${t.tipCents} >= 0`),
  ],
)

export const paymentItems = pgTable(
  'payment_items',
  {
    paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id').notNull().unique().references(() => orderItems.id, { onDelete: 'cascade' }),
  },
  (t) => [index('payment_items_payment_idx').on(t.paymentId)],
)

export const paymentLocks = pgTable(
  'payment_locks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull(),
    tableNo: integer('table_no').notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').notNull().references(() => staff.id),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('payment_locks_active_uq')
      .on(t.eventId, t.tableNo, sql`COALESCE(${t.orderId}, '00000000-0000-0000-0000-000000000000'::uuid)`),
    index('payment_locks_expires_idx').on(t.expiresAt),
  ],
)

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: text('action').notNull(),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'set null' }),
    targetKind: text('target_kind').notNull(),
    targetId: uuid('target_id').notNull(),
    reason: text('reason'),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_action_created_idx').on(t.action, t.createdAt),
    index('audit_log_staff_idx').on(t.staffId),
    check(
      'audit_log_action_chk',
      sql`${t.action} IN ('payment','void','event_activate','menu_availability','staff_create','staff_update','refund','event_trial','cash_open','cash_close','deposit_return','staff_meal','price_rule_create','price_rule_update','price_rule_delete','event_trial_data_delete','event_create','event_update','menu_item_create','menu_item_update','menu_import','asset_upload','asset_delete','table_takeover','table_release','passkey_add','passkey_remove','event_end','event_delete','guest_sessions_end')`,
    ),
  ],
)

export type Event = typeof events.$inferSelect
export type MenuItem = typeof menuItems.$inferSelect

export const eventAssets = pgTable( // logo, dark-mode logo, flyer as base64: no file storage; size capped on upload
  'event_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    contentType: text('content_type').notNull(),
    dataBase64: text('data_base64').notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: text('sha256').notNull(),
    fitsDark: boolean('fits_dark'), // logo: no light plate in dark mode (lib/logo-analysis.ts); NULL = unchecked
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('event_assets_event_kind_uq').on(t.eventId, t.kind),
    check('event_assets_kind_chk', sql`${t.kind} IN ('logo','logo_dark','flyer')`),
  ],
)

// Last run per background job; lib/sweep.ts claims its slot here, so all instances together sweep at most hourly.
export const maintenanceRuns = pgTable('maintenance_runs', { job: text('job').primaryKey(), lastRunAt: timestamp('last_run_at', { withTimezone: true }).notNull() })
