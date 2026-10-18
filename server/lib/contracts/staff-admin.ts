import { z } from 'zod'

export const StaffRoleEnum = z.enum(['admin', 'lead', 'waiter', 'kitchen', 'bar'])

const Username = z.string().trim().regex(/^[\w.-]{3,64}$/, 'username: 3-64 letters, digits, . _ -')
// Admins log in with a password, everyone else may use a PIN.
const Password = z.string().min(12).max(200)
const Pin = z.string().regex(/^\d{4,8}$/, 'PIN: 4-8 digits')

export const CreateStaffSchema = z
  .object({
    username: Username,
    role: StaffRoleEnum,
    password: Password.optional(),
    pin: Pin.optional(),
  })
  .refine((v) => v.password || v.pin, { message: 'password or pin required', path: ['password'] })
  .refine((v) => v.role !== 'admin' || v.password, { message: 'admins need a password', path: ['password'] })
  .refine((v) => v.role !== 'admin' || !v.pin, { message: 'admins log in with a password only', path: ['pin'] })
export type CreateStaff = z.infer<typeof CreateStaffSchema>

export const UpdateStaffSchema = z
  .object({
    role: StaffRoleEnum.optional(),
    isActive: z.boolean().optional(),
    password: Password.optional(),
    pin: Pin.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' })
export type UpdateStaff = z.infer<typeof UpdateStaffSchema>

export const StaffDtoSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  role: StaffRoleEnum,
  isActive: z.boolean(),
  hasPassword: z.boolean(),
  hasPin: z.boolean(),
  createdAt: z.string().datetime(),
})
export type StaffDto = z.infer<typeof StaffDtoSchema>

export const StaffListSchema = z.object({ staff: z.array(StaffDtoSchema) })
export type StaffList = z.infer<typeof StaffListSchema>
