# Phase 1 Data Model: Festival POS — Serverless MVP

**Feature**: `001-festival-pos-third-variant`
**Date**: 2026-05-28
**Source**: spec.md "Key Entities" + research.md D3 + the .NET variant as functional reference.

The data model is deliberately **flat** and fits entirely into a single Drizzle schema file (`server/db/schema.ts`, target ≤ 300 lines). Tables are **not a separate aggregate** but an integer range per event (spec requirement).

## Overview (aggregate boundaries)

```
Event ─┬─ MenuItem (1:N)
       ├─ GuestSession (1:N)
       └─ Order (1:N) ─┬─ OrderItem (1:N) ─── ProductionStatus
                       └─ Ticket (aggregate over open OrderItems per table)
                                       └─ Payment (1:N) ─── PaymentLock
Staff (global, cross-event)
AuditLogEntry (global, append-only)
```

## Tables

### `events`
| Field             | Type                  | Constraint                                  | Description |
|-------------------|-----------------------|---------------------------------------------|--------------|
| `id`              | `uuid`                | PK, default `gen_random_uuid()`             | |
| `name`           | `text`                | NOT NULL                                    | |
| `pin_code`        | `varchar(10)`         | NOT NULL, UNIQUE                            | Quick login at stations |
| `table_range_from`| `integer`             | NOT NULL, ≥ 1                               | Lower bound of table numbers |
| `table_range_to`  | `integer`             | NOT NULL, ≥ `table_range_from`              | Upper bound of table numbers |
| `is_active`       | `boolean`             | NOT NULL, default `false`                   | |
| `created_at`      | `timestamptz`         | NOT NULL, default `now()`                   | |
| `activated_at`    | `timestamptz`         | NULL                                         | |
| `deactivated_at`  | `timestamptz`         | NULL                                         | |

**Indexes**:
- `UNIQUE INDEX events_only_one_active ON events(is_active) WHERE is_active = true`

**Rules**:
- At most one active event (DB constraint, FR-030).
- `name` trimmed and non-empty (app check).

### `menu_items`
| Field         | Type           | Constraint                          | Description |
|---------------|----------------|-------------------------------------|--------------|
| `id`          | `uuid`         | PK                                  | |
| `event_id`    | `uuid`         | NOT NULL, FK → `events.id`          | |
| `name_de`     | `text`         | NOT NULL                            | |
| `name_en`     | `text`         | NOT NULL                            | |
| `price_cents` | `integer`      | NOT NULL, ≥ 0                       | EUR in cents |
| `category`    | `text`         | NOT NULL                            | free-form category |
| `station`     | `text`         | NOT NULL, in (`'kitchen'`,`'bar'`)  | Target station |
| `is_available`| `boolean`      | NOT NULL, default `true`            | live toggle (FR-033) |
| `sort_order`  | `integer`      | NOT NULL, default `0`               | |
| `created_at`  | `timestamptz`  | NOT NULL, default `now()`           | |

**Indexes**: `(event_id, sort_order)`, `(event_id, is_available)`.

### `staff`
| Field          | Type                  | Constraint                                          | Description |
|----------------|-----------------------|-----------------------------------------------------|--------------|
| `id`           | `uuid`                | PK                                                  | |
| `username`     | `text`                | NOT NULL, UNIQUE                                    | Login name |
| `password_hash`| `text`                | NULL                                                | bcrypt hash; NULL allowed if a PIN is set |
| `pin_hash`     | `text`                | NULL                                                | bcrypt hash of the personal PIN |
| `role`         | `text`                | NOT NULL, in (`'admin'`,`'waiter'`,`'kitchen'`,`'bar'`) | |
| `is_active`    | `boolean`             | NOT NULL, default `true`                            | |
| `created_at`   | `timestamptz`         | NOT NULL, default `now()`                           | |

**Rule**: `password_hash` OR `pin_hash` MUST be set (CHECK).

### `guest_sessions`
| Field        | Type           | Constraint                          | Description |
|--------------|----------------|-------------------------------------|--------------|
| `id`         | `uuid`         | PK                                  | referenced in the `pos_guest` cookie |
| `event_id`   | `uuid`         | NOT NULL, FK → `events.id`          | |
| `table_no`   | `integer`      | NOT NULL                            | within the event range |
| `created_at` | `timestamptz`  | NOT NULL, default `now()`           | |
| `expires_at` | `timestamptz`  | NOT NULL                            | = `created_at + 7 days` |

**Indexes**: `(event_id, table_no)`, `(expires_at)` for the sweep.

### `orders`
| Field             | Type           | Constraint                                                   | Description |
|-------------------|----------------|--------------------------------------------------------------|--------------|
| `id`              | `uuid`         | PK                                                           | |
| `event_id`        | `uuid`         | NOT NULL, FK → `events.id`                                   | |
| `table_no`        | `integer`      | NOT NULL                                                     | Walk-in: getting its own `table_no = 0` is **not** allowed; does walk-in use its own table number from the range or a negative pseudo number? See rule. |
| `guest_session_id`| `uuid`         | NULL, FK → `guest_sessions.id`                               | set for guest orders |
| `created_by_staff`| `uuid`         | NULL, FK → `staff.id`                                        | set for walk-in |
| `idempotency_key` | `text`         | NULL                                                         | UNIQUE per `(event_id, guest_session_id, key)` |
| `created_at`      | `timestamptz`  | NOT NULL, default `now()`                                    | |

**Rules**:
- Exactly one of `guest_session_id` / `created_by_staff` is set (CHECK).
- For walk-in (`created_by_staff IS NOT NULL`) a separate ticket is created; FR-013 is implemented via ticket logic, not via a `table_no = 0` convention.
- `UNIQUE (event_id, guest_session_id, idempotency_key) WHERE idempotency_key IS NOT NULL` for FR-006.

### `order_items`
| Field               | Type           | Constraint                                                              | Description |
|---------------------|----------------|-------------------------------------------------------------------------|--------------|
| `id`                | `uuid`         | PK                                                                      | |
| `order_id`          | `uuid`         | NOT NULL, FK → `orders.id`                                              | |
| `menu_item_id`      | `uuid`         | NOT NULL, FK → `menu_items.id`                                          | |
| `quantity`          | `integer`      | NOT NULL, ≥ 1                                                           | |
| `unit_price_cents`  | `integer`      | NOT NULL, ≥ 0                                                           | Snapshot at order time |
| `station`           | `text`         | NOT NULL, in (`'kitchen'`,`'bar'`)                                      | Snapshot |
| `production_status` | `text`         | NOT NULL, default `'pending'`, in (`'pending'`,`'in_progress'`,`'done'`,`'cancelled'`) | |
| `payment_status`    | `text`         | NOT NULL, default `'unpaid'`, in (`'unpaid'`,`'paid'`)                  | |
| `void_reason`       | `text`         | NULL                                                                    | set when cancelled |
| `voided_by_staff`   | `uuid`         | NULL, FK → `staff.id`                                                    | |
| `voided_at`         | `timestamptz`  | NULL                                                                    | |
| `created_at`        | `timestamptz`  | NOT NULL, default `now()`                                               | |

**Indexes**: `(order_id)`, `(station, production_status)` for the production queue, `(payment_status)`.

**State transitions** (FR-021):
- `pending → in_progress → done`
- any status → `cancelled` (only via void; voiding additionally sets `payment_status = 'unpaid'` and excludes the item from statistics).

### `payments`
| Field             | Type           | Constraint                                  | Description |
|-------------------|----------------|---------------------------------------------|--------------|
| `id`              | `uuid`         | PK                                          | |
| `event_id`        | `uuid`         | NOT NULL, FK → `events.id`                  | |
| `staff_id`        | `uuid`         | NOT NULL, FK → `staff.id`                   | |
| `total_cents`     | `integer`      | NOT NULL, ≥ 1                               | Sum of paid items |
| `created_at`      | `timestamptz`  | NOT NULL, default `now()`                   | |

### `payment_items`
| Field             | Type           | Constraint                                  | Description |
|-------------------|----------------|---------------------------------------------|--------------|
| `payment_id`      | `uuid`         | NOT NULL, FK → `payments.id`, ON DELETE CASCADE | |
| `order_item_id`   | `uuid`         | NOT NULL, FK → `order_items.id`, UNIQUE     | each item is paid only once |

### `payment_locks`
| Field             | Type           | Constraint                                  | Description |
|-------------------|----------------|---------------------------------------------|--------------|
| `id`              | `uuid`         | PK                                          | |
| `event_id`        | `uuid`         | NOT NULL                                    | |
| `table_no`        | `integer`      | NOT NULL                                    | Lock on a table (or walk-in ticket) |
| `order_id`        | `uuid`         | NULL, FK → `orders.id`                      | for walk-in: the specific ticket; otherwise NULL = table ticket |
| `staff_id`        | `uuid`         | NOT NULL, FK → `staff.id`                   | |
| `acquired_at`     | `timestamptz`  | NOT NULL, default `now()`                   | |
| `expires_at`      | `timestamptz`  | NOT NULL                                    | = `acquired_at + 60 s` (FR-015) |

**Indexes**: partial UNIQUE `(event_id, table_no, COALESCE(order_id, '00000000-0000-0000-0000-000000000000')) WHERE expires_at > now()` to prevent conflicts. Auto-release via `expires_at` + on-demand sweep.

### `audit_log`
| Field             | Type           | Constraint                                  | Description |
|-------------------|----------------|---------------------------------------------|--------------|
| `id`              | `uuid`         | PK                                          | |
| `action`          | `text`         | NOT NULL, in (`'payment'`,`'void'`,`'event_activate'`,`'menu_availability'`) | |
| `staff_id`        | `uuid`         | NULL, FK → `staff.id`                        | |
| `target_kind`     | `text`         | NOT NULL                                    | e.g. `order_item`, `event`, `menu_item` |
| `target_id`       | `uuid`         | NOT NULL                                    | |
| `reason`          | `text`         | NULL                                         | Required for `void` |
| `payload`         | `jsonb`        | NULL                                         | optional context |
| `created_at`      | `timestamptz`  | NOT NULL, default `now()`                   | |

**Indexes**: `(action, created_at)`, `(staff_id)`.

## Derived views (no materialized view needed)

- **Ticket per table**: aggregates open `order_items` with `(event_id, table_no, payment_status='unpaid', production_status<>'cancelled')`.
- **Production queue**: `order_items` with `(station, production_status IN ('pending','in_progress'))`, sorted by `orders.created_at`.
- **Reports**: SQL aggregations directly in the endpoint, no separate schema.

## Migration strategy

- `drizzle-kit generate` produces SQL in `server/db/migrations/`.
- `drizzle-kit migrate` runs as part of `pnpm build` and on local `pnpm dev` (idempotent).
- Seed (`scripts/seed.ts`) creates: 1 active demo event, 10 menu items (5 kitchen, 5 bar), 20 tables (range 1–20), staff (`admin/admin123`, `waiter1/1111`, `kitchen1/1111`, `bar1/1111`).
