<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { useCartStore } from '@/stores/cart'

const router = useRouter()
const cart = useCartStore()

function variantLabel(color: string | null | undefined, size: string | null | undefined) {
  return [color, size].filter(Boolean).join('・')
}

function goCheckout() {
  cart.closeDrawer()
  router.push('/checkout')
}
</script>

<template>
  <div class="drawer-overlay" :class="{ open: cart.isDrawerOpen }" @click="cart.closeDrawer()"></div>
  <aside class="drawer" :class="{ open: cart.isDrawerOpen }">
    <div class="drawer-header">
      <span>CART</span>
      <button class="close-btn" @click="cart.closeDrawer()">✕</button>
    </div>
    <div class="drawer-body">
      <p v-if="cart.items.length === 0" class="empty">購物車是空的</p>
      <ul v-else class="item-list">
        <li v-for="(item, i) in cart.items" :key="i">
          <RouterLink :to="`/product/${item.productId}`" class="item-info" @click="cart.closeDrawer()">
            <span class="item-name">{{ item.productName }}</span>
            <span v-if="variantLabel(item.color, item.size)" class="item-variant">
              {{ variantLabel(item.color, item.size) }}
            </span>
            <span class="item-price">
              NT$ {{ item.price }}
              <span v-if="item.originalPrice" class="item-price-original">NT$ {{ item.originalPrice }}</span>
            </span>
          </RouterLink>
          <span class="item-qty">x{{ item.quantity }}</span>
        </li>
      </ul>
    </div>

    <div v-if="cart.items.length > 0" class="drawer-footer">
      <div class="subtotal-row">
        <span>小計</span>
        <span>NT$ {{ cart.subtotal.toLocaleString() }}</span>
      </div>
      <button class="checkout-btn" @click="goCheckout">前往結帳</button>
    </div>
  </aside>
</template>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 150;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}
.drawer-overlay.open {
  opacity: 1;
  pointer-events: auto;
}
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  max-width: 90vw;
  background: #fff;
  z-index: 151;
  transform: translateX(100%);
  transition: transform 0.3s ease;
  display: flex;
  flex-direction: column;
}
.drawer.open {
  transform: translateX(0);
}
.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
  font-weight: bold;
}
.close-btn {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #555;
}
.drawer-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}
.empty {
  color: #aaa;
  font-size: 14px;
  text-align: center;
  margin-top: 40px;
}
.item-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.item-list li {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  font-size: 14px;
}
.item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  color: #333;
  text-decoration: none;
}
.item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-variant {
  font-size: 12px;
  color: #888;
}
.item-price {
  font-size: 13px;
  font-weight: bold;
  color: #333;
  margin-top: 2px;
}
.item-price-original {
  font-size: 11px;
  color: #aaa;
  text-decoration: line-through;
  font-weight: normal;
  margin-left: 4px;
}
.item-qty {
  flex-shrink: 0;
  color: #555;
}

.drawer-footer {
  border-top: 1px solid #eee;
  padding: 16px 20px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}
.subtotal-row {
  display: flex;
  justify-content: space-between;
  font-size: 15px;
  margin-bottom: 12px;
}
.subtotal-row span:last-child {
  font-weight: bold;
}
.checkout-btn {
  width: 100%;
  padding: 14px;
  background: #333;
  color: #fff;
  border: none;
  font-size: 14px;
  font-weight: bold;
  font-family: inherit;
  letter-spacing: 1px;
  cursor: pointer;
  transition: background 0.2s;
}
.checkout-btn:hover {
  background: #000;
}
</style>
