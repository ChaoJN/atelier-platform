<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useCartStore } from '@/stores/cart'
import { apiFetch } from '@/composables/useApi'
import SideMenu from '@/components/layout/SideMenu.vue'

const router = useRouter()
const cart = useCartStore()
const menuOpen = ref(false)

// 首頁主視覺從 R2（/api/covers）動態抓，不是寫死的圖片路徑
const heroImages = ref<string[]>([])
const activeHero = ref(0)
let heroTimer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  try {
    const { data } = await apiFetch<{ success: true; data: string[] }>('/api/covers')
    heroImages.value = data
  } catch {
    heroImages.value = []
  }

  // 只有一張時不用輪播，activeHero 停在 0，那張圖就一直是 opacity:1，等同靜態顯示
  if (heroImages.value.length > 1) {
    heroTimer = setInterval(() => {
      activeHero.value = (activeHero.value + 1) % heroImages.value.length
    }, 5000)
  }
})

onBeforeUnmount(() => clearInterval(heroTimer))
</script>

<template>
  <div class="home">
    <header class="home-header">
      <button class="hamburger" aria-label="選單" @click="menuOpen = true">
        <span></span><span></span><span></span>
      </button>
      <RouterLink to="/" class="logo">Rainstopha Select</RouterLink>
      <button class="cart-btn" aria-label="購物車" @click="router.push('/cart')">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <span v-if="cart.count > 0" class="cart-badge">{{ cart.count }}</span>
      </button>
    </header>

    <main class="home-main">
      <div v-if="heroImages.length > 0" class="hero-stage">
        <img
          v-for="(url, i) in heroImages"
          :key="url"
          class="hero-img"
          :class="{ active: i === activeHero }"
          :src="url"
          alt="Rainstopha Select"
          :loading="i === 0 ? 'eager' : 'lazy'"
        />
      </div>
    </main>

    <footer class="home-footer">
      <div class="footer-links">
        <RouterLink to="/policy">購物須知</RouterLink>
      </div>
      Copyright © 2026 Rainstopha Select
    </footer>
  </div>

  <SideMenu :open="menuOpen" @close="menuOpen = false" />
</template>

<style scoped>
.home {
  position: relative;
  min-height: 100svh;
}

.home-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  background: transparent;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 24px;
  height: 56px;
}
.hamburger {
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 4px;
  justify-self: start;
}
.hamburger span {
  display: block;
  width: 22px;
  height: 2px;
  background: #fff;
  border-radius: 2px;
}
.logo {
  grid-column: 2;
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 1px;
  color: #fff;
  text-decoration: none;
}
.cart-btn {
  justify-self: end;
  position: relative;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #fff;
  display: flex;
  align-items: center;
  padding: 4px;
}
.cart-badge {
  position: absolute;
  top: -4px;
  right: -6px;
  background: #fff;
  color: #333;
  font-size: 10px;
  font-weight: bold;
  border-radius: 999px;
  padding: 1px 5px;
  line-height: 1.4;
}

.home-main {
  width: 100%;
}
.hero-stage {
  position: relative;
  width: 100%;
  height: 100svh;
}
.hero-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
  display: block;
  background: #f5f5f5;
  opacity: 0;
  transition: opacity 1s ease;
}
.hero-img.active {
  opacity: 1;
}

.home-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  padding: 12px 0;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  z-index: 10;
}
.footer-links {
  margin-bottom: 4px;
}
.footer-links a {
  color: rgba(255, 255, 255, 0.5);
  text-decoration: underline;
  font-size: 11px;
  letter-spacing: 0.5px;
}
</style>
