<script setup lang="ts">
import { ref, useId } from 'vue'
import type { AdminMenuItem, CreateMenuItem } from '~/../server/lib/contracts/admin'
import type { Allergen, Diet } from '~/../server/lib/allergens'
import AllergenPicker from '~/components/admin/AllergenPicker.vue'

// Existing values, offered while typing so "Bier" and "Biere" do not end up
// as two tabs. With `item` the form edits that entry and emits only the
// fields that changed.
const props = withDefaults(defineProps<{ categories?: string[]; subcategories?: string[]; item?: AdminMenuItem }>(), {
  categories: () => [],
  subcategories: () => [],
  item: undefined,
})

const { t } = useI18n()
const listId = useId()
const emit = defineEmits<{ (e: 'submit', input: CreateMenuItem): void; (e: 'cancel'): void }>()

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')
const nameDe = ref(props.item?.nameDe ?? '')
const nameEn = ref(props.item?.nameEn ?? '')
const priceEuros = ref(props.item ? euros(props.item.priceCents) : '0.00')
const depositEuros = ref(props.item?.depositCents ? euros(props.item.depositCents) : '')
const stockInput = ref(props.item?.stock != null ? String(props.item.stock) : '')
const category = ref(props.item?.category ?? '')
const subcategory = ref(props.item?.subcategory ?? '')
const station = ref<'kitchen' | 'bar' | 'cafe'>(props.item?.station ?? 'kitchen')
const sortOrder = ref(props.item?.sortOrder ?? 0)
const allergens = ref<Allergen[] | null>(props.item?.allergens ?? null)
const diet = ref<Diet | null>(props.item?.diet ?? null)
const submitting = ref(false)
const error = ref<string | null>(null)

function parsePriceCents(input: string): number | null {
  const normalized = input.replace(',', '.').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const n = Math.round(Number.parseFloat(normalized) * 100)
  if (!Number.isFinite(n) || n < 0 || n > 100000) return null
  return n
}

async function onSubmit() {
  error.value = null
  const cents = parsePriceCents(priceEuros.value)
  const depositCents = depositEuros.value.trim() ? parsePriceCents(depositEuros.value) : 0
  if (cents === null || depositCents === null) {
    error.value = t('admin.validation.price')
    return
  }
  const stock = stockInput.value.trim() === '' ? null : Number(stockInput.value)
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
    error.value = t('admin.validation.stock')
    return
  }
  if (!nameDe.value.trim() || !nameEn.value.trim()) {
    error.value = t('admin.validation.names')
    return
  }
  submitting.value = true
  try {
    const input: CreateMenuItem = {
      nameDe: nameDe.value.trim(),
      nameEn: nameEn.value.trim(),
      priceCents: cents,
      depositCents,
      stock,
      category: category.value.trim(),
      subcategory: subcategory.value.trim() || null,
      station: station.value,
      sortOrder: sortOrder.value,
      allergens: allergens.value,
      diet: diet.value,
    }
    if (props.item) {
      const original = props.item as Record<string, unknown>
      emit('submit', Object.fromEntries(
        Object.entries(input).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(original[k])),
      ) as CreateMenuItem)
      return
    }
    emit('submit', input)
    nameDe.value = ''
    nameEn.value = ''
    priceEuros.value = '0.00'
    depositEuros.value = ''
    stockInput.value = ''
    allergens.value = null
    diet.value = null
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="grid gap-3 rounded border border-slate-200 bg-surface p-4 sm:grid-cols-3" @submit.prevent="onSubmit">
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.menu.nameDe', 'Name (DE)') }}</span>
      <input v-model="nameDe" required class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.menu.nameEn', 'Name (EN)') }}</span>
      <input v-model="nameEn" required class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.menu.price', 'Price (€)') }}</span>
      <input v-model="priceEuros" inputmode="decimal" required class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.menu.deposit') }}</span>
      <input
        v-model="depositEuros"
        inputmode="decimal"
        :placeholder="$t('admin.menu.depositHint')"
        class="mt-1 w-full rounded border border-slate-300 px-2 py-1"
        data-test="menu-form-deposit"
      >
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.menu.category', 'Category') }}</span>
      <input v-model="category" required :list="`${listId}-cat`" class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
      <datalist :id="`${listId}-cat`">
        <option v-for="c in categories" :key="c" :value="c" />
      </datalist>
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.menu.subcategory') }}</span>
      <input
        v-model="subcategory"
        :list="`${listId}-sub`"
        :placeholder="$t('admin.menu.subcategoryHint')"
        class="mt-1 w-full rounded border border-slate-300 px-2 py-1"
        data-test="menu-form-subcategory"
      >
      <datalist :id="`${listId}-sub`">
        <option v-for="c in subcategories" :key="c" :value="c" />
      </datalist>
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.menu.station', 'Station') }}</span>
      <select v-model="station" class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
        <option value="kitchen">{{ $t('common.station.kitchen') }}</option>
        <option value="bar">{{ $t('common.station.bar') }}</option>
        <option value="cafe">{{ $t('common.station.cafe') }}</option>
      </select>
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.menu.stock') }}</span>
      <input
        v-model="stockInput"
        inputmode="numeric"
        :placeholder="$t('admin.menu.stockHint')"
        class="mt-1 w-full rounded border border-slate-300 px-2 py-1"
        data-test="menu-form-stock"
      >
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.menu.sort', 'Sort order') }}</span>
      <input v-model.number="sortOrder" type="number" class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
    </label>
    <AllergenPicker v-model:allergens="allergens" v-model:diet="diet" class="sm:col-span-3" />
    <p v-if="error" class="sm:col-span-3 text-sm text-rose-600">
      {{ error }}
    </p>
    <div class="flex gap-2 sm:col-span-3">
      <button type="submit" :disabled="submitting" class="min-h-[44px] flex-1 rounded bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50" data-test="menu-form-submit">
        {{ item ? $t('admin.menu.save') : $t('admin.menu.create', 'Create item') }}
      </button>
      <button v-if="item" type="button" class="min-h-[44px] rounded border border-slate-300 px-3 text-sm" @click="emit('cancel')">
        {{ $t('admin.menu.cancel') }}
      </button>
    </div>
  </form>
</template>
