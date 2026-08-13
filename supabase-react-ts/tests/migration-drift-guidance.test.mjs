import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assertLocalMigrationAlignment,
  parseMigrationList
} from '../assets/auth-starter/scripts/check-local-migrations.mjs'

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const starterRoots = [
  path.join(skillRoot, 'assets', 'auth-starter'),
  path.join(skillRoot, 'assets', 'starter')
]

test('both starters gate security tests on the same read-only migration check', async () => {
  const scripts = await Promise.all(starterRoots.map((root) => (
    readFile(path.join(root, 'scripts', 'check-local-migrations.mjs'), 'utf8')
  )))
  const tests = await Promise.all(starterRoots.map((root) => (
    readFile(path.join(root, 'tests', 'unit', 'scripts', 'checkLocalMigrations.test.mjs'), 'utf8')
  )))
  const packages = await Promise.all(starterRoots.map(async (root) => (
    JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  )))

  assert.equal(scripts[0], scripts[1])
  assert.equal(tests[0], tests[1])

  for (const packageJson of packages) {
    assert.equal(
      packageJson.scripts['supabase:check-migrations'],
      'node scripts/check-local-migrations.mjs'
    )
    assert.match(packageJson.scripts['test:security'], /^npm run supabase:check-migrations && /)
    assert.equal(packageJson.scripts['supabase:reset'], 'supabase db reset --local')
  }
})

test('the migration gate detects a database retaining a migration absent from the checkout', () => {
  const branchBViewOfBranchADatabase = `
        LOCAL      │     REMOTE     │     TIME (UTC)
  ─────────────────┼────────────────┼──────────────────────
   20260619000000 │ 20260619000000 │ 2026-06-19 00:00:00
                  │ 20260813000000 │ 2026-08-13 00:00:00
  `

  assert.throws(
    () => assertLocalMigrationAlignment(parseMigrationList(branchBViewOfBranchADatabase)),
    /applied only in the database: 20260813000000/
  )
})

test('skill guidance separates startup, disposable reset, and preserved-data recovery', async () => {
  const [skill, security] = await Promise.all([
    readFile(path.join(skillRoot, 'SKILL.md'), 'utf8'),
    readFile(path.join(skillRoot, 'references', 'supabase-security.md'), 'utf8')
  ])

  assert.match(skill, /successful `supabase start`[\s\S]*not proof/)
  assert.match(security, /For a disposable local test database/)
  assert.match(security, /If local data must be preserved, do not reset/)
  assert.match(security, /Marking a history[\s\S]*row reverted does not remove the schema objects/)
})
