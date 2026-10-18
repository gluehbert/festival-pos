<script setup lang="ts">
import { computed } from 'vue'
import { allergenCodes, sortAllergens, type Allergen, type Diet } from '~/../server/lib/allergens'

// Allergen letter codes ("A, G") plus a vegetarian/vegan tag. Screen readers
// get the full names; `null` (not recorded yet) reads "on request".
const props = defineProps<{ allergens: Allergen[] | null; diet: Diet | null }>()

const { t } = useI18n()

const codes = computed(() => (props.allergens && props.allergens.length > 0 ? allergenCodes(props.allergens) : ''))
const fullNames = computed(() =>
  sortAllergens(props.allergens ?? []).map((k) => t(`common.allergens.names.${k}`)).join(', '),
)
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-test="allergen-codes">
    <span v-if="allergens === null" class="text-slate-500">{{ $t('common.allergens.onRequest') }}</span>
    <template v-else-if="codes">
      <span aria-hidden="true" class="font-semibold tracking-wide text-slate-600" :title="fullNames">{{ codes }}</span>
      <span class="sr-only">{{ $t('common.allergens.codesAria', { list: fullNames }) }}</span>
    </template>
    <span
      v-if="diet"
      class="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800"
      data-test="diet-tag"
    >{{ $t(`common.allergens.diet.${diet}`) }}</span>
  </span>
</template>
