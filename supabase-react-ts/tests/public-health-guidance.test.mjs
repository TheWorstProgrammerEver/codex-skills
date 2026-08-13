import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readSkillFile = (relativePath) => readFile(path.join(skillRoot, relativePath), 'utf8')

test('public health guidance preserves the endpoint and database privilege boundary', async () => {
  const [skill, architecture, security, deployment, health] = await Promise.all([
    readSkillFile('SKILL.md'),
    readSkillFile('references/architecture.md'),
    readSkillFile('references/supabase-security.md'),
    readSkillFile('references/config-and-deploy.md'),
    readSkillFile('references/public-health-endpoints.md')
  ])

  for (const source of [skill, architecture, security, deployment]) {
    assert.match(source, /public-health-endpoints\.md/)
  }
  assert.match(security, /Business Edge Functions must require authenticated users/)

  const requiredContracts = [
    /accept no caller-selected SQL, schema, table, RPC name, or database URL/,
    /discard the RPC response body/,
    /never expose database error text/,
    /function-relative path such as `\/health`/,
    /\/health\/unexpected/,
    /\/functions\/v1\/health\/unexpected/,
    /Cache-Control: no-store/,
    /rate and in-flight work/,
    /scales with active workers/,
    /never-settling database adapter is aborted/,
    /without invoking the database/,
    /fixed RPC and direct health-table reads fail for both `anon` and a valid `authenticated` session/,
    /revoke all on function public\.health_check\(\) from anon/,
    /revoke all on function public\.health_check\(\) from authenticated/,
    /grant execute on function public\.health_check\(\) to service_role/,
    /expect\(takeBudget\)\.not\.toHaveBeenCalled\(\)/,
    /expect\(checkDatabase\)\.not\.toHaveBeenCalled\(\)/,
    /finally \{/,
    /After cleanup, require the canonical anonymous endpoint to become healthy/
  ]

  for (const contract of requiredContracts) {
    assert.match(health, contract)
  }

  const revoke = health.indexOf(
    'revoke execute on function public.health_check() from service_role'
  )
  const cleanup = health.indexOf('} finally {', revoke)
  const restore = health.indexOf(
    'grant execute on function public.health_check() to service_role',
    cleanup
  )
  assert(revoke >= 0 && revoke < cleanup && cleanup < restore)

  assert.doesNotMatch(
    health,
    /grant execute on function public\.health_check\(\) to (anon|authenticated)/i
  )
})
