# Contracts: Production Queue

## `GET /api/production/queue`
- **Auth**: kitchen | bar (role must match the station) | admin (all stations)
- **Query**: `?station=kitchen|bar` (required except for admin)
- **Response 200** (FR-020):
  ```ts
  z.object({
    station: z.enum(['kitchen','bar']),
    items: z.array(z.object({
      orderItemId: z.string().uuid(),
      orderId: z.string().uuid(),
      tableNo: z.number().int(),
      nameDe: z.string(),
      nameEn: z.string(),
      quantity: z.number().int(),
      productionStatus: z.enum(['pending','in_progress']),
      orderedAt: z.string().datetime(),
    })),
  })
  ```
- Sorting: `orderedAt ASC`.
- `done` and `cancelled` are hidden (separate history endpoint in phase 2).

## `PATCH /api/production/items/{id}`
- **Auth**: kitchen | bar (matching the item's station) | admin
- **Headers**: `X-CSRF-TOKEN`
- **Request**:
  ```ts
  z.object({
    nextStatus: z.enum(['in_progress','done']),
  })
  ```
- **Behavior** (FR-021):
  - `pending → in_progress` and `in_progress → done` allowed.
  - Other transitions → 409 `CONFLICT`.
- **Response 200**:
  ```ts
  z.object({
    orderItemId: z.string().uuid(),
    productionStatus: z.enum(['pending','in_progress','done','cancelled']),
  })
  ```
