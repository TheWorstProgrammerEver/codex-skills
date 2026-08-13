import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('owner invariant guidance covers every table and opposing write direction', async () => {
  const [securityGuide, ownerGuide] = await Promise.all([
    readFile(path.join(skillRoot, 'references', 'supabase-security.md'), 'utf8'),
    readFile(path.join(skillRoot, 'references', 'supabase-owner-invariants.md'), 'utf8')
  ])

  assert.match(securityGuide, /\[cross-table owner invariant\]\(supabase-owner-invariants\.md\)/)

  const requiredContracts = [
    /non-null `owner_principal_id`/,
    /partial unique index/,
    /Create the matching owner membership\s+automatically/,
    /composite foreign key/,
    /DEFERRABLE INITIALLY DEFERRED/,
    /security definer\nset search_path = ''/,
    /revoke all on function/,
    /new\.tenant_id is distinct from old\.tenant_id/,
    /new\.principal_id is distinct from old\.principal_id/,
    /new\.role is distinct from old\.role/,
    /parent tenant row is already absent/,
    /service-role clients bypass\s+RLS, while constraints and triggers still protect/,
    /principal row is the lock key/,
    /tenant row is the lock key/,
    /invitation first, membership second/,
    /membership first, invitation second/,
    /pg_stat_activity\.wait_event_type/,
    /Hold an uncommitted human-to-machine principal conversion/,
    /Hold uncommitted eligible-human tenant creation/,
    /Hold an uncommitted invitation/,
    /Hold an uncommitted membership/
  ]

  for (const contract of requiredContracts) {
    assert.match(ownerGuide, contract)
  }

  const requiredMutations = [
    'Insert a second owner membership',
    'Demote or delete the owner membership',
    'Change tenant, principal, and role together',
    'Convert an owning human principal to a machine kind',
    "Null or change the owning principal's Auth link",
    'Create a tenant owned by a machine principal',
    'Add membership for a pending invitee',
    'Invite an existing active human member',
    'Delete the parent tenant'
  ]

  for (const mutation of requiredMutations) {
    assert(ownerGuide.includes(mutation), `missing owner invariant mutation: ${mutation}`)
  }
})
