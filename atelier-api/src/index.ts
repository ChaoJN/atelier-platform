import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings } from './types/bindings'
import { products } from './routes/products'
import { categories } from './routes/categories'
import { covers } from './routes/covers'
import { auth } from './routes/auth'
import { members } from './routes/members'
import { checkout } from './routes/checkout'
import { admin } from './routes/admin'
import { upload } from './routes/upload'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

app.get('/', (c) => c.text('Atelier API 伺服器運行中 (Hono / Cloudflare Workers)'))

// app.route(prefix, subApp) 是前綴拼接：subApp 裡每支路由的路徑，
// 都會自動加上 prefix。例如 categories.ts 裡的 get('/')，
// 掛在 '/api/categories' 前綴下，外部路徑就變成 GET /api/categories
app.route('/api/products', products)
app.route('/api/categories', categories)
app.route('/api/covers', covers)
app.route('/api/auth', auth)
app.route('/api/members', members)
app.route('/api/orders', checkout)
app.route('/api/admin', admin)
app.route('/api/upload', upload)

export default app
