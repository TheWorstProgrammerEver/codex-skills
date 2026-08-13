import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  readRuntimeIdentity,
  stopManagedRuntime,
  withManagedRuntimeState
} from './managed-runtime.mjs'

const appPort = 5173
const supabasePort = 54321
const studioPort = 54323
const mailPort = 54324
const supabaseConfigPath = 'supabase/config.toml'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: false
  })
  let stdout = ''
  let stderr = ''

  if (options.capture) {
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
  }

  child.on('error', reject)
  child.on('close', (code) => {
    if (code === 0) {
      resolve({ stdout, stderr })
      return
    }

    const error = new Error(`${command} ${args.join(' ')} exited ${code}`)
    error.stdout = stdout
    error.stderr = stderr
    reject(error)
  })
})

const tryRun = async (command, args, options = {}) => {
  try {
    return {
      ok: true,
      ...await run(command, args, options)
    }
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      message: error.message
    }
  }
}

const httpOk = async (url) => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500) })
    return true
  } catch {
    return false
  }
}

const getSupabaseProjectId = () => {
  const config = readFileSync(supabaseConfigPath, 'utf8')
  const match = config.match(/^project_id\s*=\s*"([^"]+)"\s*$/m)

  if (!match) {
    throw new Error('Could not find project_id in supabase/config.toml')
  }

  return match[1]
}

const stopManagedDevRuntime = async () => {
  const result = await stopManagedRuntime()

  if (result === 'no-record') {
    console.log('OK  No project-managed dev runtime is recorded')
  } else if (result === 'state-changed') {
    throw new Error('Runtime ownership changed during shutdown; no replacement process was signaled. Retry all-done after inspecting this project runtime.')
  }
}

const disableSupabaseContainerRestarts = async () => {
  const projectId = getSupabaseProjectId()
  const result = await tryRun('docker', [
    'ps',
    '-aq',
    '--filter',
    `label=com.supabase.cli.project=${projectId}`
  ], { capture: true })

  if (!result.ok) {
    return
  }

  const containerIds = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (containerIds.length === 0) {
    return
  }

  console.log('Disabling Docker auto-restart for local Supabase containers...')
  const update = await tryRun('docker', ['update', '--restart=no', ...containerIds])

  if (!update.ok) {
    throw new Error('Could not disable restart for this project\'s local Supabase containers.')
  }
}

const stopSupabase = async () => {
  console.log('Stopping Supabase...')
  const result = await tryRun('npm', ['run', 'supabase:stop'])

  if (result.ok) {
    return
  }

  console.error(result.stderr || result.stdout || result.message)
  throw new Error('Supabase did not stop cleanly.')
}

const endpointChecks = [
  ['App', `http://127.0.0.1:${appPort}/`],
  ['Supabase API', `http://127.0.0.1:${supabasePort}/auth/v1/settings`],
  ['Studio', `http://127.0.0.1:${studioPort}`],
  ['Mailpit', `http://127.0.0.1:${mailPort}`]
]

const getEndpointStatuses = () => Promise.all(endpointChecks.map(async ([label, url]) => ({
  label,
  running: await httpOk(url),
  url
})))

const waitForEndpointsOff = async () => {
  for (let check = 0; check < 20; check += 1) {
    const statuses = await getEndpointStatuses()

    if (statuses.every(({ running }) => !running)) {
      return statuses
    }

    await sleep(250)
  }

  return getEndpointStatuses()
}

const printEndpointStatus = (statuses) => {
  console.log('\nLocal endpoint status')
  console.log('--------------------------------')

  for (const { label, running, url } of statuses) {
    console.log(`${running ? 'RUN' : 'OFF'} ${label.padEnd(14)} ${url}`)
  }
}

export const main = async (overrides = {}) => {
  const stopRuntime = overrides.stopManagedDevRuntime ?? stopManagedDevRuntime
  const disableRestarts = overrides.disableSupabaseContainerRestarts
    ?? disableSupabaseContainerRestarts
  const stopLocalSupabase = overrides.stopSupabase ?? stopSupabase
  const waitForOff = overrides.waitForEndpointsOff ?? waitForEndpointsOff
  const readCurrentRuntime = overrides.readRuntimeIdentity ?? readRuntimeIdentity
  const runWithRuntimeState = overrides.withManagedRuntimeState
    ?? ((operation) => withManagedRuntimeState(operation))
  const readFinalRuntime = overrides.readFinalRuntime
    ?? (() => runWithRuntimeState(() => readCurrentRuntime()))

  await stopRuntime()
  await runWithRuntimeState(async () => {
    if (readCurrentRuntime()) {
      throw new Error('Runtime ownership changed before Supabase shutdown; no replacement generation was disrupted. Retry all-done after inspecting this project runtime.')
    }

    await disableRestarts()
    await stopLocalSupabase()
  })

  const statuses = await waitForOff()
  printEndpointStatus(statuses)
  const running = statuses.filter((status) => status.running)
  const runtimeIdentity = await readFinalRuntime()

  if (runtimeIdentity) {
    throw new Error('Local shutdown is incomplete because a project-managed runtime remains. Retry all-done after inspecting that process.')
  }

  if (running.length > 0) {
    throw new Error(`Local shutdown is incomplete; still responding: ${running.map(({ label }) => label).join(', ')}. No unowned listener was signaled.`)
  }

  console.log('\nAll done.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
