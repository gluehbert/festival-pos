<script setup lang="ts">
import { computed, ref } from 'vue'
import PriceRuleTargets from '~/components/admin/pricing/PriceRuleTargets.vue'
import { parseEuroInput } from '~/utils/euro-input'
import type { AdminMenuItem } from '~/../server/lib/contracts/admin'
import type { PriceRuleDto, PriceRuleInput } from '~/../server/lib/contracts/pricing'

// New rule or editing one. Times are Europe/Berlin; an end before the start
// runs over midnight ("22:00 – 02:00").
const props = defineProps<{ items: AdminMenuItem[]; rule?: PriceRuleDto | null; busy?: boolean }>()
const emit = defineEmits<{ submit: [input: PriceRuleInput]; cancel: [] }>()

const { t } = useI18n()
const r = props.rule ?? null
const centsText = (c: number) => (c / 100).toFixed(2).replace('.', ',')

const name = ref(r?.name ?? '')
const isActive = ref(r?.isActive ?? true)
const startTime = ref(r?.startTime ?? '17:00')
const endTime = ref(r?.endTime ?? '18:00')
const weekdays = ref<number[]>(r?.weekdays ?? [1, 2, 3, 4, 5, 6, 7])
const validFrom = ref(r?.validFrom ?? '')
const validTo = ref(r?.validTo ?? '')
const kind = ref<PriceRuleInput['kind']>(r?.kind ?? 'fixed')
const valueText = ref(r ? (r.kind === 'percent' ? String(r.value) : centsText(r.value)) : '')
const categories = ref<string[]>(r?.categories ?? [])
const itemIds = ref<string[]>(r?.menuItemIds ?? [])
const error = ref<string | null>(null)

const overnight = computed(() => endTime.value <= startTime.value)
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const

function toggleDay(d: number) {
  weekdays.value = weekdays.value.includes(d) ? weekdays.value.filter((x) => x !== d) : [...weekdays.value, d].sort()
}

function parseValue(): number | null {
  if (kind.value === 'percent') {
    const n = Number(valueText.value.trim())
    return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null
  }
  const cents = parseEuroInput(valueText.value)
  if (cents === null || (kind.value === 'amount' && cents < 1)) return null
  return cents
}

function onSubmit() {
  error.value = null
  const value = parseValue()
  if (!name.value.trim()) error.value = t('admin.pricing.errors.name')
  else if (value === null) error.value = t(`admin.pricing.errors.value.${kind.value}`)
  else if (weekdays.value.length === 0) error.value = t('admin.pricing.errors.weekdays')
  else if (categories.value.length + itemIds.value.length === 0) error.value = t('admin.pricing.errors.targets')
  else if (validFrom.value && validTo.value && validTo.value < validFrom.value) error.value = t('admin.pricing.errors.dates')
  if (error.value || value === null) return
  // Articles inside a ticked category are covered by it.
  const covered = new Set(props.items.filter((i) => categories.value.includes(i.category)).map((i) => i.id))
  emit('submit', {
    name: name.value.trim(),
    isActive: isActive.value,
    startTime: startTime.value,
    endTime: endTime.value,
    weekdays: weekdays.value,
    validFrom: validFrom.value || null,
    validTo: validTo.value || null,
    categories: categories.value,
    menuItemIds: itemIds.value.filter((id) => !covered.has(id)),
    kind: kind.value,
    value,
  })
}

const field = 'mt-1 min-h-[44px] w-full rounded border border-slate-300 bg-surface px-2'
</script>

<template>
  <form class="grid gap-3 rounded border border-slate-200 bg-surface p-4 sm:grid-cols-2" data-test="price-rule-form" @submit.prevent="onSubmit">
    <label class="text-sm sm:col-span-2">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.pricing.name') }}</span>
      <input v-model="name" maxlength="80" :placeholder="$t('admin.pricing.namePlaceholder')" :class="field" data-test="price-rule-name">
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.pricing.start') }}</span>
      <input v-model="startTime" type="time" required :class="field" data-test="price-rule-start">
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.pricing.end') }}</span>
      <input v-model="endTime" type="time" required :class="field" data-test="price-rule-end">
    </label>
    <p class="text-xs text-slate-500 sm:col-span-2">
      {{ overnight ? $t('admin.pricing.overnightHint') : $t('admin.pricing.timeZoneHint') }}
    </p>

    <fieldset class="sm:col-span-2">
      <legend class="text-xs uppercase tracking-wide text-slate-500">
        {{ $t('admin.pricing.weekdays') }}
      </legend>
      <div class="mt-1 flex flex-wrap gap-1">
        <button
          v-for="d in DAYS"
          :key="d"
          type="button"
          class="min-h-[44px] min-w-[44px] rounded border px-2 text-sm font-semibold"
          :class="weekdays.includes(d) ? 'border-primary bg-primary text-white' : 'border-slate-300 text-slate-700'"
          :aria-pressed="weekdays.includes(d)"
          :data-test="`price-rule-day-${d}`"
          @click="toggleDay(d)"
        >
          {{ $t(`admin.pricing.days.${d}`) }}
        </button>
      </div>
    </fieldset>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.pricing.validFrom') }}</span>
      <input v-model="validFrom" type="date" :class="field">
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.pricing.validTo') }}</span>
      <input v-model="validTo" type="date" :class="field">
    </label>

    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.pricing.kind') }}</span>
      <select v-model="kind" :class="field" data-test="price-rule-kind">
        <option value="fixed">{{ $t('admin.pricing.kinds.fixed') }}</option>
        <option value="percent">{{ $t('admin.pricing.kinds.percent') }}</option>
        <option value="amount">{{ $t('admin.pricing.kinds.amount') }}</option>
      </select>
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t(`admin.pricing.valueLabel.${kind}`) }}</span>
      <input v-model="valueText" inputmode="decimal" required :class="field" data-test="price-rule-value">
    </label>

    <PriceRuleTargets v-model:categories="categories" v-model:item-ids="itemIds" :items="items" class="sm:col-span-2" />

    <label class="flex min-h-[44px] items-center gap-2 text-sm sm:col-span-2">
      <input v-model="isActive" type="checkbox" class="size-5">
      {{ $t('admin.pricing.active') }}
    </label>
    <p v-if="error" class="text-sm text-rose-600 sm:col-span-2" role="alert" data-test="price-rule-error">
      {{ error }}
    </p>
    <div class="flex flex-wrap gap-2 sm:col-span-2">
      <button type="submit" :disabled="busy" class="min-h-[44px] rounded bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
        {{ rule ? $t('admin.pricing.save') : $t('admin.pricing.create') }}
      </button>
      <button v-if="rule" type="button" class="min-h-[44px] rounded border border-slate-300 px-4 text-sm text-slate-800" @click="emit('cancel')">
        {{ $t('admin.trial.cancel') }}
      </button>
    </div>
  </form>
</template>
