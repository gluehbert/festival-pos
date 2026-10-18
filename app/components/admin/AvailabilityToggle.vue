<script setup lang="ts">
defineProps<{
  modelValue: boolean
  busy?: boolean
  /** Item name, so screen readers announce which item the switch controls. */
  label?: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="busy"
    class="inline-flex h-6 w-11 items-center rounded-full transition-colors"
    :class="modelValue ? 'bg-emerald-500' : 'bg-slate-300'"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      class="inline-block h-5 w-5 transform rounded-full bg-surface shadow transition-transform"
      :class="modelValue ? 'translate-x-5' : 'translate-x-0.5'"
    />
    <span class="sr-only">{{ label ? `${label}: ` : '' }}{{ modelValue ? $t('admin.menu.available', 'available') : $t('admin.menu.unavailable', 'unavailable') }}</span>
  </button>
</template>
