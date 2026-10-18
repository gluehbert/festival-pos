<script setup lang="ts">
import ReadyBadges from '~/components/staff/ReadyBadges.vue'

type Station = 'kitchen' | 'bar'

// Finished, not yet paid and not yet brought. Cashing clears it by itself,
// so "Gebracht" is only a small extra for a guest who pays later. With food
// and drinks both ready the waiter often brings one first: one button each.
// A walk-in is paid already: there the button is the only way to clear it.
const props = defineProps<{ kitchen: number; bar: number; busy?: boolean; walkin?: boolean }>()
const emit = defineEmits<{ (e: 'served', station: Station): void }>()

const stations = (): Station[] => (['kitchen', 'bar'] as const).filter((s) => props[s] > 0)
</script>

<template>
  <div
    v-if="kitchen + bar > 0"
    class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-rose-400 bg-rose-50 px-3 py-2"
    role="status"
    data-test="ready-banner"
  >
    <div>
      <ReadyBadges :ready="{ kitchen, bar }" class="text-rose-800" />
      <p v-if="!walkin" class="mt-1 text-xs text-rose-900" data-test="ready-hint">
        {{ $t('staff.detail.servedHint') }}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="s in stations()"
        :key="s"
        type="button"
        class="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-rose-400 bg-surface px-3 text-sm text-rose-900 disabled:opacity-60"
        :data-test="`served-${s}`"
        :disabled="busy"
        @click="emit('served', s)"
      >
        <UIcon name="i-lucide-check" class="size-4 shrink-0" aria-hidden="true" />
        {{ stations().length > 1 ? $t(`staff.detail.served_${s}`) : $t('staff.detail.served') }}
      </button>
    </div>
  </div>
</template>
