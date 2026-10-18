# API Contracts (Phase 1)

These contracts are documented as **Zod sketches**. In code, the schemas live inline in the respective `server/api/...` endpoint; shared pieces (money schema, pagination) live under `server/lib/schemas/`.

An optional OpenAPI export will be generated later via `zod-to-openapi`; it is **not** a mandatory MVP artifact.

## Cross-references per area

| File                             | Endpoints                                  | Spec FRs              |
|----------------------------------|--------------------------------------------|-----------------------|
| [`auth.md`](./auth.md)           | Login, logout, session, CSRF               | FR-001..003, FR-010, FR-050..052 |
| [`menu.md`](./menu.md)           | Guest menu + availability                  | FR-004, FR-033        |
| [`orders.md`](./orders.md)       | Create order, own orders                   | FR-005..007           |
| [`tickets-payments.md`](./tickets-payments.md) | Tickets, payments, locks, voids | FR-012..016 |
| [`production.md`](./production.md) | Station queue, status changes            | FR-020..022           |
| [`admin.md`](./admin.md)         | Events, menu items, QR PDF, reports        | FR-030..035           |

## Conventions

- All amounts in **cents** (`z.number().int().nonnegative()`).
- IDs are `z.string().uuid()`.
- Timestamps are ISO-8601 strings (`z.string().datetime()`).
- Error responses follow a uniform shape:
  ```ts
  z.object({
    error: z.object({
      code: z.enum(['UNAUTHORIZED','FORBIDDEN','VALIDATION','CONFLICT','NOT_FOUND','RATE_LIMIT','INTERNAL']),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  ```
- Mutating requests (POST/PATCH/DELETE) expect the header `X-CSRF-TOKEN`, which is checked against the `csrf` cookie.
- The order POST additionally expects the header `Idempotency-Key` (UUID v4 from the client).
