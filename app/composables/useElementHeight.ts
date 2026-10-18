import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

// Live height of an element, e.g. a fixed bottom bar that grows when its
// content opens, so the page can keep enough room below the last row.
export function useElementHeight(el: Readonly<Ref<HTMLElement | null>>): Ref<number> {
  const height = ref(0)
  let observer: ResizeObserver | undefined
  onMounted(() => {
    if (!el.value) return
    height.value = el.value.offsetHeight
    if (typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver(() => {
      if (el.value) height.value = el.value.offsetHeight
    })
    observer.observe(el.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return height
}
