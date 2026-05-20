import { createClient, SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import { getConfig } from './config'

// Polyfill necessário para Node.js < 22 (Electron usa Node.js 20)
if (!globalThis.WebSocket) {
  (globalThis as any).WebSocket = ws
}

let _client: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client
  const cfg = getConfig()
  _client = createClient(cfg.supabase_url, cfg.supabase_service_role_key)
  return _client
}
