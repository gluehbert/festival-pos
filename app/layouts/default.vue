<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useBranding } from '~/composables/useBranding'
import { useUpdateAvailable } from '~/composables/useUpdateAvailable'
import HeaderMenu from '~/components/common/HeaderMenu.vue'
import AlertBell from '~/components/common/AlertBell.vue'
import DisplayMenu from '~/components/production/DisplayMenu.vue'
import { useAuthStore } from '~/stores/auth'
import EventLogo from '~/components/common/EventLogo.vue'
import LegalFooter from '~/components/common/LegalFooter.vue'
import PasskeyOffer from '~/components/staff/PasskeyOffer.vue'

const route = useRoute()
const auth = useAuthStore()
// Guest-facing pages get the Impressum/Datenschutz footer, staff screens not.
const isGuestPage = computed(() => !/^\/(staff|admin|production)(\/|$)/.test(route.path))
// Alerts only sound on the working screens (service, kitchen, bar).
const showBell = computed(() => auth.isAuthenticated && /^\/(staff|production)(\/|$)/.test(route.path))
// Zoom, fullscreen and screen-on for the kitchen/bar screen.
const showDisplay = computed(() => auth.isAuthenticated && /^\/production(\/|$)/.test(route.path))
const { branding } = useBranding()
const isOnline = ref(true)
const { updateAvailable, updating, applyUpdate } = useUpdateAvailable()

function syncOnline() {
  if (typeof navigator !== 'undefined') {
    isOnline.value = navigator.onLine
  }
}

onMounted(() => {
  syncOnline()
  if (typeof window !== 'undefined') {
    window.addEventListener('online', syncOnline)
    window.addEventListener('offline', syncOnline)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', syncOnline)
    window.removeEventListener('offline', syncOnline)
  }
})
</script>

<template>
  <div class="min-h-screen bg-app text-slate-900">
    <header class="flex items-center justify-between bg-surface px-4 py-2">
      <NuxtLink to="/" class="flex min-w-0 items-center gap-2 text-sm font-semibold text-brand-ink">
        <EventLogo :branding="branding" alt="" img-class="h-8 w-auto max-w-24 object-contain" />
        <span class="truncate" :class="branding.eventName ? '' : 'uppercase tracking-widest'">
          {{ branding.eventName ?? 'Festival POS' }}
        </span>
      </NuxtLink>
      <div class="flex shrink-0 items-center gap-1">
        <DisplayMenu v-if="showDisplay" />
        <AlertBell v-if="showBell" />
        <HeaderMenu />
      </div>
    </header>
    <div class="h-0.5 bg-linear-to-r from-brand via-brand-shift/50 to-slate-200" aria-hidden="true" />
    <div
      v-if="branding.trialMode"
      class="bg-amber-400 px-4 py-1 text-center text-sm font-bold uppercase tracking-wide text-black"
      data-test="trial-banner"
    >
      {{ $t('common.trialBanner') }}
    </div>
    <div v-if="!isOnline" class="bg-amber-500 px-4 py-1 text-center text-sm font-semibold text-white">
      {{ $t('common.offline') }}
    </div>
    <div
      v-if="updateAvailable"
      class="flex flex-wrap items-center justify-center gap-3 bg-success px-4 py-1 text-sm text-white"
      role="status"
      data-test="update-banner"
    >
      <span>{{ $t('common.updateAvailable') }}</span>
      <button
        type="button"
        class="min-h-[44px] rounded-lg border-2 border-white px-4 font-semibold hover:bg-white/10 disabled:opacity-60"
        :disabled="updating"
        @click="applyUpdate"
      >
        {{ $t('common.reload') }}
      </button>
    </div>
    <PasskeyOffer v-if="!isGuestPage" />
    <main>
      <slot />
    </main>
    <LegalFooter v-if="isGuestPage" />
  </div>
</template>
