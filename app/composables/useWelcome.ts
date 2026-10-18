import { readonly, ref } from 'vue'

// The short guide on the service screen. Waiters see the app once a year:
// it opens by itself the first time an account signs in on this device and
// can be opened again from the menu. Remembered per account id, so a helper
// who joins next year's fest by link (a new account) sees it again.
const KEY = 'welcome-seen'
const open = ref(false)

function seen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  }
  catch {
    return []
  }
}

function restore(staffId: string): void {
  if (!seen().includes(staffId)) open.value = true
}

function dismiss(staffId: string): void {
  open.value = false
  try {
    if (!seen().includes(staffId)) localStorage.setItem(KEY, JSON.stringify([...seen(), staffId]))
  }
  catch { /* shown again next time, nothing breaks */ }
}

function show(): void {
  open.value = true
}

export function useWelcome() {
  return { open: readonly(open), restore, dismiss, show }
}
