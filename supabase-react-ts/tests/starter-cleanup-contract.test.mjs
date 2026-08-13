import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const starterRoots = [
  path.join(skillRoot, 'assets', 'auth-starter'),
  path.join(skillRoot, 'assets', 'starter')
]

const requiredSources = {
  'scripts/all-done.mjs': [
    /stopManagedRuntime\(\)/,
    /if \(runtimeIdentity\)/,
    /if \(running\.length > 0\)/,
    /No unowned listener was signaled/
  ],
  'scripts/managed-runtime.mjs': [
    /projectRoot/,
    /withRuntimeStateCoordinator/,
    /const immediateStatus = await inspectProcess\(identity\)/,
    /did not terminate within the shutdown deadline/
  ],
  'tests/visual/supabaseTestAuth.ts': [
    /url\.protocol !== 'http:' \|\| !loopbackHosts\.has\(url\.hostname\)/,
    /browserOrigin !== adminOrigin/,
    /data\.nextPage !== page \+ 1/,
    /const remaining = await findSupabaseUsersByEmail/,
    /could not prove deletion/
  ]
}

const forbiddenSignalAuthority = [
  /\blsof\b/,
  /\bpgrep\b/,
  /supabase functions serve['"]?\)/
]

const validateStarter = async (starterRoot) => {
  for (const [relativePath, patterns] of Object.entries(requiredSources)) {
    const source = await readFile(path.join(starterRoot, relativePath), 'utf8')

    for (const pattern of patterns) {
      assert.match(source, pattern, `${relativePath} is missing ${pattern}`)
    }
  }

  const allDone = await readFile(path.join(starterRoot, 'scripts/all-done.mjs'), 'utf8')

  for (const pattern of forbiddenSignalAuthority) {
    assert.doesNotMatch(allDone, pattern, `all-done uses discovery as signal authority: ${pattern}`)
  }
}

test('both starters retain the cleanup safety contract', async () => {
  await Promise.all(starterRoots.map(validateStarter))

  for (const relativePath of Object.keys(requiredSources)) {
    const sources = await Promise.all(starterRoots.map((root) => (
      readFile(path.join(root, relativePath), 'utf8')
    )))

    assert.equal(sources[0], sources[1], `${relativePath} drifted between starters`)
  }

  const workflow = await readFile(path.join(skillRoot, '..', '.github', 'workflows', 'validate.yml'), 'utf8')
  assert.match(workflow, /ubuntu-latest/)
  assert.match(workflow, /macos-latest/)
  assert.match(workflow, /npm test/)
})

test('unsafe cleanup mutations fail the outer contract', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'starter-cleanup-contract-'))

  try {
    await cp(starterRoots[0], temporaryRoot, { recursive: true })
    const mutations = [
      ['scripts/all-done.mjs', 'if (runtimeIdentity) {', 'if (false) {'],
      [
        'scripts/managed-runtime.mjs',
        'const immediateStatus = await inspectProcess(identity)',
        "const immediateStatus = 'owned'"
      ],
      [
        'tests/visual/supabaseTestAuth.ts',
        "url.protocol !== 'http:' || !loopbackHosts.has(url.hostname)",
        'false'
      ],
      [
        'tests/visual/supabaseTestAuth.ts',
        'data.nextPage !== page + 1',
        'false'
      ],
      [
        'tests/visual/supabaseTestAuth.ts',
        'const remaining = await findSupabaseUsersByEmail',
        'const removedVerification = await findSupabaseUsersByEmail'
      ]
    ]

    for (const [relativePath, before, after] of mutations) {
      const target = path.join(temporaryRoot, relativePath)
      const original = await readFile(target, 'utf8')
      assert.notEqual(original.replace(before, after), original)
      await writeFile(target, original.replace(before, after))
      await assert.rejects(validateStarter(temporaryRoot))
      await writeFile(target, original)
    }
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})
