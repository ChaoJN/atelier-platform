import { Hono } from 'hono'
import type { Bindings } from '../types/bindings'
import { getSupabase } from '../db/supabase'

export const products = new Hono<{ Bindings: Bindings }>()

// 商品圖片上傳/刪除改放在 routes/upload.ts（掛在 /api/upload 底下），
// 跟其他 R2 相關的寫入操作（封面圖片）放在一起管理

// GET /api/products - 讀取所有上架商品
products.get('/', async (c) => {
  try {
    const { page = '1', limit = '20', category, keyword } = c.req.query()

    let query = getSupabase(c.env)
      .from('products')
      // 明確列欄位，故意不選 cost_price（成本價），前台公開端點不能洩漏成本資訊
      .select(
        'id, created_at, updated_at, product_name, category, description, price, is_discount, discount_rate, image_urls, size_chart, fitting_chart, product_code, is_active, product_variants(*)'
      )
      .eq('is_active', true) // 前台固定只顯示上架商品
      .order('updated_at', { ascending: false }) // 有更新的商品優先
      .order('created_at', { ascending: false }) // 最新商品優先

    if (category) {
      query = query.contains('category', [Number(category)])
    }

    if (keyword) {
      query = query.ilike('product_name', `%${keyword}%`)
    }

    const from = (Number(page) - 1) * Number(limit)
    const to = from + Number(limit) - 1
    query = query.range(from, to)

    const { data, error } = await query
    if (error) throw error

    return c.json({ success: true, count: data.length, data })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500)
  }
})

// GET /api/products/:id - 讀取單一上架商品
products.get('/:id', async (c) => {
  try {
    const { id } = c.req.param()

    const { data, error } = await getSupabase(c.env)
      .from('products')
      // 明確列欄位，故意不選 cost_price（成本價），前台公開端點不能洩漏成本資訊
      .select(
        'id, created_at, updated_at, product_name, category, description, price, is_discount, discount_rate, image_urls, size_chart, fitting_chart, product_code, is_active, product_variants(*)'
      )
      .eq('id', id)
      .eq('is_active', true) // 防止用戶透過 id 直接存取下架商品
      .single()

    if (error) throw error

    return c.json({ success: true, data })
  } catch {
    return c.json({ success: false, error: '找不到此商品' }, 404)
  }
})

// GET /api/products/:id/variants - 讀取商品所有規格
products.get('/:id/variants', async (c) => {
  const { id } = c.req.param()
  const { data, error } = await getSupabase(c.env)
    .from('product_variants')
    .select('*')
    .eq('product_id', id)
    .order('color')

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true, data })
})
