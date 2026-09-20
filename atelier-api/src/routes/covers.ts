import { Hono } from 'hono'
import type { Bindings } from '../types/bindings'
import { getCachedCovers, setCachedCovers } from '../state/coverCache'

export const covers = new Hono<{ Bindings: Bindings }>()

// GET /api/covers - 讀取目前封面圖片列表（避免前台每次讀取都要打一次 R2 List API）
covers.get('/', async (c) => {
  try {
    const cached = getCachedCovers()
    if (cached) return c.json({ success: true, data: cached })

    const result = await c.env.ASSETS_BUCKET.list({ prefix: 'covers/' })

    const data = result.objects
      .filter((obj) => obj.key !== 'covers/') // 排除資料夾本身的空物件
      .sort((a, b) => a.key.localeCompare(b.key)) // 檔名含時間戳記，可依上傳時間排序
      .map((obj) => `${c.env.R2_PUBLIC_URL}/${obj.key}`)

    setCachedCovers(data)

    return c.json({ success: true, data })
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500)
  }
})
