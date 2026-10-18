<script setup lang="ts">
// Three steps, one sentence each, in the words the buttons use.
const emit = defineEmits<{ close: [] }>()

const STEPS = [
  { key: 'order', icon: 'i-lucide-plus' },
  { key: 'bring', icon: 'i-lucide-hand-platter' },
  { key: 'pay', icon: 'i-lucide-banknote' },
] as const
</script>

<template>
  <section class="mt-4 rounded-xl border-2 border-primary bg-surface bg-linear-to-br from-brand-soft to-surface p-4" data-test="welcome" :aria-label="$t('staff.welcome.title')">
    <h2 class="text-lg font-bold text-slate-900">
      {{ $t('staff.welcome.title') }}
    </h2>
    <ol class="mt-3 flex flex-col gap-3">
      <li v-for="(s, i) in STEPS" :key="s.key" class="flex items-start gap-3">
        <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-white" aria-hidden="true">
          <UIcon :name="s.icon" class="size-5" />
        </span>
        <p class="text-sm text-slate-800">
          <span class="block font-semibold text-slate-900">{{ i + 1 }}. {{ $t(`staff.welcome.${s.key}.title`) }}</span>
          {{ $t(`staff.welcome.${s.key}.text`) }}
        </p>
      </li>
    </ol>
    <button
      type="button"
      class="mt-4 min-h-[52px] w-full rounded-lg bg-brand-gradient px-4 text-lg font-semibold text-brand-contrast"
      data-test="welcome-close"
      @click="emit('close')"
    >
      {{ $t('staff.welcome.start') }}
    </button>
  </section>
</template>
