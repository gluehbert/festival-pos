import { randomUUID } from 'node:crypto'
import { defineNitroPlugin } from 'nitropack/runtime'
import { setResponseHeader } from 'h3'

const SAFE_ID = /^[\w.-]{1,64}$/

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', (event) => {
    const incoming = event.node.req.headers['x-request-id']
    // Accept a caller-supplied id only if it is short and log-safe.
    const id = typeof incoming === 'string' && SAFE_ID.test(incoming)
      ? incoming
      : randomUUID()
    event.context.requestId = id
    setResponseHeader(event, 'x-request-id', id)
  })
})
