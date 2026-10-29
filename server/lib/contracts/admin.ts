import { z } from 'zod'
import { AllergenEnum, AllergenListSchema, DietEnum } from '../allergens'

export const StationEnum = z.enum(['kitchen', 'bar'])
export type Station = z.infer<typeof StationEnum>

// Calendar day (YYYY-MM-DD) without time zone, e.g. from <input type="date">.
export const EventDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format JJJJ-MM-TT')
  // Also runs after a failed regex, so guard against unparsable input.
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v)
  }, 'Invalid date')

// Optional date field: '' and null clear it.
export const OptionalEventDateSchema = z
  .union([EventDateSchema, z.literal('')])
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

export function datesInOrder(v: { startsOn?: string | null; endsOn?: string | null }): boolean {
  return !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn
}

export const CreateEventSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    pinCode: z.string().regex(/^[A-Z0-9]{4,10}$/),
    tableRangeFrom: z.number().int().min(1),
    tableRangeTo: z.number().int().min(1),
    startsOn: OptionalEventDateSchema,
    endsOn: OptionalEventDateSchema,
  })
  .refine((v) => v.tableRangeTo >= v.tableRangeFrom, {
    message: 'tableRangeTo must be >= tableRangeFrom',
    path: ['tableRangeTo'],
  })
  .refine(datesInOrder, { message: 'endsOn must be >= startsOn', path: ['endsOn'] })
export type CreateEvent = z.input<typeof CreateEventSchema>

export const EventSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  pinCode: z.string(),
  isActive: z.boolean(),
  tableRangeFrom: z.number().int(),
  tableRangeTo: z.number().int(),
  createdAt: z.string().datetime(),
  activatedAt: z.string().datetime().nullable(),
  // Set when the event was ended; the event can then be deleted for good.
  deactivatedAt: z.string().datetime().nullable(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  trialMode: z.boolean(),
  // Orders placed during rehearsals that have not been deleted yet.
  trialOrders: z.number().int().nonnegative(),
  depositEnabled: z.boolean(),
  staffMealsEnabled: z.boolean(),
  waiterCallsEnabled: z.boolean(),
})
export type EventDto = z.infer<typeof EventSchema>

export const TrialModeSchema = z.object({ enabled: z.boolean() })
export type TrialMode = z.infer<typeof TrialModeSchema>

// Tables can be added or removed while the event runs.
export const TableRangeSchema = z
  .object({ tableRangeFrom: z.number().int().min(1), tableRangeTo: z.number().int().min(1) })
  .refine((v) => v.tableRangeTo >= v.tableRangeFrom, {
    message: 'tableRangeTo must be >= tableRangeFrom',
    path: ['tableRangeTo'],
  })
export type TableRange = z.infer<typeof TableRangeSchema>

export const TrialResetSchema = z.object({
  deletedOrders: z.number().int().nonnegative(),
  deletedPayments: z.number().int().nonnegative(),
  event: EventSchema,
})
export type TrialReset = z.infer<typeof TrialResetSchema>

// What is still open when an event is ended (shown to the admin, stored in the audit log).
export const EndCheckSchema = z.object({
  openTables: z.object({
    count: z.number().int().nonnegative(),
    totalCents: z.number().int().nonnegative(),
    tableNos: z.array(z.number().int()),
  }),
  openCashSessions: z.array(z.object({ username: z.string(), openedAt: z.string().datetime() })),
  // Finished at the kitchen/bar but not brought to the table yet.
  undeliveredItems: z.number().int().nonnegative(),
})
export type EndCheck = z.infer<typeof EndCheckSchema>

export const EventsListSchema = z.object({
  events: z.array(EventSchema),
})
export type EventsList = z.infer<typeof EventsListSchema>

export const CreateMenuItemSchema = z.object({
  nameDe: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  priceCents: z.number().int().min(0).max(100000),
  // Pfand per unit, charged on top of the price; 0 = none.
  depositCents: z.number().int().min(0).max(10000).optional(),
  // Units left; null = not counted. Ordering counts down, 0 = sold out.
  stock: z.number().int().min(0).max(100000).nullable().optional(),
  category: z.string().trim().min(1).max(60),
  // Optional; an empty string clears it (stored as null).
  subcategory: z.string().trim().max(60).nullable().optional().transform((v) => (v === '' ? null : v)),
  station: StationEnum,
  sortOrder: z.number().int().optional(),
  // null = not recorded yet, [] = checked, none of the 14.
  allergens: AllergenListSchema.optional(),
  diet: DietEnum.nullable().optional(),
})
export type CreateMenuItem = z.infer<typeof CreateMenuItemSchema>

export const UpdateMenuItemSchema = CreateMenuItemSchema.partial()
export type UpdateMenuItem = z.infer<typeof UpdateMenuItemSchema>

export const AvailabilityPatchSchema = z.object({
  isAvailable: z.boolean(),
})
export type AvailabilityPatch = z.infer<typeof AvailabilityPatchSchema>

export const AdminMenuItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  nameDe: z.string(),
  nameEn: z.string(),
  priceCents: z.number().int().nonnegative(),
  depositCents: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative().nullable(),
  category: z.string(),
  subcategory: z.string().nullable(),
  station: StationEnum,
  isAvailable: z.boolean(),
  sortOrder: z.number().int(),
  allergens: z.array(AllergenEnum).nullable(),
  diet: DietEnum.nullable(),
  createdAt: z.string().datetime(),
})
export type AdminMenuItem = z.infer<typeof AdminMenuItemSchema>

export const AdminMenuListSchema = z.object({
  eventId: z.string().uuid(),
  items: z.array(AdminMenuItemSchema),
})
export type AdminMenuList = z.infer<typeof AdminMenuListSchema>

export const QrRangeQuerySchema = z
  .object({
    from: z.coerce.number().int().min(1),
    to: z.coerce.number().int().min(1),
  })
  .refine((v) => v.to >= v.from, {
    message: 'to must be >= from',
    path: ['to'],
  })
export type QrRangeQuery = z.infer<typeof QrRangeQuerySchema>

// Result of POST /api/admin/events/{id}/menu-items/import (Excel/CSV price list).
export interface MenuImportRow {
  row: number
  nameDe: string
  action: 'create' | 'update' | 'unchanged'
}

export interface MenuImportResult {
  applied: boolean
  created: number
  updated: number
  unchanged: number
  rows: MenuImportRow[]
  errors: Array<{ row: number; message: string }>
}
