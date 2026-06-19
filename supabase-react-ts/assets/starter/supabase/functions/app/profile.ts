import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2'
import { nameFromEmail, normalizeEmail, todayIso } from './helpers.ts'
import type { ProfileRow } from './types/rows.ts'

const metadataName = (user: User) => {
  const displayName = user.user_metadata?.display_name

  return typeof displayName === 'string' ? displayName.trim() : ''
}

export const getProfile = async (client: SupabaseClient, user: User) => {
  const email = normalizeEmail(user.email ?? '')
  const displayName = metadataName(user) || nameFromEmail(email)
  const { data: existingProfile, error: profileError } = await client
    .from('profiles')
    .select('id, email, display_name, created_date')
    .eq('id', user.id)
    .maybeSingle<ProfileRow>()

  if (profileError) {
    throw profileError
  }

  if (existingProfile) {
    return existingProfile
  }

  const profile: ProfileRow = {
    id: user.id,
    email,
    display_name: displayName,
    created_date: todayIso()
  }
  const { error } = await client
    .from('profiles')
    .insert(profile)

  if (error) {
    throw error
  }

  return profile
}
