<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useCartStore } from '@/stores/cart'

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

const router = useRouter()
const cart = useCartStore()

function variantLabel(color: string | null | undefined, size: string | null | undefined) {
  return [color, size].filter(Boolean).join('・')
}

function onImgError(e: Event) {
  ;(e.target as HTMLImageElement).src = BLANK
}

function goToProduct(productId: number) {
  router.push(`/product/${productId}`)
}
</script>

<template>
  <div class="cart-wrap">
    <div class="cart-title">CART</div>

    <div v-if="cart.items.length === 0" class="cart-empty">
      <span>購物車是空的</span>
      <button class="checkout-btn" @click="router.push('/product')">繼續購物</button>
    </div>

    <template v-else>
      <div v-for="(item, i) in cart.items" :key="i" class="cart-item">
        <img
          class="cart-item-img"
          :src="item.image || BLANK"
          alt=""
          @error="onImgError"
          @click="goToProduct(item.productId)"
        />
        <div class="cart-item-info" @click="goToProduct(item.productId)">
          <div class="cart-item-name">{{ item.productName }}</div>
          <div v-if="variantLabel(item.color, item.size)" class="cart-item-variant">
            {{ variantLabel(item.color, item.size) }}
          </div>
          <div class="cart-item-price">
            NT$ {{ item.price }}
            <span v-if="item.originalPrice" class="original">NT$ {{ item.originalPrice }}</span>
          </div>
          <div class="qty-control" @click.stop>
            <button class="qty-btn" @click="cart.updateQty(i, -1)">−</button>
            <div class="qty-num">{{ item.quantity }}</div>
            <button class="qty-btn" @click="cart.updateQty(i, 1)">＋</button>
          </div>
        </div>
        <button class="cart-item-delete" aria-label="刪除" @click="cart.removeItem(i)">✕</button>
      </div>

      <div class="cart-footer">
        <div class="cart-subtotal">
          <span class="cart-subtotal-label">小計</span>
          <span class="cart-subtotal-value">NT$ {{ cart.subtotal.toLocaleString() }}</span>
        </div>
        <button class="checkout-btn" @click="router.push('/product')">繼續購物</button>
        <button class="checkout-btn" @click="router.push('/checkout')">前往結帳</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cart-wrap {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}
.cart-title {
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 1px;
  margin-bottom: 24px;
  text-align: center;
}
.cart-empty {
  text-align: center;
  padding: 20px 0;
  color: #aaa;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.cart-item {
  display: flex;
  gap: 16px;
  padding: 20px 0;
  border-bottom: 1px solid #f0f0f0;
  align-items: flex-start;
}
.cart-item-img {
  width: 200px;
  aspect-ratio: 6 / 9;
  object-fit: cover;
  background: #f5f5f5;
  flex-shrink: 0;
  cursor: pointer;
}
.cart-item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
}
.cart-item-name {
  font-size: 14px;
  font-weight: bold;
}
.cart-item-variant {
  font-size: 12px;
  color: #888;
}
.cart-item-price {
  font-size: 14px;
  font-weight: bold;
}
.cart-item-price .original {
  font-size: 12px;
  color: #aaa;
  text-decoration: line-through;
  font-weight: normal;
  margin-left: 6px;
}
.qty-control {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  width: fit-content;
  margin-top: 4px;
}
.qty-btn {
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #333;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.qty-btn:hover {
  background: #f5f5f5;
}
.qty-num {
  width: 36px;
  text-align: center;
  font-size: 14px;
  border-left: 1px solid #ddd;
  border-right: 1px solid #ddd;
  height: 32px;
  line-height: 32px;
}
.cart-item-delete {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #bbb;
  font-size: 18px;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.15s;
}
.cart-item-delete:hover {
  color: #333;
}
@media (max-width: 480px) {
  .cart-item-img {
    width: 28vw;
  }
}
.cart-footer {
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cart-subtotal {
  display: flex;
  justify-content: space-between;
  font-size: 15px;
}
.cart-subtotal-label {
  color: #888;
}
.cart-subtotal-value {
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
