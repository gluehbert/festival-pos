import { readonly, ref } from 'vue'

// What this device mostly does: a waiter's phone takes table orders, the
// counter device takes walk-in orders. Only weights the order buttons on the
// service screen; remembered per device, shared by all components.
export type DeviceMode = 'service' | 'counter'
export const DEVICE_MODES: readonly DeviceMode[] = ['service', 'counter']

const KEY = 'device-mode'
const mode = ref<DeviceMode>('service')

function restore(): void {
  try {
    mode.value = localStorage.getItem(KEY) === 'counter' ? 'counter' : 'service'
  }
  catch { /* storage blocked: default */ }
}

function setMode(next: DeviceMode): void {
  mode.value = next
  try {
    localStorage.setItem(KEY, next)
  }
  catch { /* not remembered, still works */ }
}

export function useDeviceMode() {
  return { mode: readonly(mode), restore, setMode }
}
