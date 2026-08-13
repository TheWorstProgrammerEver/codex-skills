import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { validateTestDiscovery } from '../assets/auth-starter/scripts/validate-test-discovery.mjs'

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const starterRoots = [
  path.join(skillRoot, 'assets', 'auth-starter'),
  path.join(skillRoot, 'assets', 'starter')
]

test('both starters discover every committed unit test', async () => {
  const results = await Promise.all(starterRoots.map(validateTestDiscovery))

  for (const result of results) {
    assert.deepEqual(result.includeGlobs, ['tests/unit/**/*.test.{ts,mjs}'])
    assert(result.testFiles.some((filePath) => filePath.endsWith('/preflight.test.mjs')))
  }

  const validatorSources = await Promise.all(starterRoots.map((starterRoot) => (
    readFile(path.join(starterRoot, 'scripts', 'validate-test-discovery.mjs'), 'utf8')
  )))
  assert.equal(validatorSources[0], validatorSources[1])
})

test('the legacy TypeScript-only include fails on preflight.test.mjs', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'supabase-vitest-discovery-'))

  try {
    await cp(starterRoots[0], temporaryRoot, { recursive: true })
    const configPath = path.join(temporaryRoot, 'vitest.config.ts')
    const config = await readFile(configPath, 'utf8')
    await writeFile(configPath, config.replace('**/*.test.{ts,mjs}', '**/*.test.ts'))

    await assert.rejects(
      validateTestDiscovery(temporaryRoot),
      /Vitest test\.include does not discover every committed unit test:[\s\S]*preflight\.test\.mjs/
    )
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})
