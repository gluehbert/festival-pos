import { readonly, ref } from 'vue'

// Allergen codes and vegan/vegetarian tags stay hidden until someone switches
// them on with the toggle next to the menu tabs. Shared by guest and staff
// menus, remembered per device.

const STORAGE_KEY = 'show-allergens'
const shown = ref(false)
let loaded = false

// Client only, from onMounted.
function init(): void {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    shown.value = localStorage.getItem(STORAGE_KEY) === 'on'
  }
  catch { /* storage blocked: stays off */ }
}

function toggle(): void {
  shown.value = !shown.value
  try {
    localStorage.setItem(STORAGE_KEY, shown.value ? 'on' : 'off')
  }
  catch { /* not remembered, still works */ }
}

export function useAllergenDisplay() {
  return { shown: readonly(shown), init, toggle }
}
