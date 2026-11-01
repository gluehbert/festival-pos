<script setup lang="ts">
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { useFormat } from '~/composables/useFormat'
import type { Menu, MenuItemDto } from '~/../server/lib/contracts/guest'

// Kitchen/bar mark their own articles sold out (and back) without the admin.
// A button in the app bar opens the list, so it takes no room on the screen.
const props = defineProps<{ station?: 'kitchen' | 'bar' | 'cafe' }>()
const emit = defineEmits<{ (e: 'result', ok: boolean): void }>()

const { itemName } = useFormat()
const items = ref<MenuItemDto[]>([])
const busy = ref<string | null>(null)
const loaded = ref(false)

async function load() {
  const suffix = props.station ? `?station=${props.station}` : ''
  // By name, so the sizes of an article stand together (Pils 0,3 l, Pils 0,5 l).
  items.value = (await useApi().get<Menu>(`/api/production/menu${suffix}`)).items
    .sort((a, b) => itemName(a).localeCompare(itemName(b), 'de', { numeric: true }))
  loaded.value = true
}

// Every opening reloads, so the list shows what other screens changed.
async function onOpen() {
  await load().catch(() => emit('result', false))
}

async function set(item: MenuItemDto, isAvailable: boolean) {
  busy.value = item.id
  try {
    await useApi().patch(`/api/menu/${item.id}/availability`, { isAvailable })
    items.value = items.value.map((i) => (i.id === item.id ? { ...i, isAvailable } : i))
    emit('result', true)
  }
  catch {
    emit('result', false)
  }
  finally {
    busy.value = null
  }
}

defineExpose({ load })
</script>

<template>
  <UPopover :content="{ align: 'end' }" :ui="{ content: 'bg-surface ring-slate-200' }">
    <button
      type="button"
      class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded px-2 text-slate-600 hover:bg-slate-100"
      :aria-label="$t('production.soldOut.title')"
      :title="$t('production.soldOut.title')"
      data-test="sold-out-panel"
      @click="onOpen"
    >
      <UIcon name="i-lucide-circle-slash" class="size-5" aria-hidden="true" />
      <span class="hidden text-sm font-semibold lg:inline">{{ $t('production.soldOut.short') }}</span>
    </button>
    <template #content>
      <div class="max-h-[70vh] w-[min(92vw,34rem)] overflow-y-auto p-3">
        <p class="px-1 pb-1 font-semibold text-slate-800">
          {{ $t('production.soldOut.title') }}
        </p>
        <p v-if="loaded && items.length === 0" class="px-1 pb-2 text-sm text-slate-500">
          {{ $t('production.soldOut.empty') }}
        </p>
        <ul class="grid grid-cols-1 gap-x-6 px-1 sm:grid-cols-2">
          <li v-for="item in items" :key="item.id" class="flex items-center gap-3 border-b border-slate-100 py-2" data-test="sold-out-item">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium" :class="item.isAvailable ? 'text-slate-900' : 'text-slate-400 line-through'">
                {{ itemName(item) }}
              </p>
              <p v-if="item.stock !== null" class="text-xs text-slate-500">
                {{ $t('production.soldOut.stock', { n: item.stock }) }}
              </p>
            </div>
            <button
              type="button"
              class="min-h-[44px] rounded-lg border px-3 text-sm font-semibold disabled:opacity-50"
              :class="item.isAvailable ? 'border-rose-300 text-rose-700' : 'border-emerald-600 text-emerald-800'"
              :disabled="busy === item.id || (!item.isAvailable && item.stock === 0)"
              @click="set(item, !item.isAvailable)"
            >
              {{ item.isAvailable ? $t('production.soldOut.markSoldOut') : $t('production.soldOut.markAvailable') }}
            </button>
          </li>
        </ul>
      </div>
    </template>
  </UPopover>
</template>
