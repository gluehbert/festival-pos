<script setup lang="ts">
import { ref } from 'vue'
import { useProductionStore } from '~/stores/production'

// The cafe counter closes itself after the Kaffeeklatsch: new orders of
// coffee and cake then go to the kitchen. Closing asks once, opening not.
const emit = defineEmits<{ (e: 'result', ok: boolean, closed: boolean): void }>()

const production = useProductionStore()
const busy = ref(false)

async function set(closed: boolean, close?: () => void) {
  busy.value = true
  try {
    await production.setCafeClosed(closed)
    close?.()
    emit('result', true, closed)
  }
  catch {
    emit('result', false, closed)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <button
    v-if="production.cafeClosed"
    type="button"
    class="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded px-2 text-sm font-semibold text-emerald-800 hover:bg-slate-100 disabled:opacity-50"
    :disabled="busy"
    data-test="cafe-open"
    @click="set(false)"
  >
    <UIcon name="i-lucide-door-open" class="size-5" aria-hidden="true" />
    <span>{{ $t('production.cafe.open') }}</span>
  </button>
  <UPopover v-else :content="{ align: 'end' }" :ui="{ content: 'bg-surface ring-slate-200' }">
    <button
      type="button"
      class="inline-flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded px-1 text-slate-600 md:flex-row md:gap-1.5 md:px-2 hover:bg-slate-100"
      :aria-label="$t('production.cafe.close')"
      :title="$t('production.cafe.close')"
      data-test="cafe-close"
    >
      <UIcon name="i-lucide-door-closed" class="size-5" aria-hidden="true" />
      <span class="text-[10px] font-semibold leading-none md:hidden">{{ $t('production.cafe.closeShort') }}</span>
      <span class="hidden text-sm font-semibold md:inline">{{ $t('production.cafe.close') }}</span>
    </button>
    <template #content="{ close }">
      <div class="w-[min(92vw,22rem)] p-3 text-sm">
        <p class="text-slate-800">
          {{ $t('production.cafe.closeConfirm') }}
        </p>
        <div class="mt-3 flex justify-end gap-2">
          <button type="button" class="min-h-[44px] rounded-lg px-3 font-semibold text-slate-600" @click="close()">
            {{ $t('production.cafe.cancel') }}
          </button>
          <button
            type="button"
            class="min-h-[44px] rounded-lg bg-primary px-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
            :disabled="busy"
            data-test="cafe-close-confirm"
            @click="set(true, close)"
          >
            {{ $t('production.cafe.closeYes') }}
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
