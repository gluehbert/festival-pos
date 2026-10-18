# Contracts: Auth & Session

## `GET /api/csrf-token`
- **Auth**: optional (guest or staff)
- **Response 200**:
  ```ts
  z.object({ csrfToken: z.string().min(32) })
  ```
- Additionally sets the `csrf` cookie (HttpOnly: false, SameSite=Strict).

## `POST /api/session` (guest session)
- **Auth**: none
- **Request**:
  ```ts
  z.object({
    eventId: z.string().uuid().optional(), // otherwise the active event
    tableNo: z.number().int().min(1),
  })
  ```
- **Response 201**:
  ```ts
  z.object({
    sessionId: z.string().uuid(),
    eventId: z.string().uuid(),
    tableNo: z.number().int(),
    expiresAt: z.string().datetime(),
  })
  ```
- Sets the `pos_guest` cookie (JWT, HttpOnly, SameSite=Strict, 7 days).
- **Errors**: 400 `VALIDATION` (table outside event range), 404 `NOT_FOUND` (no active event).

## `POST /api/auth/login`
- **Auth**: none
- **Request**:
  ```ts
  z.object({
    username: z.string().min(1),
    secret: z.string().min(4),  // password OR PIN
    kind: z.enum(['password','pin']),
  })
  ```
- **Response 200**:
  ```ts
  z.object({
    staffId: z.string().uuid(),
    username: z.string(),
    role: z.enum(['admin','waiter','kitchen','bar']),
  })
  ```
- Sets the `pos_staff` cookie (JWT, HttpOnly, SameSite=Strict).
- **Errors**: 401 `UNAUTHORIZED` (wrong credentials), 403 `FORBIDDEN` (account deactivated).

## `POST /api/auth/logout`
- **Auth**: staff
- **Response 200**: `z.object({ ok: z.literal(true) })`
- Deletes the `pos_staff` cookie.
