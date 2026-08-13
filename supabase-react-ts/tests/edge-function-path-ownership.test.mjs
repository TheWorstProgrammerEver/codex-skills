import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readSkillFile = (relativePath) => readFile(path.join(skillRoot, relativePath), 'utf8')

test('edge function guidance distinguishes exact and intentional multi-route ownership', async () => {
  const [skill, architecture, security] = await Promise.all([
    readSkillFile('SKILL.md'),
    readSkillFile('references/architecture.md'),
    readSkillFile('references/supabase-security.md')
  ])

  assert.match(skill, /Edge Function name as a URL routing prefix, not exact-path enforcement/)
  assert.match(architecture, /before\s+authentication, database access, or any other privileged effect/)
  assert.match(architecture, /single-route function/)
  assert.match(architecture, /intentionally multi-route function/)
  assert.match(architecture, /explicit table or bounded matcher/)
  assert.match(architecture, /pathname\.startsWith\(functionPrefix\)/)
  assert.match(security, /suffix-path negative/)
  assert.match(security, /database or effect adapter was not reached/)
  assert.match(security, /\/functions\/v1\/<function-name>\/unexpected/)
  assert.match(security, /every owned route class plus one unowned path/)
})

test('both starters enforce and test the app-health pathname contract', async () => {
  for (const starter of ['auth-starter', 'starter']) {
    const securityPath = starter === 'auth-starter'
      ? `assets/${starter}/tests/integration/security/appHealthSecurity.test.ts`
      : `assets/${starter}/tests/integration/security/appSecurity.test.ts`
    const [handler, unit, security] = await Promise.all([
      readSkillFile(`assets/${starter}/supabase/functions/app-health/handler.ts`),
      readSkillFile(`assets/${starter}/tests/unit/functions/appHealthHandler.test.ts`),
      readSkillFile(securityPath)
    ])

    assert.match(handler, /pathname !== appHealthPath/)
    assert(handler.indexOf('pathname !== appHealthPath') < handler.indexOf('readEnvironment()'))
    assert.match(unit, /\/app-health\/unexpected/)
    assert.match(unit, /readEnvironment\)\.not\.toHaveBeenCalled/)
    assert.match(security, /\/functions\/v1\/app-health\/unexpected/)
  }
})

test('the worked example owns its body-dispatch function path exactly', async () => {
  const [handler, security] = await Promise.all([
    readSkillFile('assets/starter/supabase/functions/app/index.ts'),
    readSkillFile('assets/starter/tests/integration/security/appSecurity.test.ts')
  ])

  const pathCheck = handler.indexOf("pathname !== '/app'")
  const authEffect = handler.indexOf('context.supabase.auth.getUser()')
  const suffixRequest = security.indexOf('/functions/v1/app/unexpected')
  const suffixDenial = security.indexOf('expect(response.status).toBe(404)', suffixRequest)

  assert(pathCheck >= 0 && pathCheck < authEffect)
  assert(suffixRequest >= 0 && suffixRequest < suffixDenial)
})
