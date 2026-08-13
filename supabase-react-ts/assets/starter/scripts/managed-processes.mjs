import { spawn } from 'node:child_process'
import { platform } from 'node:os'
import {
  isProcessExecuting,
  processGroupMembersMatch,
  readProcessGroupMembers,
  readProcessIdentity,
  stableProcessIdentityMatches
} from './process-identity.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const signalManagedProcessGroup = (processGroupId, signal, expectedMembers) => {
  const currentMembers = readProcessGroupMembers(processGroupId)

  if (!processGroupMembersMatch(expectedMembers, currentMembers)) {
    throw new Error('Managed process-group identity changed before signaling.')
  }

  if (currentMembers.length === 0) {
    return
  }

  try {
    process.kill(-processGroupId, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH' || readProcessGroupMembers(processGroupId).length > 0) {
      throw error
    }
  }
}

const waitForProcessGroupExit = async (processGroupId, timeoutMs, pollIntervalMs) => {
  const deadline = performance.now() + timeoutMs

  while (performance.now() < deadline) {
    if (readProcessGroupMembers(processGroupId).length === 0) {
      return true
    }

    await sleep(pollIntervalMs)
  }

  return readProcessGroupMembers(processGroupId).length === 0
}

const getOwnedProcessGroupMembers = ({
  child,
  label,
  leaderIdentity,
  membersAfterLeaderExit,
  exitObservationError
}) => {
  const processGroupId = child.pid
  const currentMembers = readProcessGroupMembers(processGroupId)

  if (currentMembers.length === 0) {
    return []
  }

  const leader = readProcessIdentity(processGroupId)

  if (
    isProcessExecuting(leader)
    && leader.processGroupId === processGroupId
    && stableProcessIdentityMatches(leaderIdentity, leader)
  ) {
    return currentMembers
  }

  if (
    exitObservationError
    || !membersAfterLeaderExit
    || !processGroupMembersMatch(membersAfterLeaderExit, currentMembers)
  ) {
    throw new Error(`${label} process-group ownership is ambiguous; refusing to signal it.`)
  }

  return currentMembers
}

const terminateManagedProcess = async (managedProcess, options) => {
  const { child, label } = managedProcess
  const processGroupId = child.pid

  if (!processGroupId) {
    if (child.exitCode === null && child.signalCode === null && !child.kill('SIGTERM')) {
      throw new Error(`${label} did not accept its shutdown signal.`)
    }

    return
  }

  const ownedMembers = getOwnedProcessGroupMembers(managedProcess)

  if (ownedMembers.length === 0) {
    return
  }

  console.log(`Stopping ${label}...`)
  signalManagedProcessGroup(processGroupId, 'SIGTERM', ownedMembers)

  if (await waitForProcessGroupExit(
    processGroupId,
    options.graceMs,
    options.pollIntervalMs
  )) {
    return
  }

  signalManagedProcessGroup(processGroupId, 'SIGKILL', ownedMembers)

  if (!await waitForProcessGroupExit(
    processGroupId,
    options.killWaitMs,
    options.pollIntervalMs
  )) {
    throw new Error(`${label} did not terminate within the shutdown deadline.`)
  }
}

export const startManagedProcess = (processes, label, command, args) => {
  if (platform() !== 'linux' && platform() !== 'darwin') {
    throw new Error('Local process management supports Linux and macOS only.')
  }

  console.log(`Starting ${label}...`)
  const child = spawn(command, args, {
    detached: true,
    stdio: 'inherit',
    shell: false
  })
  const leaderIdentity = readProcessIdentity(child.pid)

  if (
    !isProcessExecuting(leaderIdentity)
    || leaderIdentity.processGroupId !== child.pid
  ) {
    child.kill('SIGTERM')
    throw new Error(`Could not capture ${label} isolated process-group ownership.`)
  }

  const managedProcess = {
    child,
    exitObservationError: undefined,
    label,
    leaderIdentity,
    membersAfterLeaderExit: undefined
  }

  child.on('exit', (code) => {
    try {
      managedProcess.membersAfterLeaderExit = readProcessGroupMembers(child.pid)
    } catch (error) {
      managedProcess.exitObservationError = error
    }

    if (code !== null && code !== 0) {
      console.error(`${label} exited with code ${code}`)
    }
  })

  processes.push(managedProcess)
}

export const stopManagedProcesses = async (managedProcesses, overrides = {}) => {
  const options = {
    graceMs: overrides.graceMs ?? 5000,
    killWaitMs: overrides.killWaitMs ?? 5000,
    pollIntervalMs: overrides.pollIntervalMs ?? 50
  }
  const processes = managedProcesses.splice(0)
  const results = await Promise.allSettled(processes.map((managedProcess) => (
    terminateManagedProcess(managedProcess, options)
  )))
  const failures = results.filter((result) => result.status === 'rejected')

  if (failures.length > 0) {
    throw new Error(failures.map((failure) => failure.reason.message).join('\n'))
  }
}
