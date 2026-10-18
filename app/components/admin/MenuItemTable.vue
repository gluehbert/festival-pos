<script setup lang="ts">
import { computed, ref } from 'vue'
import AvailabilityToggle from '~/components/admin/AvailabilityToggle.vue'
import InlineNumberCell from '~/components/admin/InlineNumberCell.vue'
import AllergenPicker from '~/components/admin/AllergenPicker.vue'
import MenuItemForm from '~/components/admin/MenuItemForm.vue'
import AllergenCodes from '~/components/common/AllergenCodes.vue'
import type { AdminMenuItem, UpdateMenuItem } from '~/../server/lib/contracts/admin'
import type { Allergen, Diet } from '~/../server/lib/allergens'

const props = withDefaults(defineProps<{
  items: AdminMenuItem[]
  busyIds?: Set<string>
  categories?: string[]
  subcategories?: string[]
}>(), { busyIds: undefined, categories: () => [], subcategories: () => [] })

const emit = defineEmits<{
  (e: 'toggle', id: string, isAvailable: boolean): void
  (e: 'patch', id: string, patch: UpdateMenuItem): void
}>()

// One row at a time is open for editing its allergens.
const editing = ref<{ id: string; allergens: Allergen[] | null; diet: Diet | null } | null>(null)

// The full edit form (names, price, category, ...) for one row.
const editingItem = ref<string | null>(null)

function edit(item: AdminMenuItem) {
  editingItem.value = null
  editing.value = { id: item.id, allergens: item.allergens, diet: item.diet }
}

function editItem(item: AdminMenuItem) {
  editing.value = null
  editingItem.value = item.id
}

function saveItem(id: string, patch: UpdateMenuItem) {
  editingItem.value = null
  if (Object.keys(patch).length > 0) emit('patch', id, patch)
}

// Both editors open in a dialog: inside the table the fields were only as
// wide as a column, and typing meant scrolling sideways.
const itemOpen = computed({
  get: () => editingItem.value !== null,
  set: (open: boolean) => { if (!open) editingItem.value = null },
})
const allergensOpen = computed({
  get: () => editing.value !== null,
  set: (open: boolean) => { if (!open) editing.value = null },
})
const itemFor = (id: string | null) => props.items.find((i) => i.id === id)
const editedItem = computed(() => itemFor(editingItem.value))
const allergenItem = computed(() => itemFor(editing.value?.id ?? null))
// The app's own colour tokens, as in the header menu, so dark mode applies.
const MODAL_UI = { content: 'bg-surface ring-slate-200 divide-slate-200', title: 'text-slate-900', description: 'text-slate-600', close: 'text-slate-600' }

function save() {
  if (!editing.value) return
  emit('patch', editing.value.id, { allergens: editing.value.allergens, diet: editing.value.diet })
  editing.value = null
}
</script>

<template>
  <!-- relative: the sr-only labels are absolutely positioned and would
       otherwise widen the whole page instead of scrolling with the table. -->
  <div class="relative overflow-x-auto rounded border border-slate-200 bg-surface">
    <table class="min-w-full divide-y divide-slate-200 text-sm">
      <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-3 py-2 text-left">
            {{ $t('admin.menu.nameDe', 'Name (DE)') }}
          </th>
          <th class="px-3 py-2 text-left">
            {{ $t('admin.menu.nameEn', 'Name (EN)') }}
          </th>
          <th class="px-3 py-2 text-right">
            {{ $t('admin.menu.price', 'Price (€)') }}
          </th>
          <th class="px-3 py-2 text-right">
            {{ $t('admin.menu.deposit') }}
          </th>
          <th class="px-3 py-2 text-left">
            {{ $t('admin.menu.category', 'Category') }}
          </th>
          <th class="px-3 py-2 text-left">
            {{ $t('admin.menu.station', 'Station') }}
          </th>
          <th class="px-3 py-2 text-right">
            {{ $t('admin.menu.stock') }}
          </th>
          <th class="px-3 py-2 text-left">
            {{ $t('admin.menu.allergens') }}
          </th>
          <th class="px-3 py-2 text-left">
            {{ $t('admin.menu.availability', 'Availability') }}
          </th>
          <th class="px-3 py-2">
            <span class="sr-only">{{ $t('admin.menu.editItem') }}</span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <template v-for="item in items" :key="item.id">
        <tr data-test="admin-menu-row">
          <td class="px-3 py-2 font-medium text-slate-900">
            {{ item.nameDe }}
          </td>
          <td class="px-3 py-2 text-slate-600">
            {{ item.nameEn }}
          </td>
          <td class="px-1 py-1">
            <InlineNumberCell
              :value="item.priceCents"
              :label="$t('admin.menu.priceOf', { name: item.nameDe })"
              :busy="busyIds?.has(item.id)"
              @save="(v) => emit('patch', item.id, { priceCents: v ?? 0 })"
            />
          </td>
          <td class="px-1 py-1">
            <InlineNumberCell
              :value="item.depositCents"
              :label="$t('admin.menu.depositOf', { name: item.nameDe })"
              :busy="busyIds?.has(item.id)"
              @save="(v) => emit('patch', item.id, { depositCents: v ?? 0 })"
            />
          </td>
          <td class="px-3 py-2 text-slate-600">
            {{ item.category }}<span v-if="item.subcategory" class="text-slate-400"> › {{ item.subcategory }}</span>
          </td>
          <td class="px-3 py-2 text-slate-600">
            {{ item.station }}
          </td>
          <td class="px-1 py-1">
            <InlineNumberCell
              :value="item.stock"
              mode="count"
              nullable
              :label="$t('admin.menu.stockOf', { name: item.nameDe })"
              :busy="busyIds?.has(item.id)"
              @save="(v) => emit('patch', item.id, { stock: v })"
            />
          </td>
          <td class="px-3 py-2">
            <button
              type="button"
              class="text-left underline decoration-dotted underline-offset-2"
              aria-haspopup="dialog"
              data-test="allergen-edit"
              @click="edit(item)"
            >
              <span class="sr-only">{{ $t('admin.menu.editAria', { name: item.nameDe }) }}</span>
              <span v-if="!item.allergens" class="text-xs font-semibold text-amber-700">{{ $t('admin.menu.allergensMissing') }}</span>
              <span v-else-if="item.allergens.length === 0 && !item.diet" class="text-xs text-slate-500">{{ $t('common.allergens.none') }}</span>
              <AllergenCodes v-else :allergens="item.allergens" :diet="item.diet" />
            </button>
          </td>
          <td class="px-3 py-2">
            <AvailabilityToggle
              :model-value="item.isAvailable"
              :busy="busyIds?.has(item.id)"
              :label="item.nameDe"
              @update:model-value="(v) => emit('toggle', item.id, v)"
            />
          </td>
          <td class="px-1 py-1">
            <button
              type="button"
              class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-slate-300 hover:bg-slate-100"
              :aria-label="$t('admin.menu.editItemAria', { name: item.nameDe })"
              aria-haspopup="dialog"
              data-test="menu-item-edit"
              @click="editItem(item)"
            >
              <UIcon name="i-lucide-pencil" class="size-4 shrink-0" aria-hidden="true" />
            </button>
          </td>
        </tr>
        </template>
        <tr v-if="items.length === 0">
          <td colspan="10" class="px-3 py-6 text-center text-sm text-slate-500">
            {{ $t('admin.menu.empty', 'No entries.') }}
          </td>
        </tr>
      </tbody>
    </table>

    <UModal
      v-model:open="itemOpen"
      :ui="MODAL_UI"
      :title="$t('admin.menu.editTitle', { name: editedItem?.nameDe ?? '' })"
      :description="$t('admin.menu.editHint')"
    >
      <template #body>
        <div data-test="menu-item-dialog">
          <MenuItemForm
            v-if="editedItem"
            :key="editedItem.id"
            :item="editedItem"
            :categories="categories"
            :subcategories="subcategories"
            @submit="(patch) => saveItem(editedItem!.id, patch)"
            @cancel="editingItem = null"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="allergensOpen" :ui="MODAL_UI" :title="$t('admin.menu.allergensTitle', { name: allergenItem?.nameDe ?? '' })">
      <template #body>
        <div v-if="editing" data-test="allergen-dialog">
          <AllergenPicker v-model:allergens="editing.allergens" v-model:diet="editing.diet" />
          <div class="mt-3 flex gap-2">
            <button type="button" class="min-h-[44px] rounded bg-primary px-3 text-sm font-semibold text-white" data-test="allergen-save" @click="save">
              {{ $t('admin.menu.save') }}
            </button>
            <button type="button" class="min-h-[44px] rounded border border-slate-300 px-3 text-sm" @click="editing = null">
              {{ $t('admin.menu.cancel') }}
            </button>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
