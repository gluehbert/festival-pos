// Tip that rounds a bill up to the next full euro, above 20 € to the next
// 5 €; 0 when the bill is already round.
export function roundUpTipCents(billCents: number): number {
  const step = billCents > 2000 ? 500 : 100
  return (step - (billCents % step)) % step
}

// Cents as the text of an amount field: 250 → "2,50".
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}
