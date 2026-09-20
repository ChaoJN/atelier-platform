import { Hono } from 'hono'
import type { Bindings } from '../types/bindings'
import { getSupabase } from '../db/supabase'
import { verifyUser, type Variables } from '../middleware/auth'
import { sendOrderMail } from '../services/email'

// TODO: 加上防超賣的庫存檢查/扣減邏輯（舊版 server.js 也尚未實作，非此次遷移範圍）
// Bindings: 這個 Hono app 的環境變數類型，會在 c.env 上使用
// Variables: 這個 Hono app 的執行期資料類型，會在 c.get()/c.set() 上使用
export const checkout = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// 在這個模組所有路徑('*')上,先掛一層 verifyUser middleware
checkout.use('*', verifyUser)

// 隨機生成訂單編號的函式，格式為 ORD-YYYYMMDD-XXXXXX
function generateOrderNo() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).slice(2, 8).toUpperCase() // toString(36) 轉成 36 進位
  return `ORD-${dateStr}-${random}`
}

// POST /api/orders - 建立訂單（需登入）
checkout.post('/', async (c) => {
  try {
    const user = c.get('user')
    const {
      order_amount,
      pay_amount,
      coupon_code,
      discount_amount,
      delivery_fee,
      order_items,
      payment_method,
      recipient_name,
      recipient_phone,
      delivery_method,
      delivery_info,
      remark,
    } = await c.req.json()

    const { data, error } = await getSupabase(c.env)
      .from('orders')
      .insert([
        {
          member_id: user.id, // 從 token 取得，前端無法偽造
          order_no: generateOrderNo(), // 後端自動產生，前端無法控制
          order_amount,
          pay_amount,
          coupon_code,
          discount_amount,
          delivery_fee,
          order_items,
          payment_method,
          recipient_name,
          recipient_phone,
          delivery_method,
          delivery_info,
          remark,
          status_history: [{ status: 'pending', changed_at: new Date().toISOString() }],
        },
      ])
      .select()

    if (error) throw error

    // 寄送訂單確認信（非同步，不影響回應速度）——用 waitUntil 交給 Workers 執行環境，
    // 不然回應送出後這個請求的 context 可能被直接回收，寄信的 fetch 還沒完成就被砍斷，信永遠寄不出去
    c.executionCtx.waitUntil(
      sendOrderMail(c.env, { ...data[0], member_email: user.email! }).catch((err) =>
        console.error('寄信失敗：', (err as Error).message)
      )
    )

    return c.json({ success: true, message: '訂單建立成功', data }, 201)
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 400)
  }
})

// GET /api/orders/me - 查看自己的訂單（需登入）
checkout.get('/me', async (c) => {
  try {
    const user = c.get('user')
    const { data, error } = await getSupabase(c.env)
      .from('orders')
      .select('*')
      .eq('member_id', user.id) // 只查自己的訂單
      .order('created_at', { ascending: false })

    if (error) throw error

    return c.json({ success: true, count: data.length, data })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500)
  }
})

// PATCH /api/orders/:id/payment-account - 填寫匯款帳號末五碼
checkout.patch('/:id/payment-account', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const { payment_account_info } = await c.req.json()

  if (!payment_account_info) return c.json({ error: '請提供帳號資訊' }, 400)

  const { error } = await getSupabase(c.env)
    .from('orders')
    .update({ payment_account_info })
    .eq('id', id)
    .eq('member_id', user.id) // 只能更新自己的訂單

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true })
})
