import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createAnonymousClient } from './localSupabase'

const expectSignupDisabled = process.env.SUPABASE_EXPECT_SIGNUP_DISABLED === 'true'

describe.runIf(expectSignupDisabled)('backend-disabled public signup', () => {
  it('rejects a direct signup without creating a user or session', async () => {
    const { data, error } = await createAnonymousClient().auth.signUp({
      email: `disabled-${randomUUID()}@example.test`,
      password: 'Local-security-password-1'
    })

    expect(error?.code).toBe('signup_disabled')
    expect(data.user).toBeNull()
    expect(data.session).toBeNull()
  })
})
