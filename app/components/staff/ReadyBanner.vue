<script setup lang="ts">
import ReadyBadges from '~/components/staff/ReadyBadges.vue'

type Station = 'kitchen' | 'bar' | 'cafe'

// Finished, not yet paid and not yet brought. Cashing clears it, and ten
// minutes after kitchen/bar finished it counts as brought anyway, so
// "Gebracht" is only a small extra. With food and drinks both ready the
// waiter often brings one first: one button each. A walk-in is paid
// already: there only the button or the ten minutes clear it.
const props = defineProps<{ kitchen: number; bar: number; cafe: number; busy?: boolean; walkin?: boolean }>()
const emit = defineEmits<{ (e: 'served', station: Station): void }>()

const stations = (): Station[] => (['kitchen', 'bar', 'cafe'] as const).filter((s) => props[s] > 0)
</script>

<template>
  <div
    v-if="kitchen + bar + cafe > 0"
    class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-emerald-500 bg-emerald-50 px-3 py-2"
    role="status"
    data-test="ready-banner"
  >
    <div>
      <ReadyBadges :ready="{ kitchen, bar, cafe }" class="text-emerald-800" />
      <p class="mt-1 text-xs text-emerald-900" data-test="ready-hint">
        {{ $t(walkin ? 'staff.detail.servedHintWalkin' : 'staff.detail.servedHint') }}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="s in stations()"
        :key="s"
        type="button"
        class="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-emerald-500 bg-surface px-3 text-sm text-emerald-900 disabled:opacity-60"
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
