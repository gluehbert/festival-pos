// What the waiter last heard from a table: an order (guest QR or waiter) or
// "asked, nothing wanted". The newer of the two wins; walk-ins have no table.

export interface TableActivity {
  kind: 'order' | 'check'
  minutes: number
}

export function tableActivity(lastOrderAt: string, lastCheckAt: string | null, nowMs: number): TableActivity {
  const order = Date.parse(lastOrderAt)
  const check = lastCheckAt ? Date.parse(lastCheckAt) : Number.NaN
  const useCheck = Number.isFinite(check) && check > order
  const at = useCheck ? check : order
  return { kind: useCheck ? 'check' : 'order', minutes: Math.max(0, Math.floor((nowMs - at) / 60_000)) }
}
