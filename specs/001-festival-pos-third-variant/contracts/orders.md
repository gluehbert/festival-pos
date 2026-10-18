# Contracts: Orders (guest & walk-in)

## `POST /api/orders`
- **Auth**: guest OR staff (waiter/admin for walk-in)
- **Headers**: `Idempotency-Key: <uuid>` (FR-006), `X-CSRF-TOKEN`
- **Request**:
  ```ts
  z.object({
    tableNo: z.number().int().min(1),  // walk-in: optional marker via createWalkin
    createWalkin: z.boolean().optional().default(false),
    items: z.array(z.object({
      menuItemId: z.string().uuid(),
      quantity: z.number().int().min(1).max(50),
    })).min(1),
  })
  ```
- **Response 201**:
  ```ts
  z.object({
    orderId: z.string().uuid(),
    tableNo: z.number().int(),
    items: z.array(z.object({
      orderItemId: z.string().uuid(),
      menuItemId: z.string().uuid(),
      quantity: z.number().int(),
      unitPriceCents: z.number().int(),
      productionStatus: z.literal('pending'),
      paymentStatus: z.literal('unpaid'),
    })),
    tableBalanceCents: z.number().int().nonnegative(),
  })
  ```
- **Idempotency**: with an identical `Idempotency-Key` within 10 min → 200 with the same order.
- **Errors**: 400 `VALIDATION` (item not available), 403 `FORBIDDEN` (a guest may not order for another table), 404 (item does not belong to the active event).

## `GET /api/orders/session`
- **Auth**: guest
- **Response 200** (FR-007):
  ```ts
  z.object({
    tableNo: z.number().int(),
    ticketStatus: z.enum(['open','paid']),
    items: z.array(z.object({
      orderItemId: z.string().uuid(),
      nameDe: z.string(),
      nameEn: z.string(),
      quantity: z.number().int(),
      unitPriceCents: z.number().int(),
      productionStatus: z.enum(['pending','in_progress','done','cancelled']),
      paymentStatus: z.enum(['unpaid','paid']),
    })),
    tableBalanceCents: z.number().int(),  // table balance (all guests)
  })
  ```
- Returns only items of the calling guest session.
