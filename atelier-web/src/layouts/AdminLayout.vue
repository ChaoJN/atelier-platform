<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAdminAuthStore } from '@/stores/adminAuth'
import AdminAlert from '@/components/common/AdminAlert.vue'
import AdminConfirmModal from '@/components/common/AdminConfirmModal.vue'

// 登入檢查交給 router.beforeEach（見 router/index.ts 的 requiresAdmin），
// 沒登入的話這個元件根本不會被建立，這裡不用再檢查一次
const router = useRouter()
const route = useRoute()
const admin = useAdminAuthStore()

const navItems = [
  { label: 'HOME', path: '/admin/dashboard' },
  { label: 'COVERS', path: '/admin/covers' },
  { label: 'PRODUCTS', path: '/admin/products' },
  { label: 'ORDERS', path: '/admin/orders' },
  { label: 'MEMBERS', path: '/admin/members' },
  { label: 'ANALYTICS', path: '/admin/analytics' },
]

// PRODUCTS 用 startsWith 是因為新增/編輯商品頁（/admin/products/new、/admin/products/:id）
// 是獨立路由，不屬於 /admin/products 底下的巢狀路由，但視覺上仍屬於「商品」這個分類
function isActive(path: string) {
  return path === '/admin/products' ? route.path.startsWith(path) : route.path === path
}

async function logout() {
  admin.logout()
  router.push('/admin/login')
}
</script>

<template>
  <div class="admin-shell">
    <div class="admin-container">
      <div class="admin-header">
        <h1 @click="router.push('/admin/dashboard')">Rainstopha Select 系統後台</h1>
        <button class="logout-btn" aria-label="登出" @click="logout">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>

      <nav class="menu-container">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="menu-item"
          :class="{ active: isActive(item.path) }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <RouterView />
    </div>
  </div>

  <AdminAlert />
  <AdminConfirmModal />
</template>

<style scoped>
.admin-shell {
  min-height: 100vh;
  background-color: #000;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'Noto Sans TC', -apple-system, BlinkMacSystemFont, sans-serif;
  padding: 20px;
  box-sizing: border-box;
}
.admin-container {
  max-width: 1000px;
  margin: 0 auto;
}
.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  border-bottom: 1px solid #444;
  padding-bottom: 20px;
  margin-bottom: 30px;
}
.admin-header h1 {
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
  font-size: 22px;
  cursor: pointer;
}
.logout-btn {
  padding: 8px;
  background-color: transparent;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
}
.logout-btn:hover {
  opacity: 0.7;
}

.menu-container {
  display: flex;
  gap: 12px;
  margin-bottom: 30px;
  flex-wrap: wrap;
}
.menu-item {
  padding: 8px 20px;
  background-color: #000;
  color: #fff;
  border: 1px solid #fff;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  z-index: 0;
  transition: color 0.3s ease;
  text-decoration: none;
  display: inline-block;
}
.menu-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background-color: #fff;
  z-index: -1;
  transition: left 0.3s ease;
}
.menu-item:hover::before {
  left: 0;
}
.menu-item:hover {
  color: #000;
}
.menu-item.active {
  background-color: #fff;
  color: #000;
}
</style>
