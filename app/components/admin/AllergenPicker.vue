<script setup lang="ts">
import { computed } from 'vue'
import { ALLERGENS, sortAllergens, type Allergen, type Diet } from '~/../server/lib/allergens'

// null = not recorded yet; [] = checked, contains none of the 14.
const allergens = defineModel<Allergen[] | null>('allergens', { required: true })
const diet = defineModel<Diet | null>('diet', { required: true })

const recorded = computed({
  get: () => allergens.value !== null,
  set: (on: boolean) => { allergens.value = on ? [] : null },
})

function toggle(key: Allergen, on: boolean) {
  const current = allergens.value ?? []
  allergens.value = sortAllergens(on ? [...current, key] : current.filter((k) => k !== key))
}
</script>

<template>
  <fieldset class="space-y-2 text-sm" data-test="allergen-picker">
    <legend class="text-xs uppercase tracking-wide text-slate-500">
      {{ $t('admin.menu.allergens') }}
    </legend>
    <label class="flex items-center gap-2">
      <input v-model="recorded" type="checkbox" data-test="allergens-recorded">
      <span>{{ $t('admin.menu.allergensRecorded') }}</span>
    </label>
    <p class="text-xs text-slate-500">
      {{ recorded ? $t('admin.menu.allergensNoneChecked') : $t('admin.menu.allergensNotRecorded') }}
    </p>
    <div v-if="recorded" class="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
      <label v-for="a in ALLERGENS" :key="a.key" class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="allergens?.includes(a.key)"
          :data-test="`allergen-${a.key}`"
          @change="toggle(a.key, ($event.target as HTMLInputElement).checked)"
        >
        <span><span class="font-semibold">{{ a.code }}</span> {{ $t(`common.allergens.names.${a.key}`) }}</span>
      </label>
    </div>
    <label class="block pt-1">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.menu.diet') }}</span>
      <select v-model="diet" class="mt-1 rounded border border-slate-300 px-2 py-1" data-test="diet-select">
        <option :value="null">{{ $t('admin.menu.dietNone') }}</option>
        <option value="vegetarian">{{ $t('common.allergens.diet.vegetarian') }}</option>
        <option value="vegan">{{ $t('common.allergens.diet.vegan') }}</option>
      </select>
    </label>
  </fieldset>
</template>
