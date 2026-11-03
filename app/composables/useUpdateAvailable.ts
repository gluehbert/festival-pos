import { ref, watch } from 'vue'
import { useNuxtApp, useRuntimeConfig } from '#imports'

// A new version is installed but waits until the user reloads (registerType
// 'prompt'), so a deploy never reloads devices mid-order. Pages always come
// from the network, so a page loaded after the deploy already runs the new
// build while its service worker keeps waiting until every tab is closed.
// The waiting worker's script lists its build's meta file: when that names
// this page's build there is nothing to reload, so no banner.
export function useUpdateAvailable() {
  const { $pwa } = useNuxtApp()
  const buildId = useRuntimeConfig().app.buildId
  const updateAvailable = ref(false)
  const updating = ref(false)

  async function runsWaitingBuild() {
    const registration = await navigator.serviceWorker?.getRegistration()
    const url = registration?.waiting?.scriptURL
    if (!url) return false
    try {
      const script = await (await fetch(url, { cache: 'no-store' })).text()
      return script.includes(`builds/meta/${buildId}.json`)
    }
    catch {
      return false
    }
  }

  watch(() => $pwa?.needRefresh === true, async (needRefresh) => {
    updateAvailable.value = needRefresh && !(await runsWaitingBuild())
  }, { immediate: true })

  async function applyUpdate() {
    updating.value = true
    try {
      await $pwa?.updateServiceWorker(true)
    }
    finally {
      updating.value = false
    }
  }

  return { updateAvailable, updating, applyUpdate }
}
