import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readSkillFile = (relativePath) => readFile(path.join(skillRoot, relativePath), 'utf8')

test('private Realtime guidance is routed and keeps the join policy probe-safe', async () => {
  const [skill, security, realtime] = await Promise.all([
    readSkillFile('SKILL.md'),
    readSkillFile('references/supabase-security.md'),
    readSkillFile('references/supabase-private-realtime.md')
  ])

  assert.match(skill, /supabase-private-realtime\.md/)
  assert.match(security, /\[private Realtime authorization pattern\]\(supabase-private-realtime\.md\)/)
  assert.match(realtime, /rolled-back\s+join probe/)
  assert.match(realtime, /Do not add `realtime\.messages\.private IS TRUE`/)

  const policyBlocks = [...realtime.matchAll(/```sql\n([\s\S]*?)```/g)].map((match) => match[1])
  assert(policyBlocks.some((block) => (
    block.includes("realtime.messages.extension = 'broadcast'")
      && block.includes('realtime.topic()')
  )))
  assert(policyBlocks.every((block) => !block.includes('realtime.messages.private')))
  assert.match(realtime, /grant app_realtime_agent to authenticator;/)
  assert.match(realtime, /grant authenticated to app_realtime_agent;/)
  assert.match(realtime, /agent role below inherits\s+`authenticated`/)
  assert.match(realtime, /require the exact\s+human role and reject the dedicated Realtime token kind/)
  assert.match(realtime, /require the dedicated token kind, exact agent role/)
})

test('private Realtime guidance covers the full private and least-authority boundary', async () => {
  const realtime = await readSkillFile('references/supabase-private-realtime.md')
  const requiredContracts = [
    /config: \{ private: true \}/,
    /`realtime\.send\(\.\.\.\)`/,
    /Channel Restrictions to\s+private-only/,
    /no unintended Broadcast `INSERT` or\s+Presence policy/,
    /supabase gen signing-key --algorithm ES256/,
    /A key that\s+Supabase generated cannot be extracted/,
    /must not contain the private `d` value/,
    /legacy\s+production JWT secret/,
    /NOLOGIN`, `INHERIT`, `NOSUPERUSER`, `NOCREATEDB`,\s+`NOCREATEROLE`, `NOREPLICATION`, and `NOBYPASSRLS`/,
    /canonical\s+application principal resolver returns no principal/,
    /live Data API reads expose no rows/,
    /restrictive deny to the dedicated role/,
    /Audit every exposed table, view, and function/,
    /whose `sub` deliberately equals a human member's\s+Auth user ID still fails the human helper and private join/,
    /fresh session, subscription, or reconnect after removal is denied\s+immediately/,
    /retain cached policy state until\s+a new JWT, reconnect, or token expiry/,
    /opaque delivery `id` in `payload` and `meta`/,
    /fetch persisted application context[\s\S]*last trusted sequence\/watermark/
  ]

  for (const contract of requiredContracts) {
    assert.match(realtime, contract)
  }
})

test('validation matrix crosses human and agent policy paths with live joins', async () => {
  const realtime = await readSkillFile('references/supabase-private-realtime.md')
  const requiredScenarios = [
    '| Human | Active member |',
    '| Human | Outsider and pending invitee |',
    '| Human | Cross-topic and post-removal fresh client |',
    '| Human | Client send |',
    '| Agent | Active member with bounded topic claim |',
    '| Agent | Missing claim, cross-topic, inactive agent, and removed membership |',
    '| Agent | Human-subject confusion |',
    '| Agent | Refresh and reconnect |',
    '| Agent | Client send |',
    '| Agent | Data API and chat isolation |',
    '| Agent | Expiry |',
    '| Both | Exact wire shape |',
    '| Removed connection | Cached residual |'
  ]

  assert.match(realtime, /real private Realtime WebSocket\s+joins/)
  assert.match(realtime, /\.channel\(topic, \{ config: \{ private: true \} \}\)/)
  assert.match(realtime, /not to reach `SUBSCRIBED`/)
  assert.match(realtime, /An\s+agent denial is not evidence that the human policy denies the same case/)

  for (const scenario of requiredScenarios) {
    assert(realtime.includes(scenario), `missing private Realtime scenario: ${scenario}`)
  }
})
