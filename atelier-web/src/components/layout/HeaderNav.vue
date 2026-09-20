<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useCartStore } from '@/stores/cart'
import SideMenu from './SideMenu.vue'

const router = useRouter()

const cart = useCartStore()
const menuOpen = ref(false)
</script>

<template>
  <header class="header">
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
  <!-- 使用 SideMenu 元件 -->
  <!-- 這邊要接住 SideMenu 元件內自定義的 close 事件，要 @ + 自定義事件名 -->
  <SideMenu :open="menuOpen" @close="menuOpen = false" />
</template>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: #fff;
  border-bottom: 1px solid #eee;
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
  background: #333;
  border-radius: 2px;
}
.logo {
  grid-column: 2;
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 1px;
  color: #333;
  text-decoration: none;
}
.cart-btn {
  justify-self: end;
  position: relative;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #333;
  display: flex;
  align-items: center;
  padding: 4px;
}
.cart-badge {
  position: absolute;
  top: -4px;
  right: -6px;
  background: #333;
  color: #fff;
  font-size: 10px;
  font-weight: bold;
  border-radius: 999px;
  padding: 1px 5px;
  line-height: 1.4;
}
</style>
