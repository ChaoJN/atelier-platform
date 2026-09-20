import { Hono } from 'hono'
import type { Bindings } from '../types/bindings'
import { verifyUser, type Variables } from '../middleware/auth'

export const members = new Hono<{ Bindings: Bindings; Variables: Variables }>()

members.use('*', verifyUser)

// GET /api/members/me - 取得目前登入會員資料
members.get('/me', (c) => {
  const { id, email, user_metadata, created_at } = c.get('user')
  return c.json({
    success: true,
    data: {
      id,
      email,
      display_name: user_metadata?.display_name ?? null,
      created_at,
    },
  })
})

// POST /api/members/me - 新用戶儲存 display_name，透過 trigger 同步到 members
members.post('/me', async (c) => {
  const { display_name } = await c.req.json()
  if (!display_name) return c.json({ error: '請提供名稱' }, 400)

  // verifyUser 已經驗證過這個 token，這裡直接複用它去打 Supabase Auth REST API
  const userToken = c.req.header('authorization')!.split(' ')[1]
  const resp = await fetch(`${c.env.SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
      apikey: c.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ data: { display_name } }),
  })

  if (!resp.ok) {
    const err = (await resp.json()) as { message?: string }
    return c.json({ error: err.message || '儲存失敗' }, 500)
  }

  return c.json({ success: true, message: '名稱已儲存' })
})
