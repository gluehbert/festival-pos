import { z } from 'zod'
import { AllergenEnum, DietEnum } from '../allergens'
import { MenuPromoSchema } from './pricing'

export const CreateGuestSessionSchema = z
  .object({
    eventId: z.string().uuid().optional(),
    tableNo: z.number().int().min(1),
    // `key` comes from the table QR code, `pin` is the event PIN typed in by hand.
    key: z.string().min(1).max(64).optional(),
    pin: z.string().trim().toUpperCase().min(1).max(20).optional(),
  })
  .refine((v) => v.key || v.pin, { message: 'key or pin required', path: ['key'] })
export type CreateGuestSession = z.infer<typeof CreateGuestSessionSchema>

export const GuestSessionSchema = z.object({
  sessionId: z.string().uuid(),
  eventId: z.string().uuid(),
  tableNo: z.number().int(),
  expiresAt: z.string().datetime(),
})
export type GuestSession = z.infer<typeof GuestSessionSchema>

export const StationEnum = z.enum(['kitchen', 'bar'])
export const ProductionStatusEnum = z.enum(['pending', 'in_progress', 'done', 'cancelled'])
export const PaymentStatusEnum = z.enum(['unpaid', 'paid'])

export const MenuItemSchema = z.object({
  id: z.string().uuid(),
  nameDe: z.string(),
  nameEn: z.string(),
  // Price right now, a running price rule included (Pfand never changes).
  priceCents: z.number().int().nonnegative(),
  // Menu price without promotion; shown struck through while promo is set.
  regularPriceCents: z.number().int().nonnegative().optional(),
  promo: MenuPromoSchema.nullable().optional(),
  depositCents: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative().nullable(),
  category: z.string(),
  subcategory: z.string().nullable(),
  station: StationEnum,
  isAvailable: z.boolean(),
  sortOrder: z.number().int(),
  // null = not recorded ("ask the staff"), [] = none of the 14.
  allergens: z.array(AllergenEnum).nullable(),
  diet: DietEnum.nullable(),
})
export type MenuItemDto = z.infer<typeof MenuItemSchema>

export const MenuSchema = z.object({
  eventId: z.string().uuid(),
  items: z.array(MenuItemSchema),
})
export type Menu = z.infer<typeof MenuSchema>

// Menu item ids for the "Popular" tab, most ordered first: what this table
// ordered during the event, and the event's best sellers.
export const PopularItemsSchema = z.object({
  tableNo: z.number().int().nullable(),
  table: z.array(z.string().uuid()),
  event: z.array(z.string().uuid()),
})
export type PopularItems = z.infer<typeof PopularItemsSchema>

// Most items a guest may order at once via QR code (waiters: no limit).
export const GUEST_MAX_ITEMS_PER_ORDER = 40

// Free-text wish for kitchen/bar ("ohne Zwiebeln"); blank means none.
export const NOTE_MAX_LENGTH = 80
export const OrderNoteSchema = z
  .string()
  .trim()
  .max(NOTE_MAX_LENGTH)
  .transform((v) => (v.length > 0 ? v : null))

export const CreateOrderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  note: OrderNoteSchema.nullish().transform((v) => v ?? null),
})
export type CreateOrderItem = z.infer<typeof CreateOrderItemSchema>

export const CreateOrderSchema = z.object({
  tableNo: z.number().int().min(0),
  createWalkin: z.boolean().optional().default(false),
  // Staff only. 'staff_table' adds to the table ticket like a guest order;
  // 'walkin' (same as createWalkin) creates its own ticket; 'staff_meal'
  // books food for helpers at 0 € with a reason, settled right away.
  mode: z.enum(['staff_table', 'walkin', 'staff_meal']).optional(),
  staffMealReason: z.string().trim().min(3).max(120).optional(),
  items: z.array(CreateOrderItemSchema).min(1).max(50),
}).refine((v) => v.mode !== 'staff_meal' || !!v.staffMealReason, {
  message: 'staffMealReason required for staff meals',
  path: ['staffMealReason'],
})
export type CreateOrder = z.infer<typeof CreateOrderSchema>

export const OrderResponseItemSchema = z.object({
  orderItemId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  quantity: z.number().int(),
  // Booked price: computed by the server at order time, never taken from the client.
  unitPriceCents: z.number().int(),
  depositCents: z.number().int(),
  // Set when a price rule applied: menu price and the rule's name.
  regularPriceCents: z.number().int().nullable().optional(),
  priceRuleName: z.string().nullable().optional(),
  note: z.string().nullable(),
  productionStatus: z.literal('pending'),
  // 'paid' only for staff meals, which are settled when booked.
  paymentStatus: PaymentStatusEnum,
})
export type OrderResponseItem = z.infer<typeof OrderResponseItemSchema>

export const OrderSchema = z.object({
  orderId: z.string().uuid(),
  tableNo: z.number().int(),
  items: z.array(OrderResponseItemSchema),
  tableBalanceCents: z.number().int().nonnegative(),
})
export type Order = z.infer<typeof OrderSchema>

export const SessionOrderItemSchema = z.object({
  orderItemId: z.string().uuid(),
  nameDe: z.string(),
  nameEn: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  note: z.string().nullable(),
  productionStatus: ProductionStatusEnum,
  paymentStatus: PaymentStatusEnum,
})
export type SessionOrderItem = z.infer<typeof SessionOrderItemSchema>

export const SessionOrdersSchema = z.object({
  tableNo: z.number().int(),
  ticketStatus: z.enum(['open', 'paid']),
  items: z.array(SessionOrderItemSchema),
  tableBalanceCents: z.number().int(),
})
export type SessionOrders = z.infer<typeof SessionOrdersSchema>
