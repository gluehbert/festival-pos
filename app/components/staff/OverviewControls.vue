<script setup lang="ts">
import type { OwnerFilter } from '~/utils/table-grid'
import type { OverviewView } from '~/composables/useStaffView'

// The list/grid switch is only for the shift lead and admin.
withDefaults(defineProps<{ owner: OwnerFilter; view: OverviewView; showView?: boolean }>(), { showView: true })
const emit = defineEmits<{ owner: [OwnerFilter]; view: [OverviewView] }>()

const OWNERS = ['mine', 'all'] as const
const VIEWS = [
  { key: 'list', icon: 'i-lucide-list' },
  { key: 'grid', icon: 'i-lucide-layout-grid' },
] as const
</script>

<template>
  <div class="mt-4 flex items-center justify-between gap-2">
    <div class="flex gap-1 rounded-full bg-slate-100 p-1 text-sm" role="group" :aria-label="$t('staff.owner.label')">
      <button
        v-for="o in OWNERS"
        :key="o"
        type="button"
        class="min-h-[44px] rounded-full px-4 font-semibold"
        :class="owner === o ? 'bg-primary text-white' : 'text-slate-700'"
        :aria-pressed="owner === o"
        :data-test="`owner-${o}`"
        @click="emit('owner', o)"
      >
        {{ $t(`staff.owner.${o}`) }}
      </button>
    </div>
    <div v-if="showView" class="flex gap-1 rounded-full bg-slate-100 p-1 text-sm" role="group" :aria-label="$t('staff.view.label')">
      <button
        v-for="v in VIEWS"
        :key="v.key"
        type="button"
        class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
        :class="view === v.key ? 'bg-primary text-white' : 'text-slate-700'"
        :aria-pressed="view === v.key"
        :aria-label="$t(`staff.view.${v.key}`)"
        :title="$t(`staff.view.${v.key}`)"
        :data-test="`view-${v.key}`"
        @click="emit('view', v.key)"
      >
        <UIcon :name="v.icon" class="size-5 shrink-0" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
