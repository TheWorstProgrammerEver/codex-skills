import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const starterRoot = path.join(skillRoot, 'assets', 'auth-starter')
const readStarterFile = (relativePath) => readFile(path.join(starterRoot, relativePath), 'utf8')
const getTomlSection = (source, name) => source
  .split(/\n(?=\[)/)
  .find((section) => section.startsWith(`[${name}]\n`))

test('auth starter keeps backend-disabled signup validation explicit and opt-in', async () => {
  const [config, disabledTest, enabledTest, packageSource, readme] = await Promise.all([
    readStarterFile('supabase/config.toml'),
    readStarterFile('tests/integration/security/signupDisabledSecurity.test.ts'),
    readStarterFile('tests/integration/security/signupSecurity.test.ts'),
    readStarterFile('package.json'),
    readStarterFile('README.md')
  ])
  const packageJson = JSON.parse(packageSource)

  assert.match(getTomlSection(config, 'auth') ?? '', /^enable_signup = true$/m)
  assert.match(getTomlSection(config, 'auth.email') ?? '', /^enable_signup = true$/m)
  assert.match(disabledTest, /SUPABASE_EXPECT_SIGNUP_DISABLED/)
  assert.match(disabledTest, /error\?\.code\)\.toBe\('signup_disabled'\)/)
  assert.match(disabledTest, /data\.user\)\.toBeNull\(\)/)
  assert.match(disabledTest, /data\.session\)\.toBeNull\(\)/)
  assert.match(enabledTest, /data\.user\)\.not\.toBeNull\(\)/)
  assert.match(enabledTest, /data\.session\)\.not\.toBeNull\(\)/)
  assert.match(enabledTest, /auth\.admin\.deleteUser\(data\.user\.id\)/)
  assert.match(packageJson.scripts['test:security:signup-disabled'], /SUPABASE_EXPECT_SIGNUP_DISABLED=true/)
  assert.match(readme, /restore both committed values to `true`/)
  assert.match(readme, /run `npm run test:security` to prove ordinary signup works after restoration/i)
})
