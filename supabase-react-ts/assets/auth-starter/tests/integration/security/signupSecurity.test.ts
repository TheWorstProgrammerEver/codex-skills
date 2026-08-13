import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createAdminClient, createAnonymousClient } from './localSupabase'

it('permits public signup when the local backend is enabled', async () => {
  const { data, error } = await createAnonymousClient().auth.signUp({
    email: `enabled-${randomUUID()}@example.test`,
    password: 'Local-security-password-1'
  })

  try {
    expect(error).toBeNull()
    expect(data.user).not.toBeNull()
    expect(data.session).not.toBeNull()
  } finally {
    if (data.user) {
      const { error: cleanupError } = await createAdminClient().auth.admin.deleteUser(data.user.id)
      expect(cleanupError).toBeNull()
    }
  }
})
