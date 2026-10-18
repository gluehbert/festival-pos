# Contracts: Admin

## Events

### `GET /api/admin/events`
- **Auth**: admin
- **Response 200**:
  ```ts
  z.object({
    events: z.array(z.object({
      id: z.string().uuid(),
      name: z.string(),
      isActive: z.boolean(),
      tableRangeFrom: z.number().int(),
      tableRangeTo: z.number().int(),
      createdAt: z.string().datetime(),
      activatedAt: z.string().datetime().nullable(),
    })),
  })
  ```

### `POST /api/admin/events`
- **Auth**: admin
- **Request**:
  ```ts
  z.object({
    name: z.string().trim().min(1).max(200),
    pinCode: z.string().regex(/^[A-Z0-9]{4,10}$/),
    tableRangeFrom: z.number().int().min(1),
    tableRangeTo: z.number().int().min(1),
  }).refine(v => v.tableRangeTo >= v.tableRangeFrom, { message: 'range invalid' })
  ```
- **Response 201**: `EventSchema`

### `POST /api/admin/events/{id}/activate`
- **Auth**: admin
- **Behavior** (FR-030): deactivates any previous event in one transaction and activates the given one. Writes `audit_log` action `event_activate`.
- **Response 200**: `EventSchema`

## Menu items (admin view)

### `GET /api/admin/menu-items`
- **Auth**: admin
- **Response 200**: complete list including inactive/sold-out items.

### `POST /api/admin/menu-items`
- **Auth**: admin
- **Request**:
  ```ts
  z.object({
    nameDe: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    priceCents: z.number().int().min(0).max(100000),
    category: z.string().trim().min(1).max(60),
    station: z.enum(['kitchen','bar']),
    sortOrder: z.number().int().optional(),
  })
  ```

### `PATCH /api/admin/menu-items/{id}`
- **Auth**: admin
- **Request**: partial of the fields above.

## QR code PDF

### `GET /api/admin/qr-codes?from=&to=`
- **Auth**: admin
- **Query**: `from`, `to` (required, integers within the event range).
- **Response 200**: `Content-Type: application/pdf`, stream of the A4 PDF (FR-031).
- **Errors**: 400 `VALIDATION` (invalid range), 404 (no active event).

## Reports

### `GET /api/admin/reports?format=json|csv&type=<reportType>`
- **Auth**: admin
- **Query**:
  - `format`: `json` (default) | `csv`
  - `type`: `revenue_by_category` | `top_items` | `voids` | `payments_by_staff` | `orders_per_hour`
- **Response 200 (JSON)** — example `revenue_by_category`:
  ```ts
  z.object({
    eventId: z.string().uuid(),
    generatedAt: z.string().datetime(),
    rows: z.array(z.object({
      category: z.string(),
      totalCents: z.number().int(),
      itemCount: z.number().int(),
    })),
  })
  ```
- **Response 200 (CSV)** (FR-035): `Content-Type: text/csv; charset=utf-8`, BOM (`﻿`), semicolon separator.
