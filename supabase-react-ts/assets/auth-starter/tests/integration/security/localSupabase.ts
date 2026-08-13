import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

type SupabaseStatus = {
  ANON_KEY?: string
  API_URL?: string
  PUBLISHABLE_KEY?: string
  SERVICE_ROLE_KEY?: string
}

const loopbackHosts = new Set(['127.0.0.1', '[::1]', 'localhost'])

const requireLocalOrigin = (value: string) => {
  const url = new URL(value)

  if (url.protocol !== 'http:' || !loopbackHosts.has(url.hostname)) {
    throw new Error('Security integration tests require a local HTTP loopback Supabase URL.')
  }

  return url.origin
}

const output = execFileSync('npx', ['--no-install', 'supabase', 'status', '-o', 'json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore']
})
const jsonStart = output.indexOf('{')

if (jsonStart === -1) {
  throw new Error('Security integration tests need local Supabase running.')
}

const status = JSON.parse(output.slice(jsonStart)) as SupabaseStatus
const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY
const serviceRoleKey = status.SERVICE_ROLE_KEY

if (!status.API_URL || !publishableKey || !serviceRoleKey) {
  throw new Error('Local Supabase status did not provide the required test configuration.')
}

const url = requireLocalOrigin(status.API_URL)
const options = { auth: { autoRefreshToken: false, persistSession: false } }

export const getLocalSupabaseConfig = () => ({ publishableKey, url })
export const createAnonymousClient = () => createClient(url, publishableKey, options)
export const createAdminClient = () => createClient(url, serviceRoleKey, options)
