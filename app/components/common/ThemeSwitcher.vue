<script setup lang="ts">
import { THEMES, useTheme, type Theme } from '~/composables/useTheme'
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()
const { theme, choose } = useTheme()

// Feather-style outline icons: monitor, sun, moon.
const ICONS: Record<Theme, string> = {
  system: 'M4 5h16v11H4zM8 20h8M12 16v4',
  light: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  dark: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
}

function pick(next: Theme) {
  void choose(next, auth.isAuthenticated)
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="$t('common.theme.label')"
    class="flex items-center rounded border border-slate-200"
    data-test="theme-switcher"
  >
    <button
      v-for="option in THEMES"
      :key="option"
      type="button"
      role="radio"
      :aria-checked="theme === option"
      :aria-label="$t(`common.theme.${option}`)"
      :title="$t(`common.theme.${option}`)"
      :data-theme-option="option"
      class="inline-flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center rounded"
      :class="theme === option ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'"
      @click="pick(option)"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-4"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="ICONS[option]" />
      </svg>
    </button>
  </div>
</template>
