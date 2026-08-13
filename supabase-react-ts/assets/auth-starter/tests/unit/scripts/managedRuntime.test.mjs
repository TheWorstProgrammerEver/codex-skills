import { describe, expect, it, vi } from 'vitest'
import {
  claimRuntimeIdentity,
  inspectRuntimeProcess,
  markRuntimeCleanupFailed,
  stopManagedRuntime,
  validateRuntimeIdentity
} from '../../../scripts/managed-runtime.mjs'
import { readProcessIdentity } from '../../../scripts/process-identity.mjs'

const identity = {
  bootId: '01234567-89ab-cdef-0123-456789abcdef',
  cleanupStatus: 'active',
  marker: 'supabase-starter:0123456789abcdef',
  pid: 4242,
  platform: 'linux',
  projectRoot: '/tmp/example-project',
  startTimeTicks: '123456',
  version: 2
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

    expect(() => validateRuntimeIdentity(
      { ...identity, version: 1 },
      identity.projectRoot
    )).toThrow('malformed')
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

  it('retains an unowned record instead of forgetting possible child cleanup', async () => {
    const replacement = {
      ...identity,
      marker: 'supabase-starter:fedcba9876543210',
      pid: 4343,
      startTimeTicks: '654321'
    }
    let state = identity

    const createIdentity = vi.fn(async () => replacement)
    const writeIdentity = vi.fn((candidate) => {
      state = candidate
    })

    await expect(claimRuntimeIdentity({
      coordinate,
      createIdentity,
      inspectProcess: async () => 'unowned',
      readIdentity: () => state,
      writeIdentity
    })).rejects.toThrow('child cleanup cannot be proven')

    expect(createIdentity).not.toHaveBeenCalled()
    expect(writeIdentity).not.toHaveBeenCalled()
    expect(state).toEqual(identity)
  })

  it('persists a child-cleanup failure on only the current generation', async () => {
    let state = identity

    await expect(markRuntimeCleanupFailed(identity, {
      coordinate,
      readIdentity: () => state,
      writeIdentity: (candidate) => {
        state = candidate
      }
    })).resolves.toBeUndefined()

    expect(state).toEqual({
      ...identity,
      cleanupStatus: 'failed'
    })

    const replacement = {
      ...identity,
      marker: 'supabase-starter:fedcba9876543210',
      pid: 4343,
      startTimeTicks: '654321'
    }
    state = replacement

    await expect(markRuntimeCleanupFailed(identity, {
      coordinate,
      readIdentity: () => state,
      writeIdentity: (candidate) => {
        state = candidate
      }
    })).rejects.toThrow('runtime generation changed')

    expect(state).toEqual(replacement)
  })

  it('refuses a replacement start while cleanup failure is retained', async () => {
    const failedIdentity = {
      ...identity,
      cleanupStatus: 'failed'
    }
    const inspectProcess = vi.fn()

    await expect(claimRuntimeIdentity({
      coordinate,
      inspectProcess,
      readIdentity: () => failedIdentity
    })).rejects.toThrow('Cannot start: Managed-runtime child cleanup failed')

    expect(inspectProcess).not.toHaveBeenCalled()
  })
})

describe('managed runtime shutdown', () => {
  it('retains a live but unowned record without signaling its process', async () => {
    const currentProcess = readProcessIdentity(process.pid)
    let state = {
      ...identity,
      ...currentProcess,
      marker: 'supabase-starter:aaaaaaaaaaaaaaaa',
      projectRoot: identity.projectRoot,
      version: 2
    }
    const sendSignal = vi.fn()

    await expect(stopManagedRuntime({
      coordinate,
      readIdentity: () => state,
      removeIdentity: () => {
        state = undefined
      },
      sendSignal
    })).rejects.toThrow('child cleanup cannot be proven')

    expect(sendSignal).not.toHaveBeenCalled()
    expect(state).toEqual(expect.objectContaining({
      cleanupStatus: 'active'
    }))
  })

  it('retains a terminal active record when child cleanup is unproven', async () => {
    let state = identity
    const removeIdentity = vi.fn(() => {
      state = undefined
    })

    await expect(stopManagedRuntime({
      coordinate,
      inspectProcess: async () => 'stopped',
      readIdentity: () => state,
      removeIdentity,
      sendSignal: vi.fn()
    })).rejects.toThrow('stopped before child cleanup could be proven')

    expect(removeIdentity).not.toHaveBeenCalled()
    expect(state).toEqual(identity)
  })

  it('retains a terminal child-cleanup failure for bounded recovery', async () => {
    const failedIdentity = {
      ...identity,
      cleanupStatus: 'failed'
    }
    let state = failedIdentity
    const removeIdentity = vi.fn(() => {
      state = undefined
    })
    const sendSignal = vi.fn()

    await expect(stopManagedRuntime({
      coordinate,
      inspectProcess: async () => 'stopped',
      readIdentity: () => state,
      removeIdentity,
      sendSignal
    })).rejects.toThrow('child cleanup failed; its state was retained')

    expect(removeIdentity).not.toHaveBeenCalled()
    expect(sendSignal).not.toHaveBeenCalled()
    expect(state).toEqual(failedIdentity)
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

  it('does not treat manager termination alone as successful child cleanup', async () => {
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
    })).rejects.toThrow('stopped before child cleanup could be proven')

    expect(sendSignal).toHaveBeenCalledWith(identity.pid, 'SIGTERM')
    expect(state).toEqual(identity)
  })

  it('accepts normal owner self-release after successful termination', async () => {
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
      sleep: async () => {
        state = undefined
      }
    })).resolves.toBe('stopped')

    expect(sendSignal).toHaveBeenCalledWith(identity.pid, 'SIGTERM')
    expect(state).toBeUndefined()
  })

  it('preserves a replacement generation after the old owner terminates', async () => {
    const replacement = {
      ...identity,
      marker: 'supabase-starter:fedcba9876543210',
      pid: 4343,
      startTimeTicks: '654321'
    }
    let state = identity
    const inspectProcess = vi.fn()
      .mockResolvedValueOnce('owned')
      .mockResolvedValueOnce('owned')
      .mockResolvedValueOnce('stopped')
    const removeIdentity = vi.fn(() => {
      state = undefined
    })

    await expect(stopManagedRuntime({
      coordinate,
      inspectProcess,
      readIdentity: () => state,
      removeIdentity,
      sendSignal: vi.fn(),
      sleep: async () => {
        state = replacement
      }
    })).resolves.toBe('state-changed')

    expect(removeIdentity).not.toHaveBeenCalled()
    expect(state).toEqual(replacement)
  })
})
