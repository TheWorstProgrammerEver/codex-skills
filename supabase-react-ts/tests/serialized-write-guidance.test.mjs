import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readSkillFile = (relativePath) => readFile(path.join(skillRoot, relativePath), 'utf8')

test('tenant sequence and idempotency guidance share one serialization boundary', async () => {
  const [skill, security, serializedWrites] = await Promise.all([
    readSkillFile('SKILL.md'),
    readSkillFile('references/supabase-security.md'),
    readSkillFile('references/supabase-serialized-writes.md')
  ])

  assert.match(skill, /supabase-serialized-writes\.md/)
  assert.match(security, /\[serialized tenant write pattern\]\(supabase-serialized-writes\.md\)/)

  const requiredContracts = [
    /unique `\(tenant_id, sequence\)`/,
    /unique `\(tenant_id, actor_id, client_key\)`/,
    /Derive `actor_id` from the current authenticated database context/,
    /statement containing only the serialization-root lookup/,
    /select the\s+authoritative tenant row `FOR UPDATE`/,
    /fresh statement after the lock is held, resolve the current actor again/,
    /new statement after the lock is held/,
    /canonical payload is identical/,
    /raise\s+a stable conflict/,
    /counter update, effect insert, key insert, and returned row belong to the\s+same transaction/,
    /Do not combine the tenant lock and\s+membership authorization into one joined `SELECT \.\.\. FOR UPDATE`/,
    /pre-wait snapshot/,
    /no direct `INSERT`, `UPDATE`,\s+or `DELETE` privilege/,
    /parent-owned lifecycle is compatible with append-only callers/,
    /RLS is enabled on effects and idempotency keys/,
    /pg_stat_activity/,
    /wait_event_type` is `Lock`/,
    /counter, effects, and keys and require no residue/
  ]

  for (const contract of requiredContracts) {
    assert.match(serializedWrites, contract)
  }
})

test('guidance requires complete scenario and unsafe-mutation coverage', async () => {
  const serializedWrites = await readSkillFile('references/supabase-serialized-writes.md')
  const requiredScenarios = [
    'Distinct concurrent sends',
    'Many identical retries',
    'Same key, different actor',
    'Same actor and key, different tenant',
    'Same scoped key, different payload',
    'Invalid or over-limit key/payload',
    'Failure after allocation',
    'Missing, pending, removed, or cross-tenant actor',
    'Ordinary direct mutation',
    'Parent deletion'
  ]

  for (const scenario of requiredScenarios) {
    assert(serializedWrites.includes(scenario), `missing serialized write scenario: ${scenario}`)
  }

  const requiredMutations = [
    'Unlocked allocator or `max(sequence) + 1`',
    'Idempotency lookup before the tenant lock',
    'Joined lock and membership authorization',
    'explicit test-only barrier',
    'shared advisory "arrived" lock'
  ]

  for (const mutation of requiredMutations) {
    assert(serializedWrites.includes(mutation), `missing serialized write mutation: ${mutation}`)
  }
})
