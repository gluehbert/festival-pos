import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'
import type { CreateStaff, StaffDto, StaffList, UpdateStaff } from '~/../server/lib/contracts/staff-admin'

export const useStaffAdminStore = defineStore('staff-admin', () => {
  const members = ref<StaffDto[]>([])
  const loading = ref(false)

  async function fetchAll(): Promise<void> {
    loading.value = true
    try {
      members.value = (await useApi().get<StaffList>('/api/admin/staff')).staff
    }
    finally {
      loading.value = false
    }
  }

  async function create(input: CreateStaff): Promise<StaffDto> {
    const created = await useApi().post<StaffDto>('/api/admin/staff', input)
    members.value = [...members.value, created].sort((a, b) => a.username.localeCompare(b.username))
    return created
  }

  async function update(id: string, patch: UpdateStaff): Promise<StaffDto> {
    const updated = await useApi().patch<StaffDto>(`/api/admin/staff/${id}`, patch)
    members.value = members.value.map((m) => (m.id === id ? updated : m))
    return updated
  }

  return { members, loading, fetchAll, create, update }
})
