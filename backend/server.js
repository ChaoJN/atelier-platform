// 1. 引入必要套件
require('dotenv').config(); // 載入 .env 裡面的環境變數
const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
const { cors } = require('hono/cors');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

// 2. 初始化 Hono 應用程式
const app = new Hono();
const port = process.env.PORT || 3000;

// 3. 初始化 Supabase 客戶端
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,  // 不自動更新 token
            persistSession: false  // 不儲存 session
        }
    }
);

// 4. 初始化 Cloudflare R2 客戶端（S3 相容 API，用於商品圖片存放）
const r2 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
});
const R2_BUCKET = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');

// 封面圖片快取（避免前台每次讀取都要打一次 R2 List API）
let coverImagesCache = { data: null, expiresAt: 0 }
const COVER_CACHE_TTL = 60 * 1000 // 60 秒

// 從 R2 公開網址取出物件 key
function r2KeyFromUrl(url) {
    try {
        return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
    } catch {
        return null;
    }
}

// 5. 初始化 Nodemailer
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,  // TLS
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
})

async function sendOrderMail(order) {
    const itemsHtml = (order.order_items ?? []).map(item =>
        `<tr>
            <td style="padding:6px 0;">${item.productName}</td>
            <td style="padding:6px 0;">${[item.color, item.size].filter(Boolean).join(' / ') || '—'}</td>
            <td style="padding:6px 0; text-align:right;">NT$ ${item.price} × ${item.quantity}</td>
        </tr>`
    ).join('')

    const html = `
        <h2 style="margin-bottom:16px;">訂單確認</h2>
        <p>感謝您的訂購！以下是您的訂單資訊：</p>
        <br>
        <p><strong>訂單編號：</strong>${order.order_no}</p>
        <p><strong>訂單日期：</strong>${new Date(order.created_at).toLocaleDateString('zh-TW')}</p>
        <br>
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <thead>
                <tr style="border-bottom:1px solid #eee;">
                    <th style="text-align:left; padding:6px 0;">商品</th>
                    <th style="text-align:left; padding:6px 0;">規格</th>
                    <th style="text-align:right; padding:6px 0;">金額</th>
                </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
        </table>
        <br>
        <p><strong>實付金額：</strong>NT$ ${order.pay_amount.toLocaleString()}</p>
        <p><strong>付款方式：</strong>${order.payment_method === 'transfer' ? '銀行轉帳' : order.payment_method}</p>
        ${order.payment_method === 'transfer' ? `
        <br>
        <div style="background:#f9f9f9; border-radius:6px; padding:14px 16px; font-size:14px; line-height:1.8;">
            <strong>匯款資訊</strong><br>
            銀行：(013) 國泰世華銀行<br>
            帳號：<strong>012-3456-7890123</strong><br>
            戶名：Take a Breath 有限公司<br>
            <span style="color:#888; font-size:13px;">請於 3 天內完成匯款，並在訂單頁面填寫帳號末五碼以供核對。</span>
        </div>` : ''}
        <br>
        <p style="color:#888; font-size:13px;">如有任何問題，請回覆此信聯絡我們。</p>
    `

    await transporter.sendMail({
        from: `"Take a Breath" <${process.env.GMAIL_USER}>`,
        to: order.member_email,
        subject: `【Take a Breath】訂單確認 ${order.order_no}`,
        html
    })
}

// 6. 設定 Middleware (中介軟體)
app.use('*', cors())


// ==========================================
// API 路由設定
// ==========================================

// [測試路由] 確認伺服器健康狀況
app.get('/', (c) => {
    return c.text('Take a Breath API 伺服器正在深呼吸... 🌱 (運行中)');
});

// ==========================================
// [前台] POST /api/auth/member-send-otp - 前台會員發送 OTP（允許註冊）
// ==========================================
app.post('/api/auth/member-send-otp', async (c) => {
    const { email } = await c.req.json()

    const { error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
            shouldCreateUser: true
        }
    })

    if (error) return c.json({ error: error.message }, 400)
    return c.json({ message: '一般會員驗證碼已發送！' })
})

// ==========================================
// [後台] POST /api/auth/admin-send-otp - 後台管理員發送 OTP（禁止註冊）
// ==========================================
app.post('/api/auth/admin-send-otp', async (c) => {
    const { email } = await c.req.json()

    const { error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
            shouldCreateUser: false  // 資料庫沒有此 email 就直接拒絕，不發信
        }
    })

    if (error) {
        // 回傳模糊訊息，避免駭客探測管理員帳號
        return c.json({ error: '認證失敗，請檢查帳號權限。' }, 400)
    }
    return c.json({ message: '管理員驗證碼已發送！' })
})

// ==========================================
// [前後台] POST /api/auth/verify-otp - 驗證 OTP 並登入
// ==========================================
app.post('/api/auth/verify-otp', async (c) => {
    const { email, token } = await c.req.json() // token 是 otp驗證碼

    const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email'
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
            isAdmin: isAdmin,
            name: user.user_metadata?.display_name ?? null
        }
    })
})


// ==========================================
// 驗證用戶身份的 middleware（前台用）
// ==========================================
async function verifyUser(c, next) {
    const authHeader = c.req.header('authorization')
    const token = authHeader && authHeader.split(' ')[1]  // 取出 Bearer 後面的 token

    if (!token) {
        return c.json({ success: false, error: '請先登入' }, 401)
    }

    // 用 token 向 Supabase 驗證並取得用戶資料
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
        return c.json({ success: false, error: 'token 無效或已過期' }, 401)
    }

    c.set('user', data.user)  // 把用戶資料掛在 context 上，後面路由可以直接用
    await next() // 放行，繼續執行路由
}

// ==========================================
// 驗證管理員身份的 middleware（後台用）
// ==========================================
async function verifyAdmin(c, next) {
    const authHeader = c.req.header('authorization')
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
        return c.json({ success: false, error: '請先登入' }, 401)
    }

    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
        return c.json({ success: false, error: 'token 無效或已過期' }, 401)
    }

    // 從 app_metadata 確認是否為管理員
    if (data.user.app_metadata?.role !== 'admin') {
        return c.json({ success: false, error: '權限不足' }, 403)
    }

    c.set('user', data.user)
    await next() // 放行，繼續執行路由
}

// ==========================================
// [前台] GET /api/members/me - 取得目前登入會員資料
// ==========================================
app.get('/api/members/me', verifyUser, (c) => {
    const { id, email, user_metadata, created_at } = c.get('user')
    return c.json({
        success: true,
        data: {
            id,
            email,
            display_name: user_metadata?.display_name ?? null,
            created_at
        }
    })
})

// ==========================================
// [前台] POST /api/members/me - 新用戶儲存 display_name，透過 trigger 同步到 members
// ==========================================
app.post('/api/members/me', verifyUser, async (c) => {
    const { display_name } = await c.req.json()

    if (!display_name) return c.json({ error: '請提供名稱' }, 400)

    const userToken = c.req.header('authorization').split(' ')[1]
    const resp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`,
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY
        },
        body: JSON.stringify({ data: { display_name } })
    })

    if (!resp.ok) {
        const err = await resp.json()
        return c.json({ error: err.message || '儲存失敗' }, 500)
    }

    return c.json({ success: true, message: '名稱已儲存' })
})

// ==========================================
// [前台] GET /api/categories - 讀取所有啟用中的分類
// ==========================================
app.get('/api/categories', async (c) => {
    const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, seq')
        .eq('is_active', true)
        .order('seq', { nullsFirst: false })
        .order('name')

    if (error) return c.json({ error: error.message }, 500)
    return c.json({ success: true, data })
})

// ==========================================
// [後台] GET /api/admin/categories - 讀取分類（可透過 is_active 篩選）
// ==========================================
app.get('/api/admin/categories', verifyAdmin, async (c) => {
    const { is_active } = c.req.query()

    let query = supabase
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

// ==========================================
// [後台] POST /api/admin/categories - 新增分類
// ==========================================
app.post('/api/admin/categories', verifyAdmin, async (c) => {
    const { name, slug: rawSlug, is_active } = await c.req.json()
    if (!name?.trim()) return c.json({ error: '分類名稱為必填' }, 400)
    const slug = (rawSlug ?? name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') || `cat-${Date.now()}`

    const { data: maxRow } = await supabase
        .from('categories').select('seq').order('seq', { ascending: false }).limit(1).single()
    const seq = (maxRow?.seq ?? 0) + 5

    const { data, error } = await supabase
        .from('categories')
        .insert({ name: name.trim(), slug, is_active: is_active ?? true, seq })
        .select().single()
    if (error) return c.json({ error: error.message }, 500)
    return c.json({ success: true, data })
})

// ==========================================
// [後台] PUT /api/admin/categories/:id - 更新分類
// ==========================================
app.put('/api/admin/categories/:id', verifyAdmin, async (c) => {
    const { id } = c.req.param()
    const { name, slug, is_active, seq } = await c.req.json()
    const updates = {}
    if (name !== undefined)      updates.name      = name.trim()
    if (slug !== undefined)      updates.slug      = slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
    if (is_active !== undefined) updates.is_active = is_active
    if (seq !== undefined)       updates.seq       = seq
    const { data, error } = await supabase
        .from('categories').update(updates).eq('id', id).select().single()
    if (error) return c.json({ error: error.message }, 500)
    return c.json({ success: true, data })
})

// ==========================================
// [後台] DELETE /api/admin/categories/:id - 刪除分類
// ==========================================
app.delete('/api/admin/categories/:id', verifyAdmin, async (c) => {
    const { id } = c.req.param()
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) return c.json({ error: error.message }, 500)
    return c.json({ success: true })
})

// ==========================================
// [前台] GET /api/products - 讀取所有上架商品
// ==========================================
app.get('/api/products', async (c) => {
    try {
        const { page = 1, limit = 20, category, keyword } = c.req.query()

        let query = supabase
            .from('products')
            .select('*, product_variants(*)')
            .eq('is_active', true)  // 前台固定只顯示上架商品
            .order('updated_at', { ascending: false })  // 有更新的商品優先
            .order('created_at', { ascending: false })  // 最新商品優先

        if (category) {
            query = query.contains('category', [Number(category)])
        }

        if (keyword) {
            query = query.ilike('product_name', `%${keyword}%`)
        }

        const from = (page - 1) * limit
        const to = from + Number(limit) - 1
        query = query.range(from, to)

        const { data, error } = await query

        if (error) throw error

        return c.json({ success: true, count: data.length, data })
    } catch (err) {
        return c.json({ success: false, error: err.message }, 500)
    }
})

// ==========================================
// [後台] GET /api/admin/products - 讀取所有商品（含下架）
// ==========================================
app.get('/api/admin/products', verifyAdmin, async (c) => {
    try {
        const { page = 1, limit = 20, category, keyword, is_active } = c.req.query()

        let query = supabase
            .from('products')
            .select('*, product_variants(*)')
            .order('is_active')
            .order('updated_at', { ascending: false })  // 有更新的商品優先
            .order('created_at', { ascending: false })  // 最新商品優先

        if (is_active !== undefined) {  // 布林值需從字串轉換
            query = query.eq('is_active', is_active === 'true')
        }

        if (category) {
            query = query.contains('category', [Number(category)])
        }

        if (keyword) {
            query = query.ilike('product_name', `%${keyword}%`)
        }

        const from = (page - 1) * limit
        const to = from + Number(limit) - 1
        query = query.range(from, to)

        const { data, error } = await query

        if (error) throw error

        return c.json({ success: true, count: data.length, data })
    } catch (err) {
        return c.json({ success: false, error: err.message }, 500)
    }
})

// ==========================================
// [前台] GET /api/products/:id - 讀取單一上架商品
// ==========================================
app.get('/api/products/:id', async (c) => {
    try {
        const { id } = c.req.param()

        const { data, error } = await supabase
            .from('products')
            .select('*, product_variants(*)')
            .eq('id', id)
            .eq('is_active', true)  // 防止用戶透過 id 直接存取下架商品
            .single()

        if (error) throw error

        return c.json({ success: true, data })
    } catch (err) {
        return c.json({ success: false, error: '找不到此商品' }, 404)
    }
})

// ==========================================
// [後台] GET /api/admin/products/:id - 讀取單一商品（含下架）
// ==========================================
app.get('/api/admin/products/:id', verifyAdmin, async (c) => {
    try {
        const { id } = c.req.param()

        const { data, error } = await supabase
            .from('products')
            .select('*, product_variants(*)')
            .eq('id', id)
            .single()

        if (error) throw error

        return c.json({ success: true, data })
    } catch (err) {
        return c.json({ success: false, error: '找不到此商品' }, 404)
    }
})

// ==========================================
// [後台] POST /api/admin/products/:id/images - 上傳圖片到 Cloudflare R2
// ==========================================
app.post('/api/admin/products/:id/images', verifyAdmin, async (c) => {   // 前端傳來的圖片欄位名稱是 image
    const { id } = c.req.param()
    const body = await c.req.parseBody()
    const file = body['image']
    if (!file || typeof file === 'string') return c.json({ error: '請提供圖片檔案' }, 400)

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const fileName = `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    try {
        await r2.send(new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: fileName,
            Body: buffer,
            ContentType: file.type || 'image/jpeg'
        }))
        return c.json({ success: true, url: `${R2_PUBLIC_URL}/${fileName}` })
    } catch (error) {
        return c.json({ error: error.message }, 500)
    }
})

// ==========================================
// [後台] DELETE /api/admin/products/:id/images - 從 Cloudflare R2 刪除圖片
// ==========================================
app.delete('/api/admin/products/:id/images', verifyAdmin, async (c) => {
    const { url } = await c.req.json()
    if (!url) return c.json({ error: '請提供圖片 URL' }, 400)

    const key = r2KeyFromUrl(url)
    if (!key) return c.json({ error: '無效的圖片 URL' }, 400)

    try {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
        return c.json({ success: true })
    } catch (error) {
        return c.json({ error: error.message }, 500)
    }
})

// ==========================================
// [前台] GET /api/covers - 讀取目前封面圖片列表
// ==========================================
app.get('/api/covers', async (c) => {
    try {
        if (coverImagesCache.data && Date.now() < coverImagesCache.expiresAt) {
            return c.json({ success: true, data: coverImagesCache.data })
        }

        const result = await r2.send(new ListObjectsV2Command({
            Bucket: R2_BUCKET,
            Prefix: 'covers/'
        }))

        const data = (result.Contents ?? [])
            .filter(obj => obj.Key !== 'covers/')  // 排除資料夾本身的空物件
            .sort((a, b) => a.Key.localeCompare(b.Key))  // 檔名含時間戳記，可依上傳時間排序
            .map(obj => `${R2_PUBLIC_URL}/${obj.Key}`)

        coverImagesCache = { data, expiresAt: Date.now() + COVER_CACHE_TTL }

        return c.json({ success: true, data })
    } catch (err) {
        return c.json({ success: false, error: err.message }, 500)
    }
})

// ==========================================
// [後台] POST /api/admin/covers - 上傳封面圖片到 Cloudflare R2
// ==========================================
app.post('/api/admin/covers', verifyAdmin, async (c) => {
    const body = await c.req.parseBody()
    const file = body['image']
    if (!file || typeof file === 'string') return c.json({ error: '請提供圖片檔案' }, 400)

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const fileName = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    try {
        await r2.send(new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: fileName,
            Body: buffer,
            ContentType: file.type || 'image/jpeg'
        }))
        coverImagesCache = { data: null, expiresAt: 0 }  // 清快取，讓下次讀取拿到最新清單
        return c.json({ success: true, url: `${R2_PUBLIC_URL}/${fileName}` })
    } catch (error) {
        return c.json({ error: error.message }, 500)
    }
})

// ==========================================
// [後台] DELETE /api/admin/covers - 從 Cloudflare R2 刪除封面圖片
// ==========================================
app.delete('/api/admin/covers', verifyAdmin, async (c) => {
    const { url } = await c.req.json()
    if (!url) return c.json({ error: '請提供圖片 URL' }, 400)

    const key = r2KeyFromUrl(url)
    if (!key) return c.json({ error: '無效的圖片 URL' }, 400)

    try {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
        coverImagesCache = { data: null, expiresAt: 0 }  // 清快取
        return c.json({ success: true })
    } catch (error) {
        return c.json({ error: error.message }, 500)
    }
})

// ==========================================
// [前後台] GET /api/products/:id/variants - 讀取商品所有規格
// ==========================================
app.get('/api/products/:id/variants', async (c) => {
    const { id } = c.req.param()
    const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', id)
        .order('color')

    if (error) return c.json({ error: error.message }, 500)
    return c.json({ success: true, data })
})

// ==========================================
// [後台] POST /api/admin/products/:id/variants - 新增商品規格
// ==========================================
app.post('/api/admin/products/:id/variants', verifyAdmin, async (c) => {
    const { id } = c.req.param()
    const { color, color_code, size, is_available } = await c.req.json()

    const { data, error } = await supabase
        .from('product_variants')
        .insert([{ product_id: id, color, color_code, size, is_available, created_at: new Date().toISOString() }])
        .select()
        .single()

    if (error) return c.json({ error: error.message }, 400)
    return c.json({ success: true, data }, 201)
})

// ==========================================
// [後台] PUT /api/admin/products/:id/variants/:variantId - 更新商品規格
// ==========================================
app.put('/api/admin/products/:id/variants/:variantId', verifyAdmin, async (c) => {
    const { id, variantId } = c.req.param()
    const { color, color_code, size, is_available } = await c.req.json()

    const { data, error } = await supabase
        .from('product_variants')
        .update({ color, color_code, size, is_available, updated_at: new Date().toISOString() })
        .eq('id', variantId)
        .eq('product_id', id)
        .select()
        .single()

    if (error) return c.json({ error: error.message }, 400)
    return c.json({ success: true, data })
})

// ==========================================
// [後台] DELETE /api/admin/products/:id/variants/:variantId - 刪除商品規格
// ==========================================
app.delete('/api/admin/products/:id/variants/:variantId', verifyAdmin, async (c) => {
    const { id, variantId } = c.req.param()
    const { error } = await supabase
        .from('product_variants')
        .delete()
        .eq('id', variantId)
        .eq('product_id', id)

    if (error) return c.json({ error: error.message }, 400)
    return c.json({ success: true, message: '規格已刪除' })
})

// ==========================================
// [後台] POST /api/admin/products - 新增商品
// ==========================================
app.post('/api/admin/products', verifyAdmin, async (c) => {
    try {
        const insert = await c.req.json()                // 從 body 拿要新增的欄位
        const { data, error } = await supabase
            .from('products')
            .insert(insert)
            .select()
            .single()

        if (error) throw error

        return c.json({ success: true, message: '商品新增成功', data }, 201)
    } catch (err) {
        return c.json({ success: false, error: err.message }, 400)
    }
})

// ==========================================
// [後台] PUT /api/admin/products/:id - 更新商品
// ==========================================
app.put('/api/admin/products/:id', verifyAdmin, async (c) => {
    try {
        const { id } = c.req.param()               // 從網址拿 id
        const updates = await c.req.json()          // 從 body 拿要更新的欄位

        const { data, error } = await supabase
            .from('products')
            .update(updates)                    // 傳入要更新的欄位
            .eq('id', id)
            .select()

        if (error) throw error

        return c.json({ success: true, message: '商品修改成功', data })
    } catch (err) {
        return c.json({ success: false, error: err.message }, 400)
    }
})

// ==========================================
// [後台] DELETE /api/admin/products/:id - 刪除商品
// ==========================================
app.delete('/api/admin/products/:id', verifyAdmin, async (c) => {
    try {
        const { id } = c.req.param()

        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id)

        if (error) throw error

        return c.json({ success: true, message: '商品刪除成功' })
    } catch (err) {
        return c.json({ success: false, error: err.message }, 400)
    }
})


// ==========================================
// [前台] POST /api/orders - 建立訂單（需登入）
// ==========================================
// 隨機生成訂單編號的函式，格式為 ORD-YYYYMMDD-XXXXXX
function generateOrderNo() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const random = Math.random().toString(36).slice(2, 8).toUpperCase()  // toString(36) 轉成 36 進位
    return `ORD-${dateStr}-${random}`
}

app.post('/api/orders', verifyUser, async (c) => {
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
            remark
        } = await c.req.json()

        const { data, error } = await supabase
            .from('orders')
            .insert([{
                member_id: user.id,  // 從 token 取得，前端無法偽造
                order_no: generateOrderNo(),  // 後端自動產生，前端無法控制
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
                status_history: [{ status: 'pending', changed_at: new Date().toISOString() }]
            }])
            .select()

        if (error) throw error

        // 寄送訂單確認信（非同步，不影響回應速度）
        sendOrderMail({ ...data[0], member_email: user.email }).catch(err =>
            console.error('寄信失敗：', err.message)
        )

        return c.json({ success: true, message: '訂單建立成功', data }, 201)
    } catch (err) {
        return c.json({ success: false, error: err.message }, 400)
    }
})

// ==========================================
// [前台] GET /api/orders/me - 查看自己的訂單（需登入）
// ==========================================
app.get('/api/orders/me', verifyUser, async (c) => {
    try {
        const user = c.get('user')
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('member_id', user.id)  // 只查自己的訂單
            .order('created_at', { ascending: false })

        if (error) throw error

        return c.json({ success: true, count: data.length, data })
    } catch (err) {
        return c.json({ success: false, error: err.message }, 500)
    }
})

// ==========================================
// [前台] PATCH /api/orders/:id/payment-account - 填寫匯款帳號末五碼
// ==========================================
app.patch('/api/orders/:id/payment-account', verifyUser, async (c) => {
    const { id } = c.req.param()
    const user = c.get('user')
    const { payment_account_info } = await c.req.json()

    if (!payment_account_info) return c.json({ error: '請提供帳號資訊' }, 400)

    const { error } = await supabase
        .from('orders')
        .update({ payment_account_info })
        .eq('id', id)
        .eq('member_id', user.id)  // 只能更新自己的訂單

    if (error) return c.json({ error: error.message }, 500)
    return c.json({ success: true })
})

// ==========================================
// [後台] GET /api/admin/members - 查看所有會員
// ==========================================
app.get('/api/admin/members', verifyAdmin, async (c) => {
    try {
        const { data, error } = await supabase
            .from('members')
            .select('id, name, phone, email, created_at')
            .order('created_at', { ascending: false })

        if (error) throw error
        return c.json({ success: true, data })
    } catch (err) {
        return c.json({ success: false, error: err.message }, 500)
    }
})

// ==========================================
// [後台] GET /api/admin/orders - 查看所有訂單（需管理員）
// ==========================================
app.get('/api/admin/orders', verifyAdmin, async (c) => {
    try {
        const { member_id } = c.req.query()

        let query = supabase
            .from('orders')
            .select('*, members!member_id(name, email)')
            .order('created_at', { ascending: false })

        if (member_id) query = query.eq('member_id', member_id)

        const { data, error } = await query
        if (error) throw error

        // 將 members.name 攤平到 order 物件上
        const orders = data.map(o => ({ ...o, member_name: o.members?.name ?? null, member_email: o.members?.email ?? null }))
        return c.json({ success: true, count: orders.length, data: orders })
    } catch (err) {
        return c.json({ success: false, error: err.message }, 500)
    }
})

// ==========================================
// [後台] PATCH /api/admin/orders/:id/status - 更新訂單狀態
// ==========================================
app.patch('/api/admin/orders/:id/status', verifyAdmin, async (c) => {
    const { id } = c.req.param()
    const { status } = await c.req.json()

    const validStatuses = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']
    if (!validStatuses.includes(status)) {
        return c.json({ error: '無效的狀態值' }, 400)
    }

    // 取出現有 status_history
    const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('status_history')
        .eq('id', id)
        .single()

    if (fetchError) return c.json({ error: fetchError.message }, 500)

    const history = [...(order.status_history ?? []), {
        status,
        changed_at: new Date().toISOString()
    }]

    const { error } = await supabase
        .from('orders')
        .update({ status, status_history: history, updated_at: new Date().toISOString() })
        .eq('id', id)

    if (error) return c.json({ error: error.message }, 500)
    return c.json({ success: true })
})

// ==========================================
// [後台] GET /api/admin/dashboard-stats - 總覽數據
// ==========================================
app.get('/api/admin/dashboard-stats', verifyAdmin, async (c) => {
    try {
        const now = new Date()
        const taiwanNow = new Date(now.getTime() + 8 * 60 * 60 * 1000)
        const todayStr = taiwanNow.toISOString().slice(0, 10)
        const todayStart = new Date(todayStr + 'T00:00:00+08:00').toISOString()
        const todayEnd   = new Date(todayStr + 'T23:59:59.999+08:00').toISOString()

        const [todayRes, pendingPayRes, pendingRecRes, shipRes] = await Promise.all([
            // 今日訂單
            supabase.from('orders').select('id', { count: 'exact', head: true })
                .gte('created_at', todayStart).lte('created_at', todayEnd),
            // 待付款：pending 且未提交匯款帳號
            supabase.from('orders').select('id', { count: 'exact', head: true })
                .eq('status', 'pending')
                .or('payment_method.neq.transfer,payment_account_info.is.null'),
            // 待對帳：pending + 已提交匯款帳號
            supabase.from('orders').select('id', { count: 'exact', head: true })
                .eq('status', 'pending')
                .eq('payment_method', 'transfer')
                .not('payment_account_info', 'is', null),
            // 待出貨：paid 或 processing
            supabase.from('orders').select('id', { count: 'exact', head: true })
                .in('status', ['paid', 'processing']),
        ])

        return c.json({
            success: true,
            todayOrders:      todayRes.count      ?? 0,
            pendingPayment:   pendingPayRes.count  ?? 0,
            pendingReconcile: pendingRecRes.count  ?? 0,
            pendingShipment:  shipRes.count        ?? 0,
        })
    } catch (err) {
        return c.json({ success: false, error: err.message }, 500)
    }
})

// ==========================================
// [後台] GET /api/admin/procurement - 撈全部採購紀錄
// ==========================================
app.get('/api/admin/procurement', verifyAdmin, async (c) => {
    try {
        const { data, error } = await supabase
            .from('purchase_records')
            .select('product_id, color, size, purchase_quantity')
        if (error) throw error
        return c.json({ success: true, data })
    } catch (err) {
        return c.json({ success: false, error: err.message }, 500)
    }
})

// ==========================================
// [後台] PUT /api/admin/procurement - 新增或更新採購數量
// ==========================================
app.put('/api/admin/procurement', verifyAdmin, async (c) => {
    try {
        const { product_id, color, size, purchase_quantity } = await c.req.json()
        if (!product_id || purchase_quantity == null) return c.json({ error: '缺少必要欄位' }, 400)
        const { error } = await supabase
            .from('purchase_records')
            .upsert(
                { product_id, color: color ?? '', size: size ?? '', purchase_quantity, updated_at: new Date().toISOString() },
                { onConflict: 'product_id,color,size' }
            )
        if (error) throw error
        return c.json({ success: true })
    } catch (err) {
        return c.json({ success: false, error: err.message }, 500)
    }
})

// ==========================================
// [後台] DELETE /api/admin/procurement - 重置全部採購紀錄
// ==========================================
app.delete('/api/admin/procurement', verifyAdmin, async (c) => {
    try {
        const { error } = await supabase
            .from('purchase_records')
            .delete()
            .neq('id', 0)
        if (error) throw error
        return c.json({ success: true })
    } catch (err) {
        return c.json({ success: false, error: err.message }, 500)
    }
})

// ==========================================
// 啟動伺服器 (測試用)
// ==========================================
serve({ fetch: app.fetch, port }, () => {
    console.log("正在連線的 URL:", process.env.SUPABASE_URL);
    console.log('------------------------------------------');
    console.log(`🚀 伺服器已啟動！(Hono)`);
    console.log(`📡 本機網址: http://localhost:${port}`);
    console.log(`📦 商品測試: http://localhost:${port}/api/products`);
    console.log('------------------------------------------');
    console.log('按 Ctrl + C 可以關閉伺服器');
});
