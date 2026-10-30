// Shrinks the type of a list until it fits its box: first in one column down
// to `oneColumnMin` rem, then over two columns down to `min` rem. A narrow
// box stays one column (two would break "3 × Bratwurst" apart) and shrinks
// down to `min` instead. Buzzer
// lanes must show the whole order: nobody scrolls with wet hands or gloves.
// In two columns an overflow runs sideways, so there the width counts too.
// Returns false when even the smallest type does not fit.
export function fitText(el: HTMLElement, max = 3.5, oneColumnMin = 1.5, min = 1, step = 0.125): boolean {
  const fits = () => el.scrollHeight <= el.clientHeight + 1 && (el.style.columnCount !== '2' || el.scrollWidth <= el.clientWidth + 1)
  const tries: Array<[string, number]> = el.clientWidth >= 520 ? [['', oneColumnMin], ['2', min]] : [['', min]]
  for (const [columns, floor] of tries) {
    el.style.columnCount = columns
    for (let size = max; size >= floor; size -= step) {
      el.style.fontSize = `${size}rem`
      if (fits()) return true
    }
  }
  return false
}
