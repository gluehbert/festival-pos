import { ref, type Ref } from 'vue'
import type { OwnerFilter } from '~/utils/table-grid'

export type OverviewView = 'list' | 'grid'

const OWNER_KEY = 'staff-owner-filter'
const VIEW_KEY = 'staff-overview-view'

// Storage may be unavailable (private mode, blocked site data): then the
// choice simply is not remembered.
function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v as T) ? (v as T) : fallback
  }
  catch {
    return fallback
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  }
  catch { /* not remembered, still works */ }
}

// "Meine Tische / Alle" and "Liste / Raster", remembered per device.
export function useStaffView(): {
  owner: Ref<OwnerFilter>
  view: Ref<OverviewView>
  restore: (defaultOwner?: OwnerFilter) => void
  setOwner: (v: OwnerFilter) => void
  setView: (v: OverviewView) => void
} {
  const owner = ref<OwnerFilter>('all')
  const view = ref<OverviewView>('list')
  return {
    owner,
    view,
    restore(defaultOwner = 'all') {
      owner.value = read(OWNER_KEY, ['mine', 'all'] as const, defaultOwner)
      view.value = read(VIEW_KEY, ['list', 'grid'] as const, 'list')
    },
    setOwner(v) {
      owner.value = v
      write(OWNER_KEY, v)
    },
    setView(v) {
      view.value = v
      write(VIEW_KEY, v)
    },
  }
}
