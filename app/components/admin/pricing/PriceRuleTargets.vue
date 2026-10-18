<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { AdminMenuItem } from '~/../server/lib/contracts/admin'

// Which articles a rule lowers: whole categories and/or single articles.
// An article in a ticked category is covered already and shown as such.
const props = defineProps<{ items: AdminMenuItem[] }>()
const categories = defineModel<string[]>('categories', { required: true })
const itemIds = defineModel<string[]>('itemIds', { required: true })

const { euro, itemName } = useFormat()

const groups = computed(() => {
  const map = new Map<string, AdminMenuItem[]>()
  for (const i of props.items) map.set(i.category, [...(map.get(i.category) ?? []), i])
  return [...map.entries()].map(([category, items]) => ({ category, items }))
})

function toggle(list: string[], value: string, on: boolean): string[] {
  return on ? [...new Set([...list, value])] : list.filter((v) => v !== value)
}
const checked = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <fieldset class="rounded border border-slate-200 p-3">
    <legend class="px-1 text-xs uppercase tracking-wide text-slate-500">
      {{ $t('admin.pricing.targets') }}
    </legend>
    <p v-if="groups.length === 0" class="text-sm text-slate-500">
      {{ $t('admin.pricing.noItems') }}
    </p>
    <div v-for="g in groups" :key="g.category" class="mb-2" data-test="price-rule-group">
      <label class="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-slate-900">
        <input
          type="checkbox"
          class="size-5"
          :checked="categories.includes(g.category)"
          data-test="price-rule-category"
          @change="categories = toggle(categories, g.category, checked($event))"
        >
        {{ $t('admin.pricing.wholeCategory', { category: g.category }) }}
      </label>
      <div class="grid gap-x-3 pl-7 sm:grid-cols-2">
        <label
          v-for="i in g.items"
          :key="i.id"
          class="flex min-h-[44px] items-center gap-2 text-sm text-slate-700"
          :class="categories.includes(g.category) ? 'opacity-60' : ''"
        >
          <input
            type="checkbox"
            class="size-5"
            :checked="categories.includes(g.category) || itemIds.includes(i.id)"
            :disabled="categories.includes(g.category)"
            data-test="price-rule-item"
            @change="itemIds = toggle(itemIds, i.id, checked($event))"
          >
          <span class="min-w-0 flex-1 truncate">{{ itemName(i) }}</span>
          <span class="tabular-nums text-slate-500">{{ euro(i.priceCents) }}</span>
        </label>
      </div>
    </div>
  </fieldset>
</template>
