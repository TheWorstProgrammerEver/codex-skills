import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type SupabaseStatus = {
  ANON_KEY?: string
  API_URL?: string
  PUBLISHABLE_KEY?: string
  SERVICE_ROLE_KEY?: string
}

type RuntimeConfig = {
  supabase?: {
    publishableKey?: string
    url?: string
  }
}

type FunctionRouteStatus = {
  functionName: string
  status?: number
}

let cachedAdminClient: SupabaseClient | undefined

const getStatus = () => {
  try {
    const output = execFileSync('npx', ['--no-install', 'supabase', 'status', '-o', 'json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const jsonStart = output.indexOf('{')

    return JSON.parse(output.slice(jsonStart)) as SupabaseStatus
  } catch {
    return undefined
  }
}

export const getLocalSupabaseConfig = () => {
  const status = getStatus()
  const visualConfig = JSON.parse(readFileSync('tests/visual/config.test.json', 'utf8')) as RuntimeConfig
  const url = process.env.SUPABASE_URL ?? status?.API_URL ?? visualConfig.supabase?.url
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
    ?? process.env.SUPABASE_ANON_KEY
    ?? status?.PUBLISHABLE_KEY
    ?? status?.ANON_KEY
    ?? visualConfig.supabase?.publishableKey
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? status?.SERVICE_ROLE_KEY

  if (!url || !publishableKey || !serviceRoleKey) {
    throw new Error('Security tests need local Supabase running. Run npm run get-going first.')
  }

  return { publishableKey, serviceRoleKey, url }
}

export const createAnonymousClient = () => {
  const { publishableKey, url } = getLocalSupabaseConfig()

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

export const createAdminClient = () => {
  if (cachedAdminClient) {
    return cachedAdminClient
  }

  const { serviceRoleKey, url } = getLocalSupabaseConfig()
  cachedAdminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  return cachedAdminClient
}

export const createSignedInClient = async (email: string, password: string) => {
  const client = createAnonymousClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })

  if (error || !data.session) {
    throw error ?? new Error(`Could not sign in ${email}.`)
  }

  return client
}

const parseTomlKey = (key: string) => {
  if (!key.startsWith('"')) {
    return key
  }

  try {
    return JSON.parse(key) as string
  } catch {
    return key.slice(1, -1)
  }
}

const getEnabledFunctionNames = () => {
  const config = readFileSync('supabase/config.toml', 'utf8')

  return [...new Set(config.split(/\n(?=\s*\[)/).flatMap((section) => {
    const sectionMatch = section.match(/^\s*\[functions\.((?:"(?:[^"\\]|\\.)+")|[A-Za-z0-9_-]+)\]\s*$/m)

    if (!sectionMatch || /^\s*enabled\s*=\s*false\s*(?:#.*)?$/m.test(section)) {
      return []
    }

    return [parseTomlKey(sectionMatch[1])]
  }))]
}

const isFunctionRouteReady = ({ functionName, status }: FunctionRouteStatus) => {
  if (status === undefined) {
    return false
  }

  if (functionName === 'app-health') {
    return status >= 200 && status < 300
  }

  return status !== 404 && status < 500
}

const getFunctionRouteStatus = async (url: string, functionName: string): Promise<FunctionRouteStatus> => {
  const response = await fetch(`${url}/functions/v1/${encodeURIComponent(functionName)}`, {
    signal: AbortSignal.timeout(3000)
  }).catch(() => undefined)

  return { functionName, status: response?.status }
}

export const requireLocalFunctionsReady = async () => {
  const { url } = getLocalSupabaseConfig()
  const statuses = await Promise.all(
    getEnabledFunctionNames().map((functionName) => getFunctionRouteStatus(url, functionName))
  )
  const unreadyFunctions = statuses.filter((status) => !isFunctionRouteReady(status))

  if (unreadyFunctions.length > 0) {
    const routeStatuses = unreadyFunctions
      .map(({ functionName, status }) => `${functionName}: ${status === undefined ? 'no response' : `HTTP ${status}`}`)
      .join(', ')

    throw new Error([
      'Security tests need configured local Edge Function routes ready. Run npm run get-going first.',
      'If app-health is ready but another route is HTTP 404, or a business route is HTTP 503 after adding shared imports, restart the local Supabase stack so Edge Runtime reloads this branch.',
      'If Edge Runtime is healthy but Kong reports name-resolution failures, restart the local Kong container and rerun get-going.',
      `Unready routes: ${routeStatuses}.`
    ].join(' '))
  }
}
