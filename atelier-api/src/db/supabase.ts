import { createClient } from '@supabase/supabase-js'
import type { Bindings } from '../types/bindings'

// Workers 沒有 process.env，環境變數要從每次請求帶入的 c.env 讀取，
// 所以這裡做成工廠函式，而不是像舊版 backend 那樣建立單一全域的 client。
export function getSupabase(env: Bindings) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false, // 後端用 service role key，不需要自動更新 token
      persistSession: false, // Workers 是無狀態的，沒有地方可以存 session
    },
  })
}
