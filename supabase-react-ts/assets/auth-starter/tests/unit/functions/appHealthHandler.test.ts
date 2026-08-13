import { describe, expect, test, vi } from 'vitest'
import { createAppHealthHandler } from '../../../supabase/functions/app-health/handler'

describe('app health handler', () => {
  test('serves the exact runtime path', async () => {
    const readEnvironment = vi.fn(() => 'test')
    const handle = createAppHealthHandler({ readEnvironment })

    const response = handle(new Request('http://function.invalid/app-health'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      service: 'app-health',
      environment: 'test'
    })
    expect(readEnvironment).toHaveBeenCalledOnce()
  })

  test('rejects a suffix path before the health effect runs', async () => {
    const readEnvironment = vi.fn(() => 'test')
    const handle = createAppHealthHandler({ readEnvironment })

    const response = handle(new Request('http://function.invalid/app-health/unexpected'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
    expect(readEnvironment).not.toHaveBeenCalled()
  })
})
