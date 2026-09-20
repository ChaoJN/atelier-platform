<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Product } from '@atelier/types'
import { apiFetch } from '@/composables/useApi'
import { useCategoriesStore } from '@/stores/categories'

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

// useRoute() 取得目前的路由資訊，讀 "目前在哪"
// useRouter() 取得路由器實例，可用來導向其他頁面，寫 "要去哪"
const route = useRoute()
const router = useRouter()
const categories = useCategoriesStore()

const products = ref<Product[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const imageIndex = reactive<Record<number, number>>({})

const currentCategory = computed(() => (route.query.category as string) ?? '')
const currentKeyword = computed(() => (route.query.keyword as string) ?? '')

const categorySeqMap = computed(() => {
  const map: Record<number, number> = {}
  for (const c of categories.items) map[c.id] = c.seq ?? 999
  return map
})

const sortedProducts = computed(() => {
  const minSeq = (p: Product) => {
    if (!p.category || p.category.length === 0) return 9999
    return Math.min(...p.category.map((id) => categorySeqMap.value[id] ?? 999))
  }
  return [...products.value].sort((a, b) => minSeq(a) - minSeq(b))
})

function priceHtml(p: Product) {
  if (p.is_discount && p.discount_rate) {
    const discounted = Math.round(p.price * (p.discount_rate / 100))
    return { discounted: `NT$ ${discounted}`, original: `NT$ ${p.price}` }
  }
  return { discounted: `NT$ ${p.price}`, original: null }
}

function colorDots(p: Product) {
  const codes = new Set<string>()
  for (const v of p.product_variants ?? []) {
    if (v.color_code) codes.add(v.color_code)
  }
  return [...codes]
}

function imageFor(p: Product) {
  const urls = p.image_urls
  if (!urls || urls.length === 0) return BLANK
  const idx = imageIndex[p.id] ?? 0
  return urls[idx % urls.length]
}

function onImgError(e: Event) {
  ;(e.target as HTMLImageElement).src = BLANK
}

function goToDetail(id: number) {
  router.push(`/product/${id}`)
}

function selectCategory(id: number | null) {
  router.push({ path: '/product', query: id ? { category: String(id) } : {} })
}

let carouselTimer: ReturnType<typeof setInterval> | undefined

function startCarousel() {
  clearInterval(carouselTimer)
  carouselTimer = setInterval(() => {
    for (const p of products.value) {
      if ((p.image_urls?.length ?? 0) > 1) {
        imageIndex[p.id] = ((imageIndex[p.id] ?? 0) + 1) % p.image_urls.length
      }
    }
  }, 2000)
}

async function loadProducts() {
  loading.value = true
  loadFailed.value = false
  try {
    const params = new URLSearchParams()
    if (currentCategory.value) params.set('category', currentCategory.value)
    if (currentKeyword.value) params.set('keyword', currentKeyword.value)
    const qs = params.toString()
    const { data } = await apiFetch<{ success: true; data: Product[] }>(`/api/products${qs ? `?${qs}` : ''}`)
    products.value = data
    for (const p of data) imageIndex[p.id] = 0
    startCarousel()
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await categories.ensureLoaded()
  await loadProducts()
})

watch([currentCategory, currentKeyword], () => {
  loadProducts()
})

onUnmounted(() => clearInterval(carouselTimer))
</script>

<template>
  <div>
    <div class="filter-bar">
      <button class="filter-chip" :class="{ selected: !currentCategory && !currentKeyword }" @click="selectCategory(null)">
        ALL
      </button>
      <button
        v-for="c in categories.items"
        :key="c.id"
        class="filter-chip"
        :class="{ selected: String(c.id) === currentCategory }"
        @click="selectCategory(c.id)"
      >
        {{ c.slug.toUpperCase() }}
      </button>
    </div>

    <div class="product-grid">
      <div v-if="loading" class="empty">載入中...</div>
      <div v-else-if="loadFailed" class="empty">載入失敗</div>
      <div v-else-if="sortedProducts.length === 0" class="empty">尚無相關商品</div>
      <template v-else>
        <div
          v-for="p in sortedProducts"
          :key="p.id"
          class="product-card"
          @click="goToDetail(p.id)"
        >
          <img class="card-img" :src="imageFor(p)" alt="" @error="onImgError" />
          <div class="card-info">
            <div class="card-name">{{ p.product_name }}</div>
            <div class="card-price">
              {{ priceHtml(p).discounted }}
              <span v-if="priceHtml(p).original" class="original">{{ priceHtml(p).original }}</span>
            </div>
            <div v-if="colorDots(p).length" class="card-color">
              <span v-for="code in colorDots(p)" :key="code" class="color-dot" :style="{ background: code }"></span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  overflow-x: auto;
  border-bottom: 1px solid #f0f0f0;
  scrollbar-width: none;
}
.filter-bar::-webkit-scrollbar {
  display: none;
}
.filter-chip {
  padding: 6px 16px;
  border: 1px solid #ddd;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  background: #fff;
  color: #333;
  white-space: nowrap;
  transition: all 0.15s;
  font-family: inherit;
}
.filter-chip.selected {
  border-color: #333;
  background: #333;
  color: #fff;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 2px;
  align-items: stretch;
}
@media (min-width: 600px) {
  .product-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 12px 5px;
  }
}
@media (min-width: 900px) {
  .product-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 12px 5px;
  }
}

.product-card {
  background: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.product-card:hover .card-img {
  opacity: 0.9;
}
.card-img {
  width: 100%;
  aspect-ratio: 6 / 9;
  object-fit: cover;
  display: block;
  background: #f5f5f5;
  transition: opacity 0.2s;
  flex-shrink: 0;
}
.card-info {
  padding: 10px 12px 14px;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}
.card-name {
  font-size: 13px;
  color: #333;
  margin-bottom: 6px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  overflow: hidden;
  max-height: 2.8em;
}
.card-price {
  font-size: 13px;
  color: #333;
}
.card-price .original {
  font-size: 12px;
  color: #aaa;
  text-decoration: line-through;
  margin-left: 6px;
}
.card-color {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}
.color-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid #ddd;
}

.empty {
  padding: 60px 24px;
  text-align: center;
  color: #aaa;
  font-size: 14px;
  grid-column: 1 / -1;
  background: #fff;
}
</style>
