import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2.110.0'

export type AppInvocationContext = {
  client: SupabaseClient
  user: User
}
