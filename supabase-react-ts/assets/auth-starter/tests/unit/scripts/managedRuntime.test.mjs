import { describe, expect, it, vi } from 'vitest'
import {
  claimRuntimeIdentity,
  inspectRuntimeProcess,
  stopManagedRuntime,
  validateRuntimeIdentity
} from '../../../scripts/managed-runtime.mjs'
import { readProcessIdentity } from '../../../scripts/process-identity.mjs'

const identity = {
  bootId: '01234567-89ab-cdef-0123-456789abcdef',
  marker: 'supabase-starter:0123456789abcdef',
  pid: 4242,
  platform: 'linux',
  projectRoot: '/tmp/example-project',
  startTimeTicks: '123456',
  version: 1
}

const processSnapshot = {
  ...identity,
  processGroupId: 4242,
  sessionId: 4242,
  state: 'S',
  title: identity.marker
}

const coordinate = (operation) => operation()

describe('managed runtime identity', () => {
  it('rejects malformed or cross-project persisted identity', () => {
    expect(() => validateRuntimeIdentity(
      { ...identity, projectRoot: '/tmp/another-project' },
      identity.projectRoot
    )).toThrow('belongs to another project')
  })

  it('requires the complete stable process identity', async () => {
    await expect(inspectRuntimeProcess(
      identity,
      async () => processSnapshot
    )).resolves.toBe('owned')

    await expect(inspectRuntimeProcess(
      identity,
      async () => ({ ...processSnapshot, startTimeTicks: '654321' })
    )).resolves.toBe('unowned')
  })

  it('recovers an unowned record before publishing a replacement runtime', async () => {
    const replacement = {
      ...identity,
      marker: 'supabase-starter:fedcba9876543210',
      pid: 4343,
      startTimeTicks: '654321'
    }
    let state = identity

    await expect(claimRuntimeIdentity({
      coordinate,
      createIdentity: async () => replacement,
      inspectProcess: async () => 'unowned',
      readIdentity: () => state,
      removeIdentity: () => {
        state = undefined
      },
      writeIdentity: (candidate) => {
        state = candidate
      }
    })).resolves.toEqual(replacement)

    expect(state).toEqual(replacement)
  })
})

describe('managed runtime shutdown', () => {
  it('clears a live but unowned record without signaling its process', async () => {
    const currentProcess = readProcessIdentity(process.pid)
    let state = {
      ...identity,
      ...currentProcess,
      marker: 'supabase-starter:aaaaaaaaaaaaaaaa',
      projectRoot: identity.projectRoot,
      version: 1
    }
    const sendSignal = vi.fn()

    await expect(stopManagedRuntime({
      coordinate,
      readIdentity: () => state,
      removeIdentity: () => {
        state = undefined
      },
      sendSignal
    })).resolves.toBe('stale-record-cleared')

    expect(sendSignal).not.toHaveBeenCalled()
    expect(state).toBeUndefined()
  })

  it('revalidates ownership immediately before signaling', async () => {
    const inspectProcess = vi.fn()
      .mockResolvedValueOnce('owned')
      .mockResolvedValueOnce('unowned')
    const sendSignal = vi.fn()

    await expect(stopManagedRuntime({
      coordinate,
      inspectProcess,
      readIdentity: () => identity,
      sendSignal
    })).rejects.toThrow('identity changed before shutdown')

    expect(inspectProcess).toHaveBeenCalledTimes(2)
    expect(sendSignal).not.toHaveBeenCalled()
  })

  it('retains state and fails when the owned runtime does not terminate', async () => {
    let state = identity
    const removeIdentity = vi.fn(() => {
      state = undefined
    })
    const sendSignal = vi.fn()

    await expect(stopManagedRuntime({
      coordinate,
      inspectProcess: async () => 'owned',
      maxChecks: 1,
      readIdentity: () => state,
      removeIdentity,
      sendSignal,
      sleep: async () => {}
    })).rejects.toThrow('did not terminate within the shutdown deadline')

    expect(sendSignal).toHaveBeenCalledOnce()
    expect(sendSignal).toHaveBeenCalledWith(identity.pid, 'SIGTERM')
    expect(removeIdentity).not.toHaveBeenCalled()
    expect(state).toEqual(identity)
  })

  it('reports success only after the owned identity disappears', async () => {
    let state = identity
    const inspectProcess = vi.fn()
      .mockResolvedValueOnce('owned')
      .mockResolvedValueOnce('owned')
      .mockResolvedValueOnce('stopped')
    const sendSignal = vi.fn()

    await expect(stopManagedRuntime({
      coordinate,
      inspectProcess,
      readIdentity: () => state,
      removeIdentity: () => {
        state = undefined
      },
      sendSignal,
      sleep: async () => {}
    })).resolves.toBe('stopped')

    expect(sendSignal).toHaveBeenCalledWith(identity.pid, 'SIGTERM')
    expect(state).toBeUndefined()
  })
})
