// Tip that rounds a bill up to the next full euro, above 20 € to the next
// 5 €; 0 when the bill is already round.
export function roundUpTipCents(billCents: number): number {
  const step = billCents > 2000 ? 500 : 100
  return (step - (billCents % step)) % step
}

// Cents as the text of an amount field in the UI language: 250 → "2.50"
// (English) or "2,50" (German). parseEuroInput accepts both.
export function centsToInput(cents: number, locale: string): string {
  const text = (cents / 100).toFixed(2)
  return locale === 'de' ? text.replace('.', ',') : text
}
