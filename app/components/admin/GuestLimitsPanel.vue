<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAdminStore } from '~/stores/admin'
import { parseEuroInput } from '~/utils/euro-input'
import type { EventDto } from '~/../server/lib/contracts/admin'

// How much one guest phone may have ordered and not paid yet, for drinks
// (bar) and food (kitchen). Empty = no limit.
const props = defineProps<{ event: EventDto }>()
const emit = defineEmits<{ (e: 'saved' | 'failed', text: string): void }>()

const { t } = useI18n()
const admin = useAdminStore()
const busy = ref(false)

const asText = (cents: number | null) => (cents === null ? '' : String(cents / 100))
const bar = ref(asText(props.event.guestOpenLimitBarCents))
const kitchen = ref(asText(props.event.guestOpenLimitKitchenCents))
watch(() => [props.event.guestOpenLimitBarCents, props.event.guestOpenLimitKitchenCents], ([b, k]) => {
  bar.value = asText(b ?? null)
  kitchen.value = asText(k ?? null)
})

// Empty = null (no limit); anything else must be an amount of at least 1 €.
function toCents(raw: string): number | null | undefined {
  if (raw.trim() === '') return null
  const cents = parseEuroInput(raw)
  return cents !== null && cents >= 100 ? cents : undefined
}
const invalid = computed(() => toCents(bar.value) === undefined || toCents(kitchen.value) === undefined)

async function save() {
  if (invalid.value) return
  busy.value = true
  try {
    await admin.setFeatures(props.event.id, {
      guestOpenLimitBarCents: toCents(bar.value)!,
      guestOpenLimitKitchenCents: toCents(kitchen.value)!,
    })
    emit('saved', t('admin.guestLimits.saved'))
  }
  catch {
    emit('failed', t('admin.toast.actionFailed'))
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="space-y-3 px-4 py-3 text-sm" data-test="guest-limits" @submit.prevent="save">
    <p class="text-slate-600">
      {{ $t('admin.guestLimits.hint') }}
    </p>
    <div class="flex flex-wrap items-end gap-3">
      <label class="block">
        <span class="text-slate-700">{{ $t('admin.guestLimits.bar') }}</span>
        <input v-model="bar" name="bar" inputmode="decimal" :placeholder="$t('admin.guestLimits.none')" class="mt-1 w-28 rounded border border-slate-300 px-2 py-1">
      </label>
      <label class="block">
        <span class="text-slate-700">{{ $t('admin.guestLimits.kitchen') }}</span>
        <input v-model="kitchen" name="kitchen" inputmode="decimal" :placeholder="$t('admin.guestLimits.none')" class="mt-1 w-28 rounded border border-slate-300 px-2 py-1">
      </label>
      <button type="submit" class="min-h-[44px] rounded bg-primary px-3 font-semibold text-white disabled:opacity-50" :disabled="busy || invalid">
        {{ $t('admin.guestLimits.save') }}
      </button>
    </div>
    <p v-if="invalid" class="text-rose-600" role="alert">
      {{ $t('admin.guestLimits.invalid') }}
    </p>
  </form>
</template>
