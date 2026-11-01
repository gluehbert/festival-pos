import { test, expect } from '@playwright/test'
import { apiError } from '../../app/utils/api-error'
import { apiFailure } from '../app/setup/api-error'

// The client reads error codes with apiError(); the unit tests mock failed
// calls with apiFailure(). Both rely on where the built server and $fetch put
// an AppError, so check it against the real thing.
test.describe('@smoke API errors', () => {
  test('$fetch gets the AppError payload under data.data', async ({ page }) => {
    await page.goto('/staff/login')
    const err = await page.evaluate(async () => {
      try {
        await (globalThis as unknown as { $fetch: (url: string, opts: unknown) => Promise<unknown> })
          .$fetch('/api/session', { method: 'POST', body: {} })
        return null
      }
      catch (e) {
        const { statusCode, status, data } = e as { statusCode?: number; status?: number; data?: unknown }
        return { statusCode, status, data }
      }
    })

    expect(err).toMatchObject({ statusCode: 400, status: 400 })
    expect(apiError(err)).toMatchObject({ code: 'VALIDATION', message: 'Invalid request', details: expect.any(Array) })
    // The mock in the unit tests has the same layout as the real answer.
    expect(Object.keys((err as { data: object }).data)).toEqual(expect.arrayContaining(Object.keys(apiFailure(400, 'VALIDATION').data)))
  })
})
