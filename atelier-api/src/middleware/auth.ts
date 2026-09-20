import type { Context, Next } from 'hono'
import type { User } from '@supabase/supabase-js'
import type { Bindings } from '../types/bindings'
import { getSupabase } from '../db/supabase'

// 掛在 Hono 的 Variables 泛型上，讓 c.set('user', ...) / c.get('user') 有型別檢查，
// 路由檔案要用 c.get('user') 時記得把這個型別也加進自己的 Hono<{ Bindings; Variables }>
export type Variables = {
  user: User
}

type AuthContext = Context<{ Bindings: Bindings; Variables: Variables }>

// 從 "Authorization: Bearer <token>" 這種格式的 header 裡取出 token 本體
function getBearerToken(c: AuthContext) {
  const authHeader = c.req.header('authorization')
  return authHeader?.split(' ')[1]
}

// 驗證用戶身份的 middleware（前台用）
export async function verifyUser(c: AuthContext, next: Next) {
  const token = getBearerToken(c)
  if (!token) {
    return c.json({ success: false, error: '請先登入' }, 401)
  }

  const { data, error } = await getSupabase(c.env).auth.getUser(token)
  if (error || !data.user) {
    return c.json({ success: false, error: 'token 無效或已過期' }, 401)
  }

  c.set('user', data.user)
  await next()
}

// 驗證管理員身份的 middleware（後台用）
export async function verifyAdmin(c: AuthContext, next: Next) {
  const token = getBearerToken(c)
  if (!token) {
    return c.json({ success: false, error: '請先登入' }, 401)
  }

  const { data, error } = await getSupabase(c.env).auth.getUser(token)
  if (error || !data.user) {
    return c.json({ success: false, error: 'token 無效或已過期' }, 401)
  }

  // 權限存在 app_metadata 而不是 user_metadata，因為前者只能由後端（service role）寫入，
  // 使用者自己改不了，才能拿它當作可信的權限來源
  if (data.user.app_metadata?.role !== 'admin') {
    return c.json({ success: false, error: '權限不足' }, 403)
  }

  c.set('user', data.user)
  await next()
}
