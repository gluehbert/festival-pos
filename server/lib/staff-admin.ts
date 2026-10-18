import type { staff } from '../db/schema'
import { StaffDtoSchema, type StaffDto } from './contracts/staff-admin'

export const BCRYPT_COST = 10

export function toStaffDto(row: typeof staff.$inferSelect): StaffDto {
  return StaffDtoSchema.parse({
    id: row.id,
    username: row.username,
    role: row.role,
    isActive: row.isActive,
    hasPassword: row.passwordHash !== null,
    hasPin: row.pinHash !== null,
    createdAt: new Date(row.createdAt).toISOString(),
  })
}
