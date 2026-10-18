import type { Db } from '../db/client'
import { auditLog } from '../db/schema'

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

// Every action the audit_log_action_chk constraint accepts.
export type AuditAction =
  | 'payment' | 'void' | 'refund' | 'staff_meal'
  | 'event_activate' | 'event_trial' | 'event_trial_data_delete' | 'event_create' | 'event_update'
  | 'event_end' | 'event_delete'
  | 'menu_availability' | 'menu_item_create' | 'menu_item_update' | 'menu_import'
  | 'price_rule_create' | 'price_rule_update' | 'price_rule_delete'
  | 'asset_upload' | 'asset_delete'
  | 'staff_create' | 'staff_update' | 'passkey_add' | 'passkey_remove'
  | 'cash_open' | 'cash_close' | 'deposit_return'
  | 'table_takeover' | 'table_release'

export interface AuditEntry {
  action: AuditAction
  staffId: string | null
  targetKind: string
  targetId: string
  reason?: string | null
  payload?: Record<string, unknown>
}

// Call inside the transaction of the change itself, so both land or neither.
export async function writeAudit(tx: Tx | Db, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({ ...entry, reason: entry.reason ?? null, payload: entry.payload ?? null })
}

// Only the fields that really changed, as { field: { from, to } }.
export function diffFields<T extends Record<string, unknown>>(before: T, updates: Partial<T>): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {}
  for (const [k, to] of Object.entries(updates)) {
    const from = before[k] ?? null
    if (from !== (to ?? null)) out[k] = { from, to: to ?? null }
  }
  return out
}
