<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { AdminMenuItem } from '~/../server/lib/contracts/admin'
import type { PriceRuleDto } from '~/../server/lib/contracts/pricing'

const props = defineProps<{ rules: PriceRuleDto[]; items: AdminMenuItem[]; busyId?: string | null }>()
const emit = defineEmits<{ toggle: [rule: PriceRuleDto]; edit: [rule: PriceRuleDto]; remove: [rule: PriceRuleDto] }>()

const { t } = useI18n()
const { euro, clock, itemName } = useFormat()
const confirming = ref<string | null>(null)
const names = computed(() => new Map(props.items.map((i) => [i.id, itemName(i)])))

function effect(r: PriceRuleDto): string {
  if (r.kind === 'percent') return t('admin.pricing.effect.percent', { value: r.value })
  return t(`admin.pricing.effect.${r.kind}`, { amount: euro(r.value) })
}

function days(r: PriceRuleDto): string {
  if (r.weekdays.length === 7) return t('admin.pricing.everyDay')
  return r.weekdays.map((d) => t(`admin.pricing.days.${d}`)).join(', ')
}

function targets(r: PriceRuleDto): string {
  return [...r.categories, ...r.menuItemIds.map((id) => names.value.get(id) ?? '?')].join(', ')
}
</script>

<template>
  <p v-if="rules.length === 0" class="rounded border border-slate-200 bg-surface p-4 text-sm text-slate-600">
    {{ $t('admin.pricing.empty') }}
  </p>
  <ul v-else class="space-y-2">
    <li
      v-for="r in rules"
      :key="r.id"
      class="rounded border bg-surface p-3"
      :class="r.runningUntil ? 'border-emerald-400' : 'border-slate-200'"
      data-test="price-rule"
    >
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="text-base font-semibold text-slate-900">
          {{ r.name }}
        </h3>
        <span v-if="r.runningUntil" class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900" data-test="price-rule-running">
          {{ $t('admin.pricing.runningUntil', { time: clock(r.runningUntil) }) }}
        </span>
        <span v-else-if="!r.isActive" class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          {{ $t('admin.pricing.inactive') }}
        </span>
      </div>
      <p class="text-sm text-slate-700">
        {{ r.startTime }}–{{ r.endTime }} · {{ days(r) }}
        <template v-if="r.validFrom || r.validTo">
          · {{ r.validFrom ?? '…' }} – {{ r.validTo ?? '…' }}
        </template>
      </p>
      <p class="text-sm text-slate-700">
        <span class="font-semibold">{{ effect(r) }}</span> · {{ targets(r) }}
      </p>
      <div v-if="confirming === r.id" class="mt-2 flex flex-wrap items-center gap-2" role="alert">
        <span class="text-sm text-slate-900">{{ $t('admin.pricing.confirmDelete', { name: r.name }) }}</span>
        <button type="button" class="min-h-[44px] rounded bg-danger px-3 text-sm font-semibold text-white" data-test="price-rule-delete-confirm" @click="emit('remove', r); confirming = null">
          {{ $t('admin.pricing.delete') }}
        </button>
        <button type="button" class="min-h-[44px] rounded border border-slate-300 px-3 text-sm text-slate-800" @click="confirming = null">
          {{ $t('admin.trial.cancel') }}
        </button>
      </div>
      <div v-else class="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-[44px] rounded border border-slate-300 px-3 text-sm font-semibold text-slate-800 disabled:opacity-50"
          :disabled="busyId === r.id"
          data-test="price-rule-toggle"
          @click="emit('toggle', r)"
        >
          {{ r.isActive ? $t('admin.pricing.deactivate') : $t('admin.pricing.activate') }}
        </button>
        <button type="button" class="min-h-[44px] rounded border border-slate-300 px-3 text-sm text-slate-800" data-test="price-rule-edit" @click="emit('edit', r)">
          {{ $t('admin.pricing.edit') }}
        </button>
        <button type="button" class="min-h-[44px] rounded border border-rose-300 px-3 text-sm text-rose-700" data-test="price-rule-delete" @click="confirming = r.id">
          {{ $t('admin.pricing.delete') }}
        </button>
      </div>
    </li>
  </ul>
</template>
