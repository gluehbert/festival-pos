import { config } from '@vue/test-utils'
import { beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { locale, navigateTo, resetCookies, useI18n } from './imports'

// Templates call $t(); return the key so assertions stay language-neutral.
config.global.mocks = { $t: (key: string, params?: Record<string, unknown>) => useI18n().t(key, params) }

beforeEach(() => {
  setActivePinia(createPinia())
  locale.value = 'en'
  resetCookies()
  navigateTo.mockClear()
})

// Nuxt auto-imports used without an explicit import in components.
Object.assign(globalThis, { useI18n, navigateTo })

// <UIcon> is registered globally by Nuxt UI; render the icon name so tests can see it.
// <UModal> teleports to <body>; render it in place while open.
config.global.stubs = {
  UIcon: { props: ['name'], template: '<span :data-icon="name" />' },
  UModal: { props: ['open', 'title', 'description'], template: '<div v-if="open" data-test="modal" :data-title="title"><slot name="body" /></div>' },
}
