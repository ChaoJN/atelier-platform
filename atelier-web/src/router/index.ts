import { createRouter, createWebHistory } from 'vue-router'
import { useAdminAuthStore } from '@/stores/adminAuth'

// App.vue 靠 route.meta.layout 決定要套哪一種版面：
// 未設定 = 共用的白底前台 Header/Footer；'bare' = 完全自帶版面（登入頁、結帳頁）；
// 'admin' = 後台深色版面（Dashboard 以後的後台頁面）
declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'bare' | 'admin'
    requiresAdmin?: boolean
    // title 對應舊版每個 html 各自寫死的 <title>；
    // og 只在舊版該頁面本來就有 Open Graph 標籤時才給值（後台頁面、結帳、登入等本來就沒有，維持沒有）
    title?: string
    og?: { type: 'website' | 'product' }
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/Home.vue'),
      meta: { layout: 'bare', title: 'Rainstopha Select - 首頁', og: { type: 'website' } },
    },
    {
      path: '/product',
      name: 'product-list',
      component: () => import('@/views/shop/ProductList.vue'),
      meta: { title: 'Rainstopha Select - SHOP', og: { type: 'website' } },
    },
    {
      path: '/product/:id',
      name: 'product-detail',
      component: () => import('@/views/shop/ProductDetail.vue'),
      meta: { title: 'Rainstopha Select', og: { type: 'product' } },
    },
    {
      path: '/cart',
      name: 'cart',
      component: () => import('@/views/shop/Cart.vue'),
      meta: { title: 'Rainstopha Select - CART' },
    },
    {
      path: '/policy',
      name: 'policy',
      component: () => import('@/views/Policy.vue'),
      meta: { title: 'Rainstopha Select - POLICY', og: { type: 'website' } },
    },
    {
      path: '/checkout',
      name: 'checkout',
      component: () => import('@/views/shop/Checkout.vue'),
      meta: { layout: 'bare', title: 'Rainstopha Select - 結帳' },
    },
    {
      path: '/account/orders',
      name: 'order-lookup',
      component: () => import('@/views/account/OrderLookup.vue'),
      meta: { title: 'Rainstopha Select - ACCOUNT' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/account/Login.vue'),
      meta: { layout: 'bare', title: 'Rainstopha Select - 前台會員登入' },
    },
    {
      path: '/admin/login',
      name: 'admin-login',
      component: () => import('@/views/admin/Login.vue'),
      meta: { layout: 'bare', title: 'Rainstopha Select - 後台管理登入' },
    },
    {
      path: '/admin/dashboard',
      name: 'admin-dashboard',
      component: () => import('@/views/admin/Dashboard.vue'),
      meta: { layout: 'admin', requiresAdmin: true, title: 'Rainstopha Select 系統後台' },
    },
    {
      path: '/admin/covers',
      name: 'admin-covers',
      component: () => import('@/views/admin/Covers.vue'),
      meta: { layout: 'admin', requiresAdmin: true, title: 'Rainstopha Select 系統後台 - 封面管理' },
    },
    {
      path: '/admin/products',
      name: 'admin-products',
      component: () => import('@/views/admin/Products.vue'),
      meta: { layout: 'admin', requiresAdmin: true, title: 'Rainstopha Select 系統後台 - 商品管理' },
    },
    {
      path: '/admin/products/new',
      name: 'admin-product-new',
      component: () => import('@/views/admin/ProductForm.vue'),
      meta: { layout: 'admin', requiresAdmin: true, title: 'Rainstopha Select 系統後台 - 新增商品' },
    },
    {
      path: '/admin/products/:id',
      name: 'admin-product-edit',
      component: () => import('@/views/admin/ProductForm.vue'),
      meta: { layout: 'admin', requiresAdmin: true, title: 'Rainstopha Select 系統後台 - 商品明細' },
    },
    {
      path: '/admin/orders',
      name: 'admin-orders',
      component: () => import('@/views/admin/Orders.vue'),
      meta: { layout: 'admin', requiresAdmin: true, title: 'Rainstopha Select 系統後台 - 訂單管理' },
    },
    {
      path: '/admin/analytics',
      name: 'admin-analytics',
      component: () => import('@/views/admin/Analytics.vue'),
      meta: { layout: 'admin', requiresAdmin: true, title: 'Rainstopha Select 系統後台 - 採購分析' },
    },
    {
      path: '/admin/members',
      name: 'admin-members',
      component: () => import('@/views/admin/Members.vue'),
      meta: { layout: 'admin', requiresAdmin: true, title: 'Rainstopha Select 系統後台 - 會員管理' },
    },
  ],
})

// 後台頁面在「進入路由」這一刻就擋下未登入的請求，元件根本不會被建立，
// 才不會發生子元件的 onMounted 搶先父層版面的登入檢查、觸發多餘 API 呼叫的競態問題
router.beforeEach((to) => {
  if (to.meta.requiresAdmin && !useAdminAuthStore().isLoggedIn) {
    return { path: '/admin/login' }
  }
})

const SITE_NAME = 'Rainstopha Select'
const OG_DESCRIPTION = 'FIND YOUR OWN VIBE'
const OG_IMAGE = '/assets/cover.jpg'

function setMetaTag(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    el.setAttribute('data-managed', 'true')
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

// 這是 SPA，只有一份 index.html，切路由不會重新載入 <head>，
// 所以每次換頁都要清掉上一頁加的 meta，再依照這一頁的設定重新補上
// （只有舊版本來就有 Open Graph 標籤的頁面才加，後台/登入/結帳等頁面維持沒有）
router.afterEach((to) => {
  document.title = to.meta.title ?? SITE_NAME
  document.querySelectorAll('meta[data-managed="true"]').forEach((el) => el.remove())

  if (to.meta.og) {
    setMetaTag('property', 'og:title', to.meta.title ?? SITE_NAME)
    setMetaTag('property', 'og:description', OG_DESCRIPTION)
    setMetaTag('property', 'og:image', window.location.origin + OG_IMAGE)
    setMetaTag('property', 'og:url', window.location.origin + to.fullPath)
    setMetaTag('property', 'og:type', to.meta.og.type)
    setMetaTag('name', 'description', OG_DESCRIPTION)
  }
})

export default router
