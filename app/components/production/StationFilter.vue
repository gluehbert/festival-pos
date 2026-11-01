<script setup lang="ts">
type Station = 'kitchen' | 'bar' | 'cafe'

// The page title doubles as the station picker: shows the current station,
// a tap offers the others. Only admins get it; station staff are
// bound to their station by role.
defineProps<{ modelValue: Station }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: Station): void
}>()

const options: ReadonlyArray<Station> = ['kitchen', 'bar', 'cafe']

function pick(opt: Station, close: () => void) {
  emit('update:modelValue', opt)
  close()
}
</script>

<template>
  <UPopover :ui="{ content: 'bg-surface ring-slate-200' }">
    <button
      type="button"
      class="-ml-2 inline-flex min-h-[44px] items-center gap-1 rounded px-2 text-xl font-extrabold text-slate-900 hover:bg-slate-100"
      :aria-label="$t('production.stationLabel')"
      data-test="station-picker"
    >
      {{ $t(`common.station.${modelValue}`) }}
      <UIcon name="i-lucide-chevron-down" class="size-5" aria-hidden="true" />
    </button>
    <template #content="{ close }">
      <div class="flex w-48 flex-col p-1" role="listbox" :aria-label="$t('production.stationLabel')">
        <button
          v-for="opt in options"
          :key="opt"
          type="button"
          role="option"
          :aria-selected="modelValue === opt"
          :data-station="opt"
          class="flex min-h-[48px] items-center justify-between rounded px-3 text-left text-lg"
          :class="modelValue === opt ? 'font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-100'"
          @click="pick(opt, close)"
        >
          {{ $t(`common.station.${opt}`) }}
          <UIcon v-if="modelValue === opt" name="i-lucide-check" class="size-5" aria-hidden="true" />
        </button>
      </div>
    </template>
  </UPopover>
</template>
