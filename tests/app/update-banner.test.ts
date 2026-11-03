import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useUpdateAvailable } from '~/composables/useUpdateAvailable'
import { pwa } from './setup/imports'

// The waiting service worker's script names the build it precaches.
function waitingWorker(script: string | Error) {
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: async () => ({ waiting: { scriptURL: 'http://localhost/sw.js' } }) },
  })
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (script instanceof Error) throw script
    return new Response(script)
  }))
}

async function needRefresh() {
  pwa.needRefresh = true
  await nextTick()
  await flushPromises()
}

describe('useUpdateAvailable', () => {
  afterEach(() => {
    pwa.needRefresh = false
    vi.unstubAllGlobals()
  })

  it('offers the reload when the waiting worker is a newer build than the page', async () => {
    waitingWorker('precache([{url:"_nuxt/builds/meta/build-c.json"}])')
    const { updateAvailable } = useUpdateAvailable()
    expect(updateAvailable.value).toBe(false)
    await needRefresh()
    expect(updateAvailable.value).toBe(true)
  })

  it('stays quiet when the page already runs the waiting build', async () => {
    waitingWorker('precache([{url:"_nuxt/builds/meta/build-b.json"}])')
    const { updateAvailable } = useUpdateAvailable()
    await needRefresh()
    expect(updateAvailable.value).toBe(false)
  })

  it('offers the reload when the worker script cannot be read', async () => {
    waitingWorker(new Error('offline'))
    const { updateAvailable } = useUpdateAvailable()
    await needRefresh()
    expect(updateAvailable.value).toBe(true)
  })

  it('activates the waiting worker on reload', async () => {
    const { applyUpdate, updating } = useUpdateAvailable()
    const done = applyUpdate()
    expect(updating.value).toBe(true)
    await done
    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true)
    expect(updating.value).toBe(false)
  })
})
