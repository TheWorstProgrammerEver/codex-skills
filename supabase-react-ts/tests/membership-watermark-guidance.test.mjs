import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readSkillFile = (relativePath) => readFile(path.join(skillRoot, relativePath), 'utf8')

test('membership watermark guidance composes exact durable and cursor boundaries', async () => {
  const [skill, security, watermarks] = await Promise.all([
    readSkillFile('SKILL.md'),
    readSkillFile('references/supabase-security.md'),
    readSkillFile('references/supabase-membership-watermarks.md')
  ])

  assert.match(skill, /supabase-membership-watermarks\.md/)
  assert.match(security, /\[membership watermark pattern\]\(supabase-membership-watermarks\.md\)/)
  assert.match(watermarks, /\[serialized tenant write pattern\]\(supabase-serialized-writes\.md\)/)
  assert.match(
    watermarks,
    /\[exact keyset cursor contract\]\(\.\.\/\.\.\/coding-style\/references\/general-implementation\.md#preserve-exact-keyset-cursor-tuples\)/
  )

  const requiredContracts = [
    /references public\.memberships\(id\) on delete cascade/,
    /watermark is the greatest sequence this active membership has durably\s+acknowledged/,
    /not a timestamp/,
    /greatest\(\s*membership_read_watermarks\.sequence,\s*excluded\.sequence\s*\)/,
    /Return the stored greatest sequence/,
    /inside the same\s+database transaction as the append/,
    /single contiguous watermark means sender advancement also acknowledges every\s+earlier sequence/,
    /last_committed_sequence - coalesce\(watermark\.sequence, 0\)/,
    /effective_sequence := greatest/,
    /stream\.sequence > effective_sequence/,
    /older reconnect cursor/,
    /statement containing only the lock lookup/,
    /active membership in a fresh statement/,
    /queued behind committed membership removal must\s+resume, recheck a fresh statement, and fail/
  ]

  for (const contract of requiredContracts) {
    assert.match(watermarks, contract)
  }
})

test('membership watermark guidance requires the complete security and mutation matrix', async () => {
  const watermarks = await readSkillFile('references/supabase-membership-watermarks.md')
  const requiredScenarios = [
    'Initial exact unread state',
    'Sequential and repeated acknowledgement',
    'Controlled out-of-order acknowledgements',
    'Reconnect catch-up',
    'Append during pagination',
    'Sender advancement',
    'Membership removal race',
    'Membership cascade',
    'Tenant cascade',
    'Missing, removed, anonymous, or cross-tenant caller',
    'Catalog boundary'
  ]

  for (const scenario of requiredScenarios) {
    assert(watermarks.includes(scenario), `missing membership watermark scenario: ${scenario}`)
  }

  const unsafeMutations = [
    'Timestamp watermark',
    'Regressing upsert',
    'Cursor-only reconnect',
    'Joined lock and membership read',
    "pg_stat_activity.wait_event_type = 'Lock'",
    'Rerun the complete protected matrix after restoration'
  ]

  for (const mutation of unsafeMutations) {
    assert(watermarks.includes(mutation), `missing membership watermark mutation: ${mutation}`)
  }
})
