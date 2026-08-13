import { createServer } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { main } from '../../../scripts/all-done.mjs'

const stopped = [
  { label: 'App', running: false, url: 'http://127.0.0.1:5173/' },
  { label: 'Supabase API', running: false, url: 'http://127.0.0.1:54321/' }
]

const noOp = async () => {}

describe('all-done terminal reconciliation', () => {
  it('fails without signaling when an unrelated listener still responds', async () => {
    const unrelatedListener = createServer()
    await new Promise((resolve) => unrelatedListener.listen({ host: '127.0.0.1', port: 0 }, resolve))
    const stopManagedDevRuntime = vi.fn(noOp)

    try {
      await expect(main({
        disableSupabaseContainerRestarts: noOp,
        readFinalRuntime: async () => undefined,
        stopManagedDevRuntime,
        stopSupabase: noOp,
        waitForEndpointsOff: async () => [
          { label: 'App', running: true, url: 'http://127.0.0.1:5173/' },
          stopped[1]
        ]
      })).rejects.toThrow('No unowned listener was signaled')

      expect(unrelatedListener.listening).toBe(true)
      expect(stopManagedDevRuntime).toHaveBeenCalledOnce()
    } finally {
      await new Promise((resolve, reject) => unrelatedListener.close((error) => (
        error ? reject(error) : resolve()
      )))
    }
  })

  it('cannot report success while a managed runtime remains', async () => {
    await expect(main({
      disableSupabaseContainerRestarts: noOp,
      readFinalRuntime: async () => ({ pid: 4242 }),
      stopManagedDevRuntime: noOp,
      stopSupabase: noOp,
      waitForEndpointsOff: async () => stopped
    })).rejects.toThrow('project-managed runtime remains')
  })

  it('reports success only after runtime and endpoints are terminal', async () => {
    await expect(main({
      disableSupabaseContainerRestarts: noOp,
      readFinalRuntime: async () => undefined,
      stopManagedDevRuntime: noOp,
      stopSupabase: noOp,
      waitForEndpointsOff: async () => stopped
    })).resolves.toBeUndefined()
  })
})
