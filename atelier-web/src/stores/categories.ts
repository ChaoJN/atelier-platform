import { defineStore } from 'pinia'
import type { Category } from '@atelier/types'
import { apiFetch } from '@/composables/useApi'

export const useCategoriesStore = defineStore('categories', {
  state: () => ({
    items: [] as Category[],
    loaded: false,
  }),
  actions: {
    // 分類側選單、篩選列都會用到，只載入一次、快取起來，避免每個頁面各自重複打 API
    async ensureLoaded() {
      if (this.loaded) return
      const { data } = await apiFetch<{ success: true; data: Category[] }>('/api/categories')
      this.items = data
      this.loaded = true
    },
  },
})
