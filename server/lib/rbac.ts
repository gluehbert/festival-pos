import type { H3Event } from 'h3'
import { AppError } from './errors'
import type { StaffJwtPayload, StaffRole } from './auth'

export function requireRole(event: H3Event, roles: readonly StaffRole[]): StaffJwtPayload {
  const staff = event.context.auth?.staff as StaffJwtPayload | undefined
  if (!staff) {
    throw new AppError('UNAUTHORIZED', 401, 'Authentication required')
  }
  if (roles.length > 0 && !roles.includes(staff.role)) {
    throw new AppError('FORBIDDEN', 403, `Role '${staff.role}' is not permitted here`)
  }
  return staff
}

export function requireStaff(event: H3Event): StaffJwtPayload {
  return requireRole(event, [])
}

// Staff who work one production station (their role is the station).
export const STATION_ROLES = ['kitchen', 'bar', 'cafe'] as const
export const isStationRole = (role: StaffRole): role is (typeof STATION_ROLES)[number] => (STATION_ROLES as readonly StaffRole[]).includes(role)

// Everyone who takes orders and cashes up in the service area.
export const SERVICE_ROLES: readonly StaffRole[] = ['waiter', 'lead', 'admin']
// Who hands out tables to others at the start of a shift.
export const TABLE_LEAD_ROLES: readonly StaffRole[] = ['lead', 'admin']
// Who can hold tables: the people serving them (admins only via a shift lead).
export const SERVING_ROLES: readonly StaffRole[] = ['waiter', 'lead']
// Who sees and answers guests' calls for the service: the service, and the
// bar screen that every waiter walks past.
export const CALL_ROLES: readonly StaffRole[] = ['waiter', 'lead', 'admin', 'bar']
