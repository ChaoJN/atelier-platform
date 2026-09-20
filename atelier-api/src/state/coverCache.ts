// 封面圖片快取，讀(covers.ts)跟寫(upload.ts)分屬不同模組，
// 用這個共用小狀態讓兩邊都能存取同一份快取，寫入後才清得掉
//
// 注意：Cloudflare Workers 同時可能有多個 isolate 在跑，這個快取只在單一 isolate 內有效，
// 不同 isolate 之間不會同步——跟舊版 Node 單一行程比起來精確度較低，但 60 秒 TTL 影響有限
let cache: { data: string[] | null; expiresAt: number } = { data: null, expiresAt: 0 }
const TTL = 60 * 1000 // 60 秒

export function getCachedCovers(): string[] | null {
  if (cache.data && Date.now() < cache.expiresAt) return cache.data
  return null
}

export function setCachedCovers(data: string[]) {
  cache = { data, expiresAt: Date.now() + TTL }
}

export function invalidateCoverCache() {
  cache = { data: null, expiresAt: 0 }
}
