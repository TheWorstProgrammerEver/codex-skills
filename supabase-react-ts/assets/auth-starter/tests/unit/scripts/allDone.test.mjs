import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { createServer } from 'node:net'
import { platform, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { main } from '../../../scripts/all-done.mjs'
import { stopManagedRuntime } from '../../../scripts/managed-runtime.mjs'
import {
  isProcessExecuting,
  readProcessIdentity,
  stableProcessIdentityMatches
} from '../../../scripts/process-identity.mjs'

const stopped = [
  { label: 'App', running: false, url: 'http://127.0.0.1:5173/' },
  { label: 'Supabase API', running: false, url: 'http://127.0.0.1:54321/' }
]

const noOp = async () => {}
const coordinate = (operation) => operation()

const waitFor = async (check, timeoutMs = 3000) => {
  const deadline = performance.now() + timeoutMs

  while (performance.now() < deadline) {
    const result = check()

    if (result) {
      return result
    }

    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  throw new Error('Timed out waiting for the terminal-retry fixture.')
}

const readFixturePid = (path) => {
  try {
    return Number(readFileSync(path, 'utf8')) || undefined
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined
    }

    throw error
  }
}

const toRuntimeIdentity = (marker, snapshot, cleanupStatus) => ({
  ...(snapshot.platform === 'linux'
    ? {
        bootId: snapshot.bootId,
        startTimeTicks: snapshot.startTimeTicks
      }
    : { startTime: snapshot.startTime }),
  cleanupStatus,
  marker,
  pid: snapshot.pid,
  platform: snapshot.platform,
  projectRoot: '/tmp/example-project',
  version: 2
})

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

  it.runIf(platform() === 'linux' || platform() === 'darwin')(
    'retains failed child cleanup after the manager exits instead of reporting success',
    async () => {
      const fixtureDirectory = mkdtempSync(join(tmpdir(), 'starter-terminal-retry-'))
      const descendantPidPath = join(fixtureDirectory, 'descendant.pid')
      const releasePath = join(fixtureDirectory, 'release')
      const marker = 'supabase-starter:abcdef0123456789'
      let descendantIdentity
      let managerIdentity
      let state

      const descendant = [
        "const { writeFileSync } = require('node:fs')",
        "process.on('SIGTERM', () => {})",
        "writeFileSync(process.argv[1], String(process.pid))",
        'setInterval(() => {}, 1000)'
      ].join(';')
      const manager = [
        "const { existsSync } = require('node:fs')",
        "const { spawn } = require('node:child_process')",
        `process.title = ${JSON.stringify(marker)}`,
        `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}, process.argv[1]], { stdio: 'ignore' }).unref()`,
        "const timer = setInterval(() => { if (existsSync(process.argv[2])) { clearInterval(timer); process.exit(1) } }, 10)"
      ].join(';')
      const managerProcess = spawn(
        process.execPath,
        ['-e', manager, descendantPidPath, releasePath],
        { detached: true, stdio: 'ignore' }
      )

      try {
        managerIdentity = await waitFor(() => {
          const current = readProcessIdentity(managerProcess.pid)

          return isProcessExecuting(current) && current.title === marker
            ? current
            : undefined
        })
        const descendantPid = await waitFor(() => readFixturePid(descendantPidPath))
        descendantIdentity = await waitFor(() => {
          const current = readProcessIdentity(descendantPid)

          return isProcessExecuting(current) ? current : undefined
        })
        expect(descendantIdentity.processGroupId).toBe(managerIdentity.processGroupId)
        state = toRuntimeIdentity(marker, managerIdentity, 'failed')
        writeFileSync(releasePath, 'release\n')
        await waitFor(() => !isProcessExecuting(readProcessIdentity(managerIdentity.pid)))

        const removeIdentity = vi.fn(() => {
          state = undefined
        })
        const stopSupabase = vi.fn(noOp)

        await expect(main({
          disableSupabaseContainerRestarts: noOp,
          stopManagedDevRuntime: () => stopManagedRuntime({
            coordinate,
            readIdentity: () => state,
            removeIdentity
          }),
          stopSupabase,
          waitForEndpointsOff: async () => stopped
        })).rejects.toThrow('child cleanup failed; its state was retained')

        expect(removeIdentity).not.toHaveBeenCalled()
        expect(stopSupabase).not.toHaveBeenCalled()
        expect(state).toEqual(toRuntimeIdentity(marker, managerIdentity, 'failed'))
        expect(isProcessExecuting(readProcessIdentity(descendantIdentity.pid))).toBe(true)
      } finally {
        if (!existsSync(releasePath)) {
          writeFileSync(releasePath, 'release\n')
        }

        if (!descendantIdentity) {
          const descendantPid = readFixturePid(descendantPidPath)
          const current = descendantPid
            ? readProcessIdentity(descendantPid)
            : undefined

          if (
            isProcessExecuting(current)
            && current.processGroupId === managerProcess.pid
          ) {
            descendantIdentity = current
          }
        }

        if (descendantIdentity) {
          const current = readProcessIdentity(descendantIdentity.pid)

          if (
            isProcessExecuting(current)
            && stableProcessIdentityMatches(descendantIdentity, current)
          ) {
            process.kill(descendantIdentity.pid, 'SIGKILL')
          }

          await waitFor(() => !isProcessExecuting(
            readProcessIdentity(descendantIdentity.pid)
          )).catch(() => {})
        }

        if (managerIdentity) {
          const current = readProcessIdentity(managerIdentity.pid)

          if (
            isProcessExecuting(current)
            && stableProcessIdentityMatches(managerIdentity, current)
          ) {
            process.kill(-managerIdentity.processGroupId, 'SIGKILL')
          }

          await waitFor(() => !isProcessExecuting(
            readProcessIdentity(managerIdentity.pid)
          )).catch(() => {})
        } else if (
          managerProcess.exitCode === null
          && managerProcess.signalCode === null
        ) {
          managerProcess.kill('SIGKILL')
        }

        rmSync(fixtureDirectory, { force: true, recursive: true })
      }
    },
    10000
  )

  it('does not stop Supabase after a replacement runtime claims ownership', async () => {
    const disableSupabaseContainerRestarts = vi.fn(noOp)
    const stopSupabase = vi.fn(noOp)
    let runtimeIdentity

    await expect(main({
      disableSupabaseContainerRestarts,
      readRuntimeIdentity: () => runtimeIdentity,
      stopManagedDevRuntime: async () => {
        runtimeIdentity = { pid: 4242 }
      },
      stopSupabase,
      withManagedRuntimeState: (operation) => operation()
    })).rejects.toThrow('no replacement generation was disrupted')

    expect(disableSupabaseContainerRestarts).not.toHaveBeenCalled()
    expect(stopSupabase).not.toHaveBeenCalled()
  })

  it('holds generation exclusion across every Supabase stop effect', async () => {
    let stateIsCoordinated = false
    const expectCoordinated = vi.fn(async () => {
      expect(stateIsCoordinated).toBe(true)
    })

    await expect(main({
      disableSupabaseContainerRestarts: expectCoordinated,
      readFinalRuntime: async () => undefined,
      readRuntimeIdentity: () => undefined,
      stopManagedDevRuntime: noOp,
      stopSupabase: expectCoordinated,
      waitForEndpointsOff: async () => stopped,
      withManagedRuntimeState: async (operation) => {
        stateIsCoordinated = true

        try {
          return await operation()
        } finally {
          stateIsCoordinated = false
        }
      }
    })).resolves.toBeUndefined()

    expect(expectCoordinated).toHaveBeenCalledTimes(2)
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
