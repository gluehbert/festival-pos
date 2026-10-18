<script setup lang="ts">
import type { MenuItemDto, PopularItems } from '~/../server/lib/contracts/guest'
import MenuBrowser from '~/components/common/MenuBrowser.vue'
import MenuItem from './MenuItem.vue'
import AllergenLegend from '~/components/common/AllergenLegend.vue'
import { useAllergenDisplay } from '~/composables/useAllergenDisplay'

defineProps<{
  items: MenuItemDto[]
  loading?: boolean
  popular?: PopularItems | null
  quantities?: Record<string, number>
}>()

const emit = defineEmits<{ add: [MenuItemDto] }>()
const { shown: showAllergens } = useAllergenDisplay()
</script>

<template>
  <div class="space-y-4">
    <p v-if="loading && items.length === 0" class="text-sm text-slate-500">
      {{ $t('guest.menu.loading') }}
    </p>
    <p v-else-if="items.length === 0" class="text-sm text-slate-500">
      {{ $t('guest.menu.empty') }}
    </p>
    <MenuBrowser v-else :items="items" :popular="popular" :quantities="quantities" list-class="space-y-2">
      <template #item="{ item }">
        <li>
          <MenuItem :item="item" @add="emit('add', item)" />
        </li>
      </template>
    </MenuBrowser>
    <AllergenLegend v-if="showAllergens && items.length > 0" />
  </div>
</template>
