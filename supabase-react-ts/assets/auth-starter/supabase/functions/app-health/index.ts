import { withSupabase } from 'npm:@supabase/server@1.3.0'
import { createAppHealthHandler } from './handler.ts'

export default {
  fetch: withSupabase({ auth: 'none' }, createAppHealthHandler({
    readEnvironment: () => Deno.env.get('APP_ENVIRONMENT') ?? 'local'
  }))
}
