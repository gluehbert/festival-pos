# Contracts: Tickets, Payments & Voids

## `GET /api/tickets`
- **Auth**: waiter | admin
- **Query**: `?status=open|paid|all` (default `open`), `?station=kitchen|bar` optional
- **Response 200**:
  ```ts
  z.object({
    tickets: z.array(z.object({
      ticketKey: z.string(),               // e.g. `t-12` for table 12, `w-<orderId>` for walk-in
      tableNo: z.number().int(),
      status: z.enum(['open','paid']),
      totalCents: z.number().int(),
      unpaidCents: z.number().int(),
      oldestItemAt: z.string().datetime(),
      lockedBy: z.string().uuid().nullable(),
    })),
  })
  ```

## `GET /api/tickets/{id}`
- `id` = `ticketKey` (table or walk-in variant)
- **Auth**: waiter | admin
- **Response 200**: Detail view with all `order_items` of the table/walk-in, including `productionStatus` and `paymentStatus`.

## `POST /api/payments`
- **Auth**: waiter | admin (FR-012, FR-014, FR-015)
- **Headers**: `X-CSRF-TOKEN`
- **Request**:
  ```ts
  z.object({
    ticketKey: z.string(),
    orderItemIds: z.array(z.string().uuid()).min(1),  // explicit selection
  })
  ```
- **Behavior**:
  - Tries to acquire a `payment_lock` (FR-015). On conflict → 409 `CONFLICT` with `lockedBy` and `expiresAt`.
  - Validates that all `orderItemIds` belong to the ticket, are `unpaid` and not `cancelled`.
  - Creates `payments` + `payment_items`, sets `payment_status='paid'`.
  - Writes `audit_log` action `payment` with `staff_id`, total, affected items (FR-016).
- **Response 201**:
  ```ts
  z.object({
    paymentId: z.string().uuid(),
    totalCents: z.number().int(),
    ticketStatusAfter: z.enum(['open','paid']),
  })
  ```

## `POST /api/payments/{lockId}/release`
- **Auth**: waiter | admin
- **Response 200**: `{ ok: true }`
- Auto-release additionally runs on demand on the next ticket request.

## `POST /api/order-items/{id}/void`
*(formerly `/api/admin/menu-items/{id}/void`; `{id}` is the order item)*

- **Auth**: admin | waiter (FR-012). Only with an active event, only items of that event.
- **Request**:
  ```ts
  z.object({ reason: z.string().min(3).max(200) })
  ```
- **Rule**: A waiter (Bedienung) may only void items with `production_status` `pending`/`in_progress`. Finished or served items can only be voided by the admin (fraud protection). Paid items go through `POST /api/admin/order-items/{id}/refund`.
- **Behavior**: Sets `production_status='cancelled'`, `voided_by_staff`, `voided_at`, `void_reason`, returns stock. Writes `audit_log` action `void`.
- **Errors**: 400 `VALIDATION`, 403 `FORBIDDEN` (kitchen/bar), 403 `VOID_ADMIN_ONLY` (waiter, item finished/served), 404 `NOT_FOUND` (no active event / different event), 409 `VOID_PAID`, 409 `VOID_CANCELLED`, 409 `CONFLICT` (changed concurrently).
