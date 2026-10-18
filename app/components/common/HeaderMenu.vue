<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useRoute } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import ThemeSwitcher from '~/components/common/ThemeSwitcher.vue'
import LocaleSwitcher from '~/components/common/LocaleSwitcher.vue'
import { DEVICE_MODES, useDeviceMode } from '~/composables/useDeviceMode'
import { useWelcome } from '~/composables/useWelcome'

// One menu instead of a row of links: signed-in staff find their account
// (password, passkeys), the other areas (by role), cash, language, colours
// and sign-out here. Guests only get language and colours.
const auth = useAuthStore()
const route = useRoute()
const device = useDeviceMode()
const version = useRuntimeConfig().public.version
onMounted(device.restore)
// The admin or shift lead sets up the counter device once; waiters never switch.
const setsUpDevices = computed(() => auth.hasRole(['lead', 'admin']))
const initial = computed(() => auth.staff?.username.slice(0, 1).toUpperCase() ?? '')

const links = computed(() => {
  const all = [
    { to: '/staff', key: 'nav.service', show: auth.hasRole('admin') },
    { to: '/production', key: 'nav.production', show: auth.hasRole('admin') },
    { to: '/admin/events', key: 'nav.admin', show: auth.hasRole('admin') },
    { to: '/staff/cash', key: 'staff.cash.nav', show: auth.hasRole(['waiter', 'lead', 'admin']) },
  ]
  return all.filter((l) => l.show)
})

function isCurrent(to: string) {
  return to === '/admin/events' ? route.path.startsWith('/admin') : route.path === to
}

// The short guide opens on the service screen.
const welcome = useWelcome()
const servesTables = computed(() => auth.hasRole(['waiter', 'lead']))
async function openGuide(close: () => void) {
  close()
  welcome.show()
  await navigateTo('/staff')
}

async function logout(close: () => void) {
  close()
  await auth.logout()
  await navigateTo('/staff/login')
}
</script>

<template>
  <UPopover :ui="{ content: 'bg-surface ring-slate-200' }">
    <button
      type="button"
      class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded text-slate-600 hover:bg-slate-100"
      :aria-label="$t(auth.isAuthenticated ? 'nav.account' : 'nav.settings')"
      data-test="header-menu"
    >
      <UIcon :name="auth.isAuthenticated ? 'i-lucide-circle-user-round' : 'i-lucide-globe'" class="size-6" aria-hidden="true" />
      <UIcon name="i-lucide-chevron-down" class="size-3" aria-hidden="true" />
    </button>
    <template #content="{ close }">
      <div class="flex w-64 flex-col gap-3 p-3 text-sm" data-test="header-menu-panel">
        <template v-if="auth.staff">
          <NuxtLink
            to="/staff/account"
            class="-mx-1 flex min-h-[56px] items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-100"
            :class="route.path === '/staff/account' ? 'bg-slate-100' : ''"
            data-test="menu-account"
            @click="close()"
          >
            <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-white" aria-hidden="true">
              {{ initial }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-semibold text-slate-900">{{ auth.staff.username }}</span>
              <span class="block truncate text-xs text-slate-500">
                {{ $t(`admin.staff.roles.${auth.staff.role}`) }} · {{ $t('nav.myAccount') }}
              </span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          </NuxtLink>
          <hr class="border-slate-200">
          <nav class="-mx-1 flex flex-col">
            <NuxtLink
              v-for="l in links"
              :key="l.to"
              :to="l.to"
              class="flex min-h-[44px] items-center rounded px-2 text-slate-700 hover:bg-slate-100"
              :class="isCurrent(l.to) ? 'font-semibold text-slate-900' : ''"
              :data-test="`menu-link-${l.to}`"
              @click="close()"
            >
              {{ $t(l.key) }}
            </NuxtLink>
            <button
              v-if="servesTables"
              type="button"
              class="flex min-h-[44px] items-center gap-2 rounded px-2 text-left text-slate-700 hover:bg-slate-100"
              data-test="menu-guide"
              @click="openGuide(close)"
            >
              <UIcon name="i-lucide-circle-help" class="size-4" aria-hidden="true" />
              {{ $t('staff.welcome.help') }}
            </button>
          </nav>
          <hr class="border-slate-200">
          <div v-if="setsUpDevices" class="flex flex-col gap-1">
            <span class="text-xs text-slate-500">{{ $t('nav.device.label') }}</span>
            <div role="radiogroup" :aria-label="$t('nav.device.label')" class="flex rounded border border-slate-200" data-test="device-mode">
              <button
                v-for="m in DEVICE_MODES"
                :key="m"
                type="button"
                role="radio"
                :aria-checked="device.mode.value === m"
                :data-mode="m"
                class="min-h-[44px] flex-1 rounded px-2"
                :class="device.mode.value === m ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'"
                @click="device.setMode(m)"
              >
                {{ $t(`nav.device.${m}`) }}
              </button>
            </div>
          </div>
        </template>
        <div class="flex flex-col gap-1">
          <span class="text-xs text-slate-500">{{ $t('nav.language') }}</span>
          <LocaleSwitcher />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-xs text-slate-500">{{ $t('common.theme.label') }}</span>
          <ThemeSwitcher />
        </div>
        <template v-if="auth.staff">
          <hr class="border-slate-200">
          <button
            type="button"
            class="flex min-h-[44px] items-center gap-2 rounded px-2 text-left text-slate-700 hover:bg-slate-100"
            data-test="logout"
            @click="logout(close)"
          >
            <UIcon name="i-lucide-log-out" class="size-4" aria-hidden="true" />
            {{ $t('staff.overview.logout') }}
          </button>
        </template>
        <span class="text-right text-xs text-slate-400" data-test="app-version">{{ $t('nav.version', { version }) }}</span>
      </div>
    </template>
  </UPopover>
</template>
