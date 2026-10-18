<script setup lang="ts">
import { useAdminToast } from '~/composables/useAdminPage'

const { toast } = useAdminToast()
</script>

<template>
  <transition name="fade">
    <div
      v-if="toast"
      class="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg"
      :class="toast.kind === 'success' ? 'bg-success' : 'bg-danger'"
      role="status"
    >
      {{ toast.text }}
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
