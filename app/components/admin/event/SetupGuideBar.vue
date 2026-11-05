<script setup lang="ts">
import { computed, onMounted, toRef, watch } from 'vue'
import { navigateTo } from '#imports'
import { useSetupGuide } from '~/composables/useSetupGuide'
import { nextStep, prevStep, SETUP_STEPS, stepAt } from '~/utils/setup-steps'
import type { EventDto } from '~/../server/lib/contracts/admin'

// The guided setup over the workspace tabs: which step this tab is, what to
// do here, and "Weiter" to the next one. Someone who sets up the festival
// once a year follows it from top to bottom and ends with nothing left open;
// anyone can still jump around with the tabs or hide the bar.
const props = defineProps<{ event: EventDto; subPath: string }>()
const guide = useSetupGuide(toRef(props, 'event'))
onMounted(guide.restore)
// A tab may have changed what the data says (menu items, helpers, QR codes).
watch(() => props.subPath, () => { void guide.restore() })

const base = computed(() => `/admin/events/${props.event.id}`)
const step = computed(() => stepAt(props.subPath))
const index = computed(() => (step.value ? SETUP_STEPS.indexOf(step.value) : -1))
const next = computed(() => (step.value ? nextStep(step.value.key) : null))
const prev = computed(() => (step.value ? prevStep(step.value.key) : null))
const firstOpen = computed(() => SETUP_STEPS.find((s) => s.key === guide.open.value[0]) ?? null)

async function goNext() {
  if (!step.value || !next.value) return
  await guide.confirm(step.value.key)
  await navigateTo(base.value + next.value.path)
}
</script>

<template>
  <section
    v-if="guide.showBar.value"
    class="mb-4 rounded-lg border-2 border-primary bg-brand-soft p-4"
    data-test="setup-guide"
    :aria-label="$t('admin.setup.label')"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-brand-ink">
        {{ step ? $t('admin.setup.stepOf', { n: index + 1, total: SETUP_STEPS.length }) : $t('admin.setup.label') }}
      </p>
      <button type="button" class="min-h-[44px] px-2 text-xs text-slate-600 underline" data-test="setup-hide" @click="guide.setHidden(true)">
        {{ $t('admin.setup.hide') }}
      </button>
    </div>
    <ol class="mt-1 flex flex-wrap gap-1" :aria-label="$t('admin.setup.stepsLabel')">
      <li v-for="(s, i) in SETUP_STEPS" :key="s.key">
        <NuxtLink
          :to="base + s.path"
          class="inline-flex min-h-[36px] items-center gap-1 rounded-full border px-3 text-xs font-semibold"
          :class="s.key === step?.key ? 'border-primary bg-primary text-white' : guide.done(s.key) ? 'border-emerald-500 bg-surface text-emerald-800' : 'border-slate-300 bg-surface text-slate-700'"
          :aria-current="s.key === step?.key ? 'step' : undefined"
          :data-step="s.key"
          :data-done="guide.done(s.key) ? 'true' : undefined"
        >
          <UIcon v-if="guide.done(s.key) && s.key !== step?.key" name="i-lucide-check" class="size-3.5 shrink-0" aria-hidden="true" />
          <span v-else aria-hidden="true">{{ i + 1 }}</span>
          {{ $t(`admin.setup.steps.${s.key}.title`) }}
        </NuxtLink>
      </li>
    </ol>
    <template v-if="step">
      <h2 class="mt-3 text-lg font-bold text-slate-900">
        {{ $t(`admin.setup.steps.${step.key}.title`) }}
        <span v-if="step.optional" class="text-sm font-normal text-slate-600">({{ $t('admin.setup.optional') }})</span>
      </h2>
      <p class="mt-1 whitespace-pre-line text-sm text-slate-800" data-test="setup-text">
        {{ $t(`admin.setup.steps.${step.key}.text`) }}
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <NuxtLink
          v-if="prev"
          :to="base + prev.path"
          class="inline-flex min-h-[44px] items-center rounded border border-slate-300 bg-surface px-3 text-sm font-semibold text-slate-800"
        >
          {{ $t('admin.setup.back') }}
        </NuxtLink>
        <button
          v-if="next"
          type="button"
          class="min-h-[44px] rounded bg-primary px-4 text-sm font-semibold text-white"
          data-test="setup-next"
          @click="goNext"
        >
          {{ $t('admin.setup.next', { step: $t(`admin.setup.steps.${next.key}.title`) }) }}
        </button>
        <p v-else-if="guide.open.value.length === 0" class="text-sm font-semibold text-emerald-800" data-test="setup-all-done">
          {{ $t('admin.setup.allDone') }}
        </p>
      </div>
    </template>
    <p v-else-if="firstOpen" class="mt-2 text-sm">
      <NuxtLink :to="base + firstOpen.path" class="font-semibold text-brand-ink underline">
        {{ $t('admin.setup.continue', { step: $t(`admin.setup.steps.${firstOpen.key}.title`) }) }}
      </NuxtLink>
    </p>
  </section>
</template>
