import { createClient, SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import { getConfig } from './config'

let _client: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client
  const cfg = getConfig()
  _client = createClient(cfg.supabase_url, cfg.supabase_service_role_key, {
    realtime: { transport: ws as any },
  })
  return _client
}
