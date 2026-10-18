<script setup lang="ts">
const { locale, locales, setLocale } = useI18n()

function pick(code: string) {
  void setLocale(code as 'de' | 'en')
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="$t('nav.language')"
    class="flex items-center rounded border border-slate-200"
    data-test="locale-switcher"
  >
    <button
      v-for="l in locales"
      :key="(l as { code: string }).code"
      type="button"
      role="radio"
      :aria-checked="(l as { code: string }).code === locale"
      :data-locale="(l as { code: string }).code"
      class="min-h-[44px] min-w-[44px] flex-1 rounded px-2 text-sm"
      :class="(l as { code: string }).code === locale ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'"
      @click="pick((l as { code: string }).code)"
    >
      {{ (l as { code: string }).code.toUpperCase() }}
    </button>
  </div>
</template>
