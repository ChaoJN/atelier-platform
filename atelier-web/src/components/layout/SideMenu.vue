<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCategoriesStore } from '@/stores/categories'
import { useModal } from '@/composables/useModal'

// Props 父元件傳入的 open 屬性，由使用者宣告 open 是 true 或 false，表示選單是否開啟
defineProps<{ open: boolean }>()

// 自定義事件，可在函式里呼叫
// 一個 defineEmits 可定義多個事件，[] 表示不需要傳入任何參數，單純觸發
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const auth = useAuthStore()
const categories = useCategoriesStore()
const { confirm } = useModal()

const shopOpen = ref(false)
const keyword = ref('')

onMounted(() => categories.ensureLoaded())

function close() {
  emit('close')  // 發出一個名叫 'close' 的自定義事件
}

function goTo(path: string, query?: Record<string, string>) {
  // router.push() 會導向到指定的路徑，並且可以帶上 query 參數
  router.push({ path, query })
  close()
}

function search() {
  const trimmed = keyword.value.trim()
  if (!trimmed) return
  goTo('/product', { keyword: trimmed })
}

async function logout() {
  const ok = await confirm('確定要登出嗎？', { confirmText: '登出', danger: true })
  if (!ok) return
  auth.logout()
  goTo('/product')
}
</script>

<template>
  <!-- :class="{ open }" 當 open 為 true 時加上 open 這個 class，可透過 css 的 .menu-panel.open 來控制 -->
  <div class="menu-overlay" :class="{ open }" @click="close"></div>
  <div class="menu-panel" :class="{ open }">
    <!-- @click="close" 當按下關閉按鈕時執行 close 函式 -->
    <button class="menu-close" aria-label="關閉選單" @click="close">✕</button>
    <div class="menu-search">
      <!-- v-model="keyword" 雙向綁定，輸入框跟變數自動同步，使用者打字時 keyword 這個 ref 會自動更新;反過來如果程式改了 keyword.value,輸入框裡顯示的文字也會自動變 -->
      <input
        v-model="keyword"
        type="text"
        placeholder="ＳＥＡＲＣＨ . . ."
        autocomplete="off"
        @keydown.enter="search"
      />
      <button class="menu-search-btn" aria-label="搜尋" @click="search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </button>
    </div>
    <nav class="menu-nav">
      <button class="menu-nav-toggle" @click="shopOpen = !shopOpen">SHOP</button>
      <div class="menu-subnav" :class="{ open: shopOpen }">
        <a href="#" @click.prevent="goTo('/product')">ALL</a>
        <a
          v-for="c in categories.items"
          :key="c.id"
          href="#"
          @click.prevent="goTo('/product', { category: String(c.id) })"
        >
          {{ c.slug.toUpperCase() }}
        </a>
      </div>
      <a v-if="auth.isLoggedIn" href="#" @click.prevent="goTo('/account/orders')">ACCOUNT</a>
      <!-- auth.isLoggedIn 是 true 就顯示 LOGOUT,否則顯示 LOGIN——這兩個 <a> 標籤同一時間只會有一個真的出現在畫面上 -->
      <a v-if="auth.isLoggedIn" href="#" @click.prevent="logout">LOGOUT</a>
      <a v-else href="#" @click.prevent="goTo('/login')">LOGIN</a>
      <a href="https://www.instagram.com/rainstopha.select" target="_blank" rel="noopener">CONTACT US</a>
    </nav>
  </div>
</template>

<style scoped>
.menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  /* 用跟首頁封面圖同一套 lvh + 緩衝的算法，不要用固定 px 硬撐高度——
     固定值在某些 App 內建瀏覽器（例如 Instagram 的 WebView）算出的可視高度比預期大時會不夠蓋滿，下方就會露出留白 */
  height: 100svh;
  height: calc(100lvh + max(env(safe-area-inset-bottom, 0px), 60px));
  background: rgba(0, 0, 0, 0.4);
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}
.menu-overlay.open {
  opacity: 1;
  pointer-events: auto;
}
.menu-panel {
  position: fixed;
  top: 0;
  left: 0;
  width: 260px;
  height: 100svh;
  height: calc(100lvh + max(env(safe-area-inset-bottom, 0px), 60px));
  background: #fff;
  z-index: 101;
  transform: translateX(-100%);
  transition: transform 0.3s ease;
  display: flex;
  flex-direction: column;
  padding: 24px 0;
}
.menu-panel.open {
  transform: translateX(0);
}
.menu-close {
  align-self: flex-end;
  margin-right: 20px;
  margin-bottom: 16px;
  background: transparent;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: #555;
}
.menu-search {
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.menu-search input {
  width: 100%;
  padding: 8px 4px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  background: transparent;
  border: none;
  border-bottom: 1px solid #ccc;
  color: #333;
}
.menu-search input::placeholder {
  color: #ccc;
}
.menu-search input:focus {
  border-bottom-color: #333;
}
.menu-search-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  color: #333;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.menu-nav a,
.menu-nav-toggle {
  display: block;
  width: 100%;
  padding: 14px 28px;
  font-size: 15px;
  color: #333;
  text-decoration: none;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.15s;
}
.menu-nav a:hover,
.menu-nav-toggle:hover {
  background: #f7f7f7;
}
.menu-subnav {
  display: none;
  background: #fafafa;
}
.menu-subnav.open {
  display: block;
}
.menu-subnav a {
  padding: 10px 28px 10px 40px;
  font-size: 14px;
  color: #555;
}
</style>
