import { defineNitroPlugin } from 'nitropack/runtime'
import { configProblems } from '../lib/config-check'
import { log } from '../lib/log'

export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  for (const problem of configProblems()) {
    log.error('config.invalid', { problem })
  }
})
