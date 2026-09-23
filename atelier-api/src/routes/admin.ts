import { Hono } from 'hono'
import type { Bindings } from '../types/bindings'
import type { OrderStatus } from '@atelier/types'
import { getSupabase } from '../db/supabase'
import { verifyAdmin, type Variables } from '../middleware/auth'

export const admin = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// 舊版 backend 是每支路由各自掛一次 verifyAdmin，這裡統一在頂層用 '*' 掛一次，
// 因為 server.js 裡 /api/admin/* 下面所有端點無一例外都要求管理員權限
// .use() 是 Hono 用來掛載 middleware 的方法,語法是:app.use(path, middlewareFn)
// '*':路徑萬用字元,代表「掛在 admin 這個路由模組底下的所有路徑」
admin.use('*', verifyAdmin)

// GET /api/admin/members - 查看所有會員
admin.get('/members', async (c) => {
  try {
    const { data, error } = await getSupabase(c.env)
      .from('members')
      .select('id, name, phone, email, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    return c.json({ success: true, data })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500)
  }
})

// GET /api/admin/orders - 查看所有訂單（需管理員）
admin.get('/orders', async (c) => {
  try {
    const { member_id } = c.req.query()

    let query = getSupabase(c.env)
      .from('orders')
      .select('*, members!member_id(name, email)')
      .order('created_at', { ascending: false })

    if (member_id) query = query.eq('member_id', member_id)

    const { data, error } = await query
    if (error) throw error

    // 將 members.name 攤平到 order 物件上
    const orders = data.map((o) => ({
      ...o,
      member_name: o.members?.name ?? null,
      member_email: o.members?.email ?? null,
    }))
    return c.json({ success: true, count: orders.length, data: orders })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500)
  }
})

// PATCH /api/admin/orders/:id/status - 更新訂單狀態
admin.patch('/orders/:id/status', async (c) => {
  const { id } = c.req.param()
  const { status } = await c.req.json()

  const validStatuses: OrderStatus[] = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']
  if (!validStatuses.includes(status)) {
    return c.json({ error: '無效的狀態值' }, 400)
  }

  // 取出現有 status_history
  const { data: order, error: fetchError } = await getSupabase(c.env)
    .from('orders')
    .select('status_history')
    .eq('id', id)
    .single()

  if (fetchError) return c.json({ error: fetchError.message }, 500)

  const history = [...(order.status_history ?? []), { status, changed_at: new Date().toISOString() }]

  const { error } = await getSupabase(c.env)
    .from('orders')
    .update({ status, status_history: history, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true })
})

// GET /api/admin/dashboard-stats - 總覽數據
admin.get('/dashboard-stats', async (c) => {
  try {
    const now = new Date()
    const taiwanNow = new Date(now.getTime() + 8 * 60 * 60 * 1000)
    const todayStr = taiwanNow.toISOString().slice(0, 10)
    const todayStart = new Date(todayStr + 'T00:00:00+08:00').toISOString()
    const todayEnd = new Date(todayStr + 'T23:59:59.999+08:00').toISOString()

    const supabase = getSupabase(c.env)
    const [todayRes, pendingPayRes, pendingRecRes, shipRes] = await Promise.all([
      // 今日訂單
      supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', todayStart).lte('created_at', todayEnd),
      // 待付款：pending 且未提交匯款帳號
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .or('payment_method.neq.transfer,payment_account_info.is.null'),
      // 待對帳：pending + 已提交匯款帳號
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('payment_method', 'transfer')
        .not('payment_account_info', 'is', null),
      // 待出貨：paid 或 processing
      supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['paid', 'processing']),
    ])

    return c.json({
      success: true,
      todayOrders: todayRes.count ?? 0,
      pendingPayment: pendingPayRes.count ?? 0,
      pendingReconcile: pendingRecRes.count ?? 0,
      pendingShipment: shipRes.count ?? 0,
    })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500)
  }
})

// GET /api/admin/procurement - 撈全部採購紀錄
admin.get('/procurement', async (c) => {
  try {
    const { data, error } = await getSupabase(c.env).from('purchase_records').select('product_id, color, size, purchase_quantity')
    if (error) throw error
    return c.json({ success: true, data })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500)
  }
})

// PUT /api/admin/procurement - 新增或更新採購數量
admin.put('/procurement', async (c) => {
  try {
    const { product_id, color, size, purchase_quantity } = await c.req.json()
    if (!product_id || purchase_quantity == null) return c.json({ error: '缺少必要欄位' }, 400)
    const { error } = await getSupabase(c.env)
      .from('purchase_records')
      .upsert(
        { product_id, color: color ?? '', size: size ?? '', purchase_quantity, updated_at: new Date().toISOString() },
        { onConflict: 'product_id,color,size' }
      )
    if (error) throw error
    return c.json({ success: true })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500)
  }
})

// DELETE /api/admin/procurement - 重置全部採購紀錄
admin.delete('/procurement', async (c) => {
  try {
    const { error } = await getSupabase(c.env).from('purchase_records').delete().neq('id', 0)
    if (error) throw error
    return c.json({ success: true })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500)
  }
})

// GET /api/admin/categories - 讀取分類（可透過 is_active 篩選）
admin.get('/categories', async (c) => {
  const { is_active } = c.req.query()

  let query = getSupabase(c.env)
    .from('categories')
    .select('id, name, slug, seq, is_active')
    .order('seq', { nullsFirst: false })
    .order('name')

  if (is_active !== undefined) {
    query = query.eq('is_active', is_active === 'true')
  }

  const { data, error } = await query
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true, data })
})

// POST /api/admin/categories - 新增分類
admin.post('/categories', async (c) => {
  const { name, slug: rawSlug, is_active } = await c.req.json()
  if (!name?.trim()) return c.json({ error: '分類名稱為必填' }, 400)
  const slug =
    (rawSlug ?? name)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '') || `cat-${Date.now()}`

  const { data: maxRow } = await getSupabase(c.env)
    .from('categories')
    .select('seq')
    .order('seq', { ascending: false })
    .limit(1)
    .single()
  const seq = (maxRow?.seq ?? 0) + 5

  const { data, error } = await getSupabase(c.env)
    .from('categories')
    .insert({ name: name.trim(), slug, is_active: is_active ?? true, seq })
    .select()
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true, data })
})

// PUT /api/admin/categories/:id - 更新分類
admin.put('/categories/:id', async (c) => {
  const { id } = c.req.param()
  const { name, slug, is_active, seq } = await c.req.json()
  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name.trim()
  if (slug !== undefined) updates.slug = slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
  if (is_active !== undefined) updates.is_active = is_active
  if (seq !== undefined) updates.seq = seq

  const { data, error } = await getSupabase(c.env).from('categories').update(updates).eq('id', id).select().single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true, data })
})

// DELETE /api/admin/categories/:id - 刪除分類
admin.delete('/categories/:id', async (c) => {
  const { id } = c.req.param()
  const { error } = await getSupabase(c.env).from('categories').delete().eq('id', id)
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true })
})

// GET /api/admin/products - 讀取所有商品（含下架）
admin.get('/products', async (c) => {
  try {
    const { category, keyword, is_active } = c.req.query()

    // 後台是自己人在用，商品量不會多到影響效能，故意不分頁、一次撈全部，
    // 不用像前台那樣做「載入更多」，維護起來比較單純
    let query = getSupabase(c.env)
      .from('products')
      .select('*, product_variants(*)')
      .order('id', { ascending: false }) // 新到舊，由上至下
      .order('id', { ascending: false, referencedTable: 'product_variants' }) // 規格新到舊，顏色色塊第一個顯示最新顏色

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true')
    }

    if (category) {
      query = query.contains('category', [Number(category)])
    }

    if (keyword) {
      query = query.ilike('product_name', `%${keyword}%`)
    }

    const { data, error } = await query
    if (error) throw error

    return c.json({ success: true, count: data.length, data })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500)
  }
})

// GET /api/admin/products/:id - 讀取單一商品（含下架）
admin.get('/products/:id', async (c) => {
  try {
    const { id } = c.req.param()

    const { data, error } = await getSupabase(c.env)
      .from('products')
      .select('*, product_variants(*)')
      .eq('id', id)
      .order('id', { ascending: false, referencedTable: 'product_variants' }) // 規格新到舊，顏色色塊第一個顯示最新顏色
      .single()

    if (error) throw error

    return c.json({ success: true, data })
  } catch {
    return c.json({ success: false, error: '找不到此商品' }, 404)
  }
})

// POST /api/admin/products - 新增商品
admin.post('/products', async (c) => {
  try {
    const insert = await c.req.json() // 從 body 拿要新增的欄位
    const { data, error } = await getSupabase(c.env)
      .from('products')
      .insert(insert)
      .select()
      .single()

    if (error) throw error

    return c.json({ success: true, message: '商品新增成功', data }, 201)
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 400)
  }
})

// PUT /api/admin/products/:id - 更新商品
admin.put('/products/:id', async (c) => {
  try {
    const { id } = c.req.param() // 從網址拿 id
    const updates = await c.req.json() // 從 body 拿要更新的欄位

    const { data, error } = await getSupabase(c.env)
      .from('products')
      .update(updates) // 傳入要更新的欄位
      .eq('id', id)
      .select()

    if (error) throw error

    return c.json({ success: true, message: '商品修改成功', data })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 400)
  }
})

// DELETE /api/admin/products/:id - 刪除商品
admin.delete('/products/:id', async (c) => {
  try {
    const { id } = c.req.param()

    const { error } = await getSupabase(c.env)
      .from('products')
      .delete()
      .eq('id', id)

    if (error) throw error

    return c.json({ success: true, message: '商品刪除成功' })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 400)
  }
})

// POST /api/admin/products/:id/variants - 新增商品規格
admin.post('/products/:id/variants', async (c) => {
  const { id } = c.req.param()
  const { color, color_code, size, is_available } = await c.req.json()

  const { data, error } = await getSupabase(c.env)
    .from('product_variants')
    .insert([{ product_id: id, color, color_code, size, is_available, created_at: new Date().toISOString() }])
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 400)
  return c.json({ success: true, data }, 201)
})

// PUT /api/admin/products/:id/variants/:variantId - 更新商品規格
admin.put('/products/:id/variants/:variantId', async (c) => {
  const { id, variantId } = c.req.param()
  const { color, color_code, size, is_available } = await c.req.json()

  const { data, error } = await getSupabase(c.env)
    .from('product_variants')
    .update({ color, color_code, size, is_available, updated_at: new Date().toISOString() })
    .eq('id', variantId)
    .eq('product_id', id)
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 400)
  return c.json({ success: true, data })
})

// DELETE /api/admin/products/:id/variants/:variantId - 刪除商品規格
admin.delete('/products/:id/variants/:variantId', async (c) => {
  const { id, variantId } = c.req.param()
  const { error } = await getSupabase(c.env)
    .from('product_variants')
    .delete()
    .eq('id', variantId)
    .eq('product_id', id)

  if (error) return c.json({ error: error.message }, 400)
  return c.json({ success: true, message: '規格已刪除' })
})
