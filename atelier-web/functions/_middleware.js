// Cloudflare Pages Function：只給「不會執行 JS」的社群爬蟲用（Facebook/LINE/Slack 等分享連結時的預覽機器人）。
// 一般使用者的請求完全不受影響，直接 next() 交給 Pages 正常放行給 SPA。
//
// 原因：router/index.ts 裡換頁動態寫入的 OG 標籤，爬蟲抓不到（它們大多不執行 JS，
// 只讀伺服器回應的原始 HTML），所以要在這裡攔截、現組一份帶正確 OG 標籤的極簡 HTML 回傳。

const BOT_UA_REGEX =
  /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|WhatsApp|Pinterest|Line\//i

const SITE_NAME = 'Rainstopha Select'
const DEFAULT_DESCRIPTION = 'FIND YOUR OWN VIBE'
const DEFAULT_API_BASE = 'https://api.rainstopha-select.com'
const FALLBACK_IMAGE_PATH = '/assets/cover.jpg'

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
}

function renderHtml({ title, description, image, url, type }) {
  return `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:type" content="${escapeHtml(type)}" />
<meta name="description" content="${escapeHtml(description)}" />
</head>
<body></body>
</html>`
}

export async function onRequest(context) {
  const { request, next, env } = context
  const ua = request.headers.get('User-Agent') ?? ''

  // 不是已知的爬蟲 → 完全不處理，正常交給 Pages 放行給 SPA
  if (!BOT_UA_REGEX.test(ua)) {
    return next()
  }

  const url = new URL(request.url)
  const apiBase = (env && env.VITE_API_BASE_URL) || DEFAULT_API_BASE
  const fallbackImage = `${url.origin}${FALLBACK_IMAGE_PATH}`
  const productMatch = url.pathname.match(/^\/product\/(\d+)$/)

  try {
    if (productMatch) {
      const id = productMatch[1]
      const res = await fetch(`${apiBase}/api/products/${id}`)
      const json = await res.json()
      if (json.success && json.data) {
        const p = json.data
        const cleanDescription = (p.description || DEFAULT_DESCRIPTION)
          .replace(/\s+/g, ' ') // 商品描述常常有換行/多個空白，摘要要是乾淨的一行
          .trim()
          .slice(0, 100)
        return new Response(
          renderHtml({
            title: p.product_name,
            description: cleanDescription,
            image: (p.image_urls && p.image_urls[0]) || fallbackImage,
            url: url.toString(),
            type: 'product',
          }),
          { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
        )
      }
      // 查無此商品（例如已刪除/下架）就往下走，用一般頁面的封面圖版本頂著
    }

    // 首頁跟其他所有頁面：用目前的封面圖（跟首頁輪播抓的是同一支 API）
    const coversRes = await fetch(`${apiBase}/api/covers`)
    const coversJson = await coversRes.json()
    const coverImage = (coversJson.success && coversJson.data && coversJson.data[0]) || fallbackImage

    return new Response(
      renderHtml({
        title: SITE_NAME,
        description: DEFAULT_DESCRIPTION,
        image: coverImage,
        url: url.toString(),
        type: 'website',
      }),
      { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
    )
  } catch {
    // API 打不到就放行給 SPA，讓 index.html 裡寫死的預設 OG 標籤頂著，總比整個請求出錯好
    return next()
  }
}
