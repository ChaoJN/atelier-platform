import { Hono } from 'hono'
import type { Bindings } from '../types/bindings'
import { getSupabase } from '../db/supabase'

export const categories = new Hono<{ Bindings: Bindings }>()

// GET /api/categories - 讀取所有啟用中的分類
categories.get('/', async (c) => {
  const { data, error } = await getSupabase(c.env)
    .from('categories')
    .select('id, name, slug, seq')
    .eq('is_active', true)
    .order('seq', { nullsFirst: false })
    .order('name')

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true, data })
})
