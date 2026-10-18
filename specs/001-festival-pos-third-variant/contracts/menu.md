# Contracts: Menu

## `GET /api/menu`
- **Auth**: guest (preferred) or none (public read)
- **Response 200**:
  ```ts
  z.object({
    eventId: z.string().uuid(),
    items: z.array(z.object({
      id: z.string().uuid(),
      nameDe: z.string(),
      nameEn: z.string(),
      priceCents: z.number().int().nonnegative(),
      category: z.string(),
      station: z.enum(['kitchen','bar']),
      isAvailable: z.boolean(),
      sortOrder: z.number().int(),
    })),
  })
  ```
- Briefly cached server-side (5 s) to cushion cold starts (NFR-002).

## `PATCH /api/menu/{id}/availability`
- **Auth**: admin (FR-033)
- **Request**:
  ```ts
  z.object({ isAvailable: z.boolean() })
  ```
- **Response 200**: single `MenuItemSchema` (see above)
- Writes `audit_log` with action `menu_availability`.
- **Errors**: 404 `NOT_FOUND`.
