import { randomBytes } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  realpathSync,
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

export const validateRuntimeIdentity = (
  value,
  expectedProjectRoot = runtimeProjectRoot
) => {
  if (
    typeof value !== 'object'
    || value === null
    || value.version !== 1
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
      marker,
      pid: snapshot.pid,
      platform: snapshot.platform,
      projectRoot: runtimeProjectRoot,
      startTimeTicks: snapshot.startTimeTicks,
      version: 1
    })
  }

  if (snapshot.platform === 'darwin') {
    return validateRuntimeIdentity({
      marker,
      pid: snapshot.pid,
      platform: snapshot.platform,
      projectRoot: runtimeProjectRoot,
      startTime: snapshot.startTime,
      version: 1
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

const reconcileStoppedRuntimeIdentity = async (identity, overrides) => {
  const {
    coordinate,
    readIdentity,
    removeIdentity
  } = overrides

  return coordinate(() => {
    const current = readIdentity()

    if (!current) {
      return 'stopped'
    }

    if (!runtimeIdentityMatches(current, identity)) {
      return 'state-changed'
    }

    removeIdentity()
    return 'stopped'
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
  const removeIdentity = overrides.removeIdentity ?? removeRuntimeIdentity
  const coordinate = overrides.coordinate
    ?? ((operation) => coordinateRuntimeState(operation, overrides.coordinatorOptions))

  return coordinate(async () => {
    const existing = readIdentity()

    if (existing) {
      const status = await inspectProcess(existing)

      if (status === 'owned') {
        throw new Error('Cannot start: another get-going process for this project is active.')
      }

      if (!clearRuntimeIdentityIfCurrent(existing, { readIdentity, removeIdentity })) {
        throw new Error('Cannot start: runtime state changed during stale-state recovery.')
      }
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
  const removeIdentity = overrides.removeIdentity ?? removeRuntimeIdentity
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

    const status = await inspectProcess(identity)

    if (status === 'stopped' || status === 'unowned') {
      if (!clearRuntimeIdentityIfCurrent(identity, { readIdentity, removeIdentity })) {
        return 'state-changed'
      }

      return status === 'stopped' ? 'already-stopped' : 'stale-record-cleared'
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
        readIdentity,
        removeIdentity
      })
    }
  }

  throw new Error('Managed-runtime process did not terminate within the shutdown deadline; its state was retained. Retry all-done after inspecting that project process.')
}
