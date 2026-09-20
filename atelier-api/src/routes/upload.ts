import { Hono } from 'hono'
import type { Bindings } from '../types/bindings'
import { verifyAdmin, type Variables } from '../middleware/auth'
import { invalidateCoverCache } from '../state/coverCache'

export const upload = new Hono<{ Bindings: Bindings; Variables: Variables }>()

upload.use('*', verifyAdmin)

// 從 R2 公開網址取出物件 key
function r2KeyFromUrl(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  } catch {
    return null
  }
}

function extFromContentType(type: string) {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
}

// POST /api/upload/products/:id/images - 上傳圖片到 Cloudflare R2
upload.post('/products/:id/images', async (c) => {
  const { id } = c.req.param() // 前端傳來的圖片欄位名稱是 image
  const body = await c.req.parseBody()
  const file = body['image']
  if (!file || typeof file === 'string') return c.json({ error: '請提供圖片檔案' }, 400)

  const ext = extFromContentType(file.type)
  const fileName = `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  try {
    await c.env.ASSETS_BUCKET.put(fileName, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || 'image/jpeg' },
    })
    return c.json({ success: true, url: `${c.env.R2_PUBLIC_URL}/${fileName}` })
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500)
  }
})

// DELETE /api/upload/products/:id/images - 從 Cloudflare R2 刪除圖片
upload.delete('/products/:id/images', async (c) => {
  const { url } = await c.req.json()
  if (!url) return c.json({ error: '請提供圖片 URL' }, 400)

  const key = r2KeyFromUrl(url)
  if (!key) return c.json({ error: '無效的圖片 URL' }, 400)

  try {
    await c.env.ASSETS_BUCKET.delete(key)
    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500)
  }
})

// POST /api/upload/covers - 上傳封面圖片到 Cloudflare R2
upload.post('/covers', async (c) => {
  const body = await c.req.parseBody()
  const file = body['image']
  if (!file || typeof file === 'string') return c.json({ error: '請提供圖片檔案' }, 400)

  const ext = extFromContentType(file.type)
  const fileName = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  try {
    await c.env.ASSETS_BUCKET.put(fileName, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || 'image/jpeg' },
    })
    invalidateCoverCache() // 清快取，讓下次讀取拿到最新清單
    return c.json({ success: true, url: `${c.env.R2_PUBLIC_URL}/${fileName}` })
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500)
  }
})

// DELETE /api/upload/covers - 從 Cloudflare R2 刪除封面圖片
upload.delete('/covers', async (c) => {
  const { url } = await c.req.json()
  if (!url) return c.json({ error: '請提供圖片 URL' }, 400)

  const key = r2KeyFromUrl(url)
  if (!key) return c.json({ error: '無效的圖片 URL' }, 400)

  try {
    await c.env.ASSETS_BUCKET.delete(key)
    invalidateCoverCache() // 清快取
    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500)
  }
})
