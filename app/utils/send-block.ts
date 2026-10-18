// Why the staff pad cannot send yet: a greyed-out button alone does not tell
// the waiter that the table number (or the staff meal reason) is missing.
export type SendBlock = 'empty' | 'table' | 'mealReason' | null

export function sendBlock(state: { empty: boolean, tableValid: boolean, mealValid: boolean }): SendBlock {
  if (state.empty) return 'empty'
  if (!state.tableValid) return 'table'
  if (!state.mealValid) return 'mealReason'
  return null
}
