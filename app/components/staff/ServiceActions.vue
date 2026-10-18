<script setup lang="ts">
import { computed } from 'vue'
import type { DeviceMode } from '~/composables/useDeviceMode'

// The order buttons of the service screen. The device's main job gets the
// big button: table orders on a waiter's phone, walk-ins at the counter.
// Pfand and helper meals only show when the event uses them.
const props = defineProps<{ mode: DeviceMode; deposit: boolean; staffMeals: boolean }>()

const table = { to: '/staff/order', key: 'staff.overview.newOrder', icon: 'i-lucide-plus', test: 'new-order-link' }
const counter = { to: '/staff/order?walkin=1', key: 'staff.overview.walkin', icon: 'i-lucide-shopping-bag', test: 'walkin-link' }
const main = computed(() => (props.mode === 'counter' ? counter : table))
const second = computed(() => (props.mode === 'counter' ? table : counter))
</script>

<template>
  <div class="mt-4 grid grid-cols-3 gap-2" data-test="service-actions">
    <NuxtLink
      :to="main.to"
      class="col-span-2 flex min-h-[56px] items-center justify-center gap-2 rounded-lg bg-brand-gradient px-3 text-center text-lg font-semibold text-brand-contrast"
      :data-test="main.test"
    >
      <UIcon :name="main.icon" class="size-5 shrink-0" aria-hidden="true" />
      {{ $t(main.key) }}
    </NuxtLink>
    <NuxtLink
      :to="second.to"
      class="flex min-h-[56px] items-center justify-center rounded-lg border-2 border-slate-300 bg-surface px-2 text-center text-sm font-semibold text-slate-900"
      :data-test="second.test"
    >
      {{ $t(second.key) }}
    </NuxtLink>
    <NuxtLink
      v-if="deposit"
      to="/staff/deposit"
      :class="staffMeals ? 'col-span-2' : 'col-span-3'"
      class="flex min-h-[48px] items-center justify-center gap-2 rounded-lg border-2 border-slate-300 bg-surface px-3 text-center font-semibold text-slate-900"
      data-test="deposit-link"
    >
      <UIcon name="i-lucide-glass-water" class="size-5 shrink-0" aria-hidden="true" />
      {{ $t('staff.deposit.nav') }}
    </NuxtLink>
    <NuxtLink
      v-if="staffMeals"
      to="/staff/order?meal=1"
      :class="deposit ? '' : 'col-span-3'"
      class="flex min-h-[48px] items-center justify-center rounded-lg px-2 text-center text-sm font-semibold text-slate-600 hover:bg-slate-100"
      data-test="staff-meal-link"
    >
      {{ $t('staff.meal.nav') }}
    </NuxtLink>
  </div>
</template>
