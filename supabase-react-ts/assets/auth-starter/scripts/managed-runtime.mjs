import { randomBytes } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync
} from 'node:fs'
import { isAbsolute } from 'node:path'
import { platform } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  isProcessExecuting,
  readProcessIdentity,
  stableProcessIdentityMatches
} from './process-identity.mjs'
import { withRuntimeStateCoordinator } from './runtime-state-coordinator.mjs'

const runtimeDirectory = fileURLToPath(new URL('../.starter-runtime/', import.meta.url))
const runtimeStatePath = fileURLToPath(new URL('../.starter-runtime/get-going.json', import.meta.url))
const runtimeProjectRoot = realpathSync(fileURLToPath(new URL('../', import.meta.url)))
const processMarkerPattern = /^supabase-starter:[a-f0-9]{16}$/
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const retainedStateRecovery = 'Inspect and stop only processes known to belong to this project, or restart the local machine. Once the old processes cannot still execute, remove .starter-runtime/get-going.json and retry.'
const retainedCleanupFailure = `Managed-runtime child cleanup failed; its state was retained. ${retainedStateRecovery}`
const retainedUnprovenCleanup = `Managed-runtime process stopped before child cleanup could be proven; its state was retained. ${retainedStateRecovery}`
const retainedUnownedRuntime = `Managed-runtime identity is stale or unowned, so child cleanup cannot be proven; its state was retained without signaling. ${retainedStateRecovery}`

export const validateRuntimeIdentity = (
  value,
  expectedProjectRoot = runtimeProjectRoot
) => {
  if (
    typeof value !== 'object'
    || value === null
    || value.version !== 2
    || (value.cleanupStatus !== 'active' && value.cleanupStatus !== 'failed')
    || !Number.isSafeInteger(value.pid)
    || value.pid <= 1
    || typeof value.marker !== 'string'
    || !processMarkerPattern.test(value.marker)
    || typeof value.projectRoot !== 'string'
    || !isAbsolute(value.projectRoot)
    || value.projectRoot !== expectedProjectRoot
  ) {
    throw new Error('Managed-runtime state is malformed or belongs to another project; refusing to signal any process. Verify no get-going process for this project remains, remove .starter-runtime/get-going.json, then retry.')
  }

  if (
    value.platform === 'linux'
    && typeof value.bootId === 'string'
    && /^[a-f0-9-]{16,64}$/.test(value.bootId)
    && typeof value.startTimeTicks === 'string'
    && /^\d+$/.test(value.startTimeTicks)
  ) {
    return {
      bootId: value.bootId,
      cleanupStatus: value.cleanupStatus,
      marker: value.marker,
      pid: value.pid,
      platform: value.platform,
      projectRoot: value.projectRoot,
      startTimeTicks: value.startTimeTicks,
      version: value.version
    }
  }

  if (
    value.platform === 'darwin'
    && typeof value.startTime === 'string'
    && /^\S{3}\s+\S{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4}$/.test(value.startTime)
  ) {
    return {
      cleanupStatus: value.cleanupStatus,
      marker: value.marker,
      pid: value.pid,
      platform: value.platform,
      projectRoot: value.projectRoot,
      startTime: value.startTime,
      version: value.version
    }
  }

  throw new Error('Managed-runtime state is malformed or belongs to another project; refusing to signal any process. Verify no get-going process for this project remains, remove .starter-runtime/get-going.json, then retry.')
}

const runtimeIdentityFromSnapshot = (marker, snapshot) => {
  if (!isProcessExecuting(snapshot) || snapshot.title !== marker) {
    throw new Error('Could not capture the managed-runtime process identity.')
  }

  if (snapshot.platform === 'linux') {
    return validateRuntimeIdentity({
      bootId: snapshot.bootId,
      cleanupStatus: 'active',
      marker,
      pid: snapshot.pid,
      platform: snapshot.platform,
      projectRoot: runtimeProjectRoot,
      startTimeTicks: snapshot.startTimeTicks,
      version: 2
    })
  }

  if (snapshot.platform === 'darwin') {
    return validateRuntimeIdentity({
      cleanupStatus: 'active',
      marker,
      pid: snapshot.pid,
      platform: snapshot.platform,
      projectRoot: runtimeProjectRoot,
      startTime: snapshot.startTime,
      version: 2
    })
  }

  throw new Error('Local process management supports Linux and macOS only.')
}

const createCurrentRuntimeIdentity = async () => {
  const marker = `supabase-starter:${randomBytes(8).toString('hex')}`
  process.title = marker
  return runtimeIdentityFromSnapshot(marker, await readProcessIdentity(process.pid))
}

const persistRuntimeIdentity = (identity) => {
  mkdirSync(runtimeDirectory, { mode: 0o700, recursive: true })
  writeFileSync(runtimeStatePath, `${JSON.stringify(identity)}\n`, {
    flag: 'wx',
    mode: 0o600
  })
}

const replaceRuntimeIdentity = (identity) => {
  const temporaryPath = `${runtimeStatePath}.${randomBytes(8).toString('hex')}.tmp`

  try {
    writeFileSync(temporaryPath, `${JSON.stringify(identity)}\n`, {
      flag: 'wx',
      mode: 0o600
    })
    renameSync(temporaryPath, runtimeStatePath)
  } finally {
    rmSync(temporaryPath, { force: true })
  }
}

const removeRuntimeIdentity = () => {
  rmSync(runtimeStatePath, { force: true })

  try {
    rmdirSync(runtimeDirectory)
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTEMPTY') {
      throw error
    }
  }
}

const runtimeIdentityMatches = (left, right) => {
  if (
    !left
    || left.version !== right.version
    || left.pid !== right.pid
    || left.marker !== right.marker
    || left.platform !== right.platform
    || left.projectRoot !== right.projectRoot
  ) {
    return false
  }

  return right.platform === 'linux'
    ? left.bootId === right.bootId && left.startTimeTicks === right.startTimeTicks
    : left.startTime === right.startTime
}

export const inspectRuntimeProcess = async (
  identity,
  readIdentity = readProcessIdentity
) => {
  const current = await readIdentity(identity.pid)

  if (!isProcessExecuting(current)) {
    return 'stopped'
  }

  if (current.title !== identity.marker) {
    return 'unowned'
  }

  return stableProcessIdentityMatches(identity, current) ? 'owned' : 'unowned'
}

const clearRuntimeIdentityIfCurrent = (identity, overrides = {}) => {
  const readIdentity = overrides.readIdentity ?? readRuntimeIdentity
  const removeIdentity = overrides.removeIdentity ?? removeRuntimeIdentity
  const current = readIdentity()

  if (current && runtimeIdentityMatches(current, identity)) {
    if (current.cleanupStatus !== 'active') {
      throw new Error(retainedCleanupFailure)
    }

    removeIdentity()
    return true
  }

  return false
}

const coordinateRuntimeState = (operation, overrides = {}) => (
  withRuntimeStateCoordinator(runtimeStatePath, operation, overrides)
)

export const withManagedRuntimeState = (operation, overrides) => (
  coordinateRuntimeState(operation, overrides)
)

export const clearRuntimeIdentity = async (identity, overrides = {}) => {
  const coordinate = overrides.coordinate
    ?? ((operation) => coordinateRuntimeState(operation, overrides.coordinatorOptions))

  return coordinate(() => clearRuntimeIdentityIfCurrent(identity, overrides))
}

export const markRuntimeCleanupFailed = async (identity, overrides = {}) => {
  const readIdentity = overrides.readIdentity ?? readRuntimeIdentity
  const writeIdentity = overrides.writeIdentity ?? replaceRuntimeIdentity
  const coordinate = overrides.coordinate
    ?? ((operation) => coordinateRuntimeState(operation, overrides.coordinatorOptions))

  return coordinate(() => {
    const current = readIdentity()

    if (!current || !runtimeIdentityMatches(current, identity)) {
      throw new Error('Could not retain managed-runtime child-cleanup failure because the runtime generation changed. Inspect this project runtime before retrying.')
    }

    if (current.cleanupStatus === 'failed') {
      return
    }

    writeIdentity({
      ...current,
      cleanupStatus: 'failed'
    })

    const published = readIdentity()

    if (
      !published
      || published.cleanupStatus !== 'failed'
      || !runtimeIdentityMatches(published, identity)
    ) {
      throw new Error('Could not verify the retained managed-runtime child-cleanup failure. Inspect this project runtime before retrying.')
    }
  })
}

const reconcileStoppedRuntimeIdentity = async (identity, overrides) => {
  const {
    coordinate,
    readIdentity
  } = overrides

  return coordinate(() => {
    const current = readIdentity()

    if (!current) {
      return 'stopped'
    }

    if (!runtimeIdentityMatches(current, identity)) {
      return 'state-changed'
    }

    if (current.cleanupStatus === 'failed') {
      throw new Error(retainedCleanupFailure)
    }

    throw new Error(retainedUnprovenCleanup)
  })
}

export const claimRuntimeIdentity = async (overrides = {}) => {
  if (platform() !== 'linux' && platform() !== 'darwin') {
    throw new Error('Local process management supports Linux and macOS only.')
  }

  const readIdentity = overrides.readIdentity ?? readRuntimeIdentity
  const inspectProcess = overrides.inspectProcess ?? inspectRuntimeProcess
  const createIdentity = overrides.createIdentity ?? createCurrentRuntimeIdentity
  const writeIdentity = overrides.writeIdentity ?? persistRuntimeIdentity
  const coordinate = overrides.coordinate
    ?? ((operation) => coordinateRuntimeState(operation, overrides.coordinatorOptions))

  return coordinate(async () => {
    const existing = readIdentity()

    if (existing) {
      if (existing.cleanupStatus === 'failed') {
        throw new Error(`Cannot start: ${retainedCleanupFailure}`)
      }

      const status = await inspectProcess(existing)

      if (status === 'owned') {
        throw new Error('Cannot start: another get-going process for this project is active.')
      }

      throw new Error(`Cannot start: ${status === 'stopped' ? retainedUnprovenCleanup : retainedUnownedRuntime}`)
    }

    const identity = await createIdentity()

    try {
      writeIdentity(identity)
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new Error('Cannot start: another get-going process claimed the runtime state.')
      }

      throw error
    }

    const published = readIdentity()

    if (!runtimeIdentityMatches(published, identity)) {
      throw new Error('Cannot start: the published runtime identity could not be verified.')
    }

    return { ...identity }
  })
}

export const readRuntimeIdentity = () => {
  let source

  try {
    source = readFileSync(runtimeStatePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined
    }

    throw error
  }

  try {
    return validateRuntimeIdentity(JSON.parse(source))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Managed-runtime state is malformed; refusing to signal any process. Verify no get-going process for this project remains, remove .starter-runtime/get-going.json, then retry.')
    }

    throw error
  }
}

const signalOwnedRuntime = async (identity, inspectProcess, sendSignal) => {
  const immediateStatus = await inspectProcess(identity)

  if (immediateStatus !== 'owned') {
    throw new Error('Managed-runtime identity changed before shutdown; refusing to signal it.')
  }

  try {
    sendSignal(identity.pid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH' || await inspectProcess(identity) === 'owned') {
      throw new Error('Could not signal the owned managed-runtime process.')
    }
  }
}

export const stopManagedRuntime = async (overrides = {}) => {
  const readIdentity = overrides.readIdentity ?? readRuntimeIdentity
  const inspectProcess = overrides.inspectProcess ?? inspectRuntimeProcess
  const sendSignal = overrides.sendSignal ?? ((pid, signal) => process.kill(pid, signal))
  const wait = overrides.sleep ?? sleep
  const maxChecks = overrides.maxChecks ?? 80
  const checkIntervalMs = overrides.checkIntervalMs ?? 250
  const coordinate = overrides.coordinate
    ?? ((operation) => coordinateRuntimeState(operation, overrides.coordinatorOptions))
  let identity

  const initialResult = await coordinate(async () => {
    identity = readIdentity()

    if (!identity) {
      return 'no-record'
    }

    if (identity.cleanupStatus === 'failed') {
      throw new Error(retainedCleanupFailure)
    }

    const status = await inspectProcess(identity)

    if (status === 'stopped' || status === 'unowned') {
      throw new Error(status === 'stopped'
        ? retainedUnprovenCleanup
        : retainedUnownedRuntime)
    }

    await signalOwnedRuntime(identity, inspectProcess, sendSignal)
    return 'signaled'
  })

  if (initialResult !== 'signaled') {
    return initialResult
  }

  for (let check = 0; check < maxChecks; check += 1) {
    await wait(checkIntervalMs)

    if (await inspectProcess(identity) !== 'owned') {
      return reconcileStoppedRuntimeIdentity(identity, {
        coordinate,
        readIdentity
      })
    }
  }

  throw new Error('Managed-runtime process did not terminate within the shutdown deadline; its state was retained. Retry all-done after inspecting that project process.')
}
