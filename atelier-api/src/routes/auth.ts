import { Hono } from 'hono'
import type { Bindings } from '../types/bindings'
import { getSupabase } from '../db/supabase'

export const auth = new Hono<{ Bindings: Bindings }>()

// Supabase 對同一信箱短時間內重複發送 OTP 會擋下來，錯誤訊息長這樣：
// "For security purposes, you can only request this after 45 seconds."
// 這裡只把秒數抽出來，換成中文提示；注意 admin-send-otp 故意不套用這個轉換，
// 因為那支 API 全部錯誤都要回同一句模糊訊息，不能讓「限流」跟「帳號不存在」被分辨出差異
function friendlyRateLimitMessage(message: string): string {
  const match = message.match(/after (\d+) seconds?/i)
  if (!match) return message
  return `該信箱已傳送過驗證碼，${match[1]} 秒後可再次點擊獲取`
}

// POST /api/auth/member-send-otp - 前台會員發送 OTP（允許註冊）
auth.post('/member-send-otp', async (c) => {
  const { email } = await c.req.json()

  const { error } = await getSupabase(c.env).auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  })

  if (error) return c.json({ error: friendlyRateLimitMessage(error.message) }, 400)
  return c.json({ message: '一般會員驗證碼已發送！' })
})

// POST /api/auth/admin-send-otp - 後台管理員發送 OTP（禁止註冊）
auth.post('/admin-send-otp', async (c) => {
  const { email } = await c.req.json()

  const { error } = await getSupabase(c.env).auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false, // 資料庫沒有此 email 就直接拒絕，不發信
    },
  })

  if (error) {
    // 回傳模糊訊息，避免駭客探測管理員帳號
    return c.json({ error: '認證失敗，請檢查帳號權限。' }, 400)
  }
  return c.json({ message: '管理員驗證碼已發送！' })
})

// POST /api/auth/verify-otp - 驗證 OTP 並登入
auth.post('/verify-otp', async (c) => {
  const { email, token } = await c.req.json() // token 是 otp 驗證碼

  const { data, error } = await getSupabase(c.env).auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error || !data.session) {
    return c.json({ error: '驗證碼錯誤或已過期' }, 400)
  }

  const user = data.session.user
  const accessToken = data.session.access_token

  // 檢查權限是否為管理員
  const isAdmin = user.app_metadata?.role === 'admin'

  return c.json({
    message: '登入成功',
    token: accessToken,
    user: {
      email: user.email,
      isAdmin,
      name: user.user_metadata?.display_name ?? null,
    },
  })
})
