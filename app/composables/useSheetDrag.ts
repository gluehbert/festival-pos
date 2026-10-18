import { computed, ref } from 'vue'

// A drag this far (px) down or up counts as a swipe; less springs back.
const CLOSE_PX = 80
const GROW_PX = 50
// Movement below this is a tap, not a drag.
const TAP_PX = 6

// Bottom sheet moved by its grip, like native sheets: drag up makes it tall,
// drag down makes a tall sheet normal again or closes a normal one. A tap
// toggles the size, so keyboard and screen reader users get the same.
export function useSheetDrag(close: () => void) {
  const tall = ref(false)
  const dragging = ref(false)
  const delta = ref(0)
  let startY = 0
  let dragged = false

  // Only downward moves the sheet; up is just the gesture to grow it.
  const style = computed(() => ({
    transform: delta.value > 0 ? `translateY(${delta.value}px)` : undefined,
    transition: dragging.value ? 'none' : 'transform 0.2s ease-out',
  }))

  function start(e: PointerEvent) {
    dragging.value = true
    dragged = false
    startY = e.clientY
    delta.value = 0
    ;(e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId)
  }

  function move(e: PointerEvent) {
    if (!dragging.value) return
    delta.value = e.clientY - startY
    if (Math.abs(delta.value) > TAP_PX) dragged = true
  }

  function end() {
    if (!dragging.value) return
    dragging.value = false
    const dy = delta.value
    delta.value = 0
    if (dy > CLOSE_PX) {
      if (tall.value) tall.value = false
      else close()
    }
    else if (dy < -GROW_PX) {
      tall.value = true
    }
  }

  // The click that follows a drag must not toggle the size again.
  function tap() {
    if (dragged) {
      dragged = false
      return
    }
    tall.value = !tall.value
  }

  // The browser took the gesture over: spring back, change nothing.
  function cancel() {
    dragging.value = false
    dragged = false
    delta.value = 0
  }

  function reset() {
    tall.value = false
    dragging.value = false
    delta.value = 0
  }

  return { tall, style, start, move, end, cancel, tap, reset }
}
