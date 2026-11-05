<script setup lang="ts">
import { computed, onMounted, toRef } from 'vue'
import { useSetupGuide } from '~/composables/useSetupGuide'
import { SETUP_STEPS, type SetupStepKey } from '~/utils/setup-steps'
import type { EventDto } from '~/../server/lib/contracts/admin'

// The overview's status: every setup step with what is done and what is
// still open, one tap into its tab. Also brings the guide bar back.
const props = defineProps<{ event: EventDto }>()
const guide = useSetupGuide(toRef(props, 'event'))
onMounted(guide.restore)
const base = computed(() => `/admin/events/${props.event.id}`)
const openCount = computed(() => guide.open.value.length)

const { locale, t } = useI18n()
const day = (iso: string) => new Date(iso).toLocaleDateString(locale.value, { day: 'numeric', month: 'numeric' })
// What the data says per step: "12 Artikel", "QR-Codes geladen am 3.11." …
function detailText(key: SetupStepKey): string | null {
  const d = guide.detail(key)
  if (!d) return null
  const values = { ...d.values, ...(typeof d.values.date === 'string' ? { date: day(d.values.date) } : {}) }
  return typeof d.values.n === 'number'
    ? t(`admin.setup.detail.${d.key}`, values, d.values.n)
    : t(`admin.setup.detail.${d.key}`, values)
}
</script>

<template>
  <section class="rounded border border-slate-200 bg-surface p-4" data-test="setup-checklist">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-slate-700">
        {{ $t('admin.setup.checklistTitle') }}
      </h2>
      <span class="text-sm font-semibold" :class="openCount === 0 ? 'text-emerald-800' : 'text-slate-600'" data-test="setup-open-count">
        {{ openCount === 0 ? $t('admin.setup.allDoneShort') : $t('admin.setup.openCount', { n: openCount }, openCount) }}
      </span>
    </div>
    <ol class="mt-2 divide-y divide-slate-100 text-sm">
      <li v-for="(s, i) in SETUP_STEPS" :key="s.key" class="flex items-center justify-between gap-3 py-2" :data-step="s.key">
        <span class="flex min-w-0 items-center gap-3">
          <span
            class="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            :class="guide.done(s.key) ? 'bg-success text-white' : 'border-2 border-slate-300 text-slate-600'"
            aria-hidden="true"
          >
            <UIcon v-if="guide.done(s.key)" name="i-lucide-check" class="size-4" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span class="min-w-0">
            <span class="block font-semibold text-slate-900">
              {{ $t(`admin.setup.steps.${s.key}.title`) }}
              <span v-if="s.optional" class="font-normal text-slate-500">({{ $t('admin.setup.optional') }})</span>
            </span>
            <span class="block text-slate-600">{{ $t(`admin.setup.steps.${s.key}.short`) }}</span>
            <span v-if="detailText(s.key)" class="block text-xs font-semibold" :class="s.key === 'start' && !guide.done(s.key) ? 'text-amber-800' : 'text-slate-700'" :data-detail="s.key">{{ detailText(s.key) }}</span>
          </span>
          <span class="sr-only">{{ guide.done(s.key) ? $t('admin.setup.done') : $t('admin.setup.notDone') }}</span>
        </span>
        <NuxtLink
          v-if="s.path"
          :to="base + s.path"
          class="inline-flex min-h-[44px] shrink-0 items-center font-semibold text-slate-900 underline"
        >
          {{ $t('admin.setup.open') }}
        </NuxtLink>
      </li>
    </ol>
    <button
      v-if="guide.preparing.value && !guide.showBar.value"
      type="button"
      class="mt-2 min-h-[44px] rounded border border-slate-300 px-3 text-sm font-semibold text-slate-800"
      data-test="setup-show"
      @click="guide.setHidden(false)"
    >
      {{ $t('admin.setup.show') }}
    </button>
  </section>
</template>
