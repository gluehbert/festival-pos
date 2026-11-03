// Why the staff pad cannot send yet: a greyed-out button alone does not tell
// the waiter that the staff meal reason is missing. While the table grid is
// open ('picking') the grid itself asks for the table, so no extra hint.
export type SendBlock = 'empty' | 'picking' | 'mealReason' | null

export function sendBlock(state: { empty: boolean, picking: boolean, mealValid: boolean }): SendBlock {
  if (state.empty) return 'empty'
  if (state.picking) return 'picking'
  if (!state.mealValid) return 'mealReason'
  return null
}
