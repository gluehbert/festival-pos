import { defineStore } from 'pinia'
import { ref } from 'vue'
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser'
import { useApi } from '~/composables/useApi'
import type { PasskeyDto, PasskeyList } from '~/../server/lib/contracts/passkeys'

// The signed-in staff member's own passkeys.
export const usePasskeysStore = defineStore('passkeys', () => {
  const passkeys = ref<PasskeyDto[]>([])
  const loading = ref(false)

  async function fetchAll(): Promise<void> {
    loading.value = true
    try {
      passkeys.value = (await useApi().get<PasskeyList>('/api/auth/passkeys')).passkeys
    }
    finally {
      loading.value = false
    }
  }

  // Opens the device dialog (fingerprint, face, PIN or password manager).
  async function add(name: string): Promise<PasskeyDto> {
    const api = useApi()
    const optionsJSON = await api.post<PublicKeyCredentialCreationOptionsJSON>('/api/auth/passkeys/register-options')
    const response = await startRegistration({ optionsJSON })
    const created = await api.post<PasskeyDto>('/api/auth/passkeys/register', { name, response })
    passkeys.value = [...passkeys.value, created]
    return created
  }

  async function remove(id: string): Promise<void> {
    await useApi().del(`/api/auth/passkeys/${id}`)
    passkeys.value = passkeys.value.filter((p) => p.id !== id)
  }

  return { passkeys, loading, fetchAll, add, remove }
})
