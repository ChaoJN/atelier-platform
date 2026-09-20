import { defineStore } from 'pinia'
import type { OrderItem } from '@atelier/types'

const STORAGE_KEY = 'cart'

function loadCart(): OrderItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

export const useCartStore = defineStore('cart', {
  state: () => ({
    items: loadCart() as OrderItem[],
    isDrawerOpen: false,
  }),
  getters: {
    count: (state) => state.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: (state) => state.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
  },
  actions: {
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items))
    },
    // 同商品+同顏色+同尺寸視為同一筆，數量疊加；否則新增一筆
    addItem(item: OrderItem) {
      const key = (i: OrderItem) => `${i.productId}|${i.colorCode ?? ''}|${i.size ?? ''}`
      const existing = this.items.find((i) => key(i) === key(item))
      if (existing) {
        existing.quantity += item.quantity
      } else {
        this.items.push(item)
      }
      this.persist()
    },
    openDrawer() {
      this.isDrawerOpen = true
    },
    closeDrawer() {
      this.isDrawerOpen = false
    },
    toggleDrawer() {
      this.isDrawerOpen = !this.isDrawerOpen
    },
    // delta 可正可負；數量歸零或以下就直接移除該筆
    updateQty(index: number, delta: number) {
      const item = this.items[index]
      if (!item) return
      item.quantity += delta
      if (item.quantity <= 0) this.items.splice(index, 1)
      this.persist()
    },
    removeItem(index: number) {
      this.items.splice(index, 1)
      this.persist()
    },
  },
})
