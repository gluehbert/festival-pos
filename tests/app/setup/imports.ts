// Stand-ins for the Nuxt auto-imports used by app/ code under unit test.
import { ref } from 'vue'
import { vi } from 'vitest'

export const locale = ref<'de' | 'en'>('en')
export const useI18n = () => ({
  locale,
  locales: ref([{ code: 'en' }, { code: 'de' }]),
  setLocale: async (code: 'de' | 'en') => {
    locale.value = code
  },
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
})

const cookies = new Map<string, ReturnType<typeof ref>>()
export function useCookie<T>(name: string, opts?: { default?: () => T }) {
  if (!cookies.has(name)) cookies.set(name, ref(opts?.default?.() ?? null))
  return cookies.get(name) as ReturnType<typeof ref<T>>
}
export function resetCookies() {
  cookies.clear()
}

export const useRuntimeConfig = () => ({ public: { version: 'abc1234' } })

export const navigateTo = vi.fn(async () => {})

// useFetch stand-in: returns the default value, exposes a refresh spy.
export const fetchRefresh = vi.fn(async () => {})
export function useFetch<T>(_url: string, opts?: { default?: () => T }) {
  return { data: ref(opts?.default?.() ?? null), refresh: fetchRefresh }
}
