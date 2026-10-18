<script setup lang="ts">
import { ALLERGENS } from '~/../server/lib/allergens'
</script>

<template>
  <section class="rounded-lg border border-slate-200 bg-surface p-3 text-sm" data-test="allergen-legend">
    <h3 class="font-medium text-slate-700">
      {{ $t('common.allergens.legend') }}
    </h3>
    <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <template v-for="a in ALLERGENS" :key="a.key">
        <dt class="font-semibold text-slate-700">
          {{ a.code }}
        </dt>
        <dd class="text-slate-600">
          {{ $t(`common.allergens.names.${a.key}`) }}
        </dd>
      </template>
    </dl>
    <p class="mt-2 text-xs text-slate-500">
      {{ $t('common.allergens.disclaimer') }}
    </p>
  </section>
</template>
