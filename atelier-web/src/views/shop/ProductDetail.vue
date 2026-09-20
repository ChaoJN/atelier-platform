<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import type { Product, OrderItem } from '@atelier/types'
import { apiFetch } from '@/composables/useApi'
import { useCartStore } from '@/stores/cart'
import { useModal } from '@/composables/useModal'

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
const SIZE_ORDER: Record<string, number> = { FREE: 0, F: 0, XS: 1, S: 2, M: 3, L: 4, XL: 5, '2XL': 6 }

const route = useRoute()
const cart = useCartStore()
const { alert } = useModal()

const product = ref<Product | null>(null)
const loading = ref(true)
const loadFailed = ref(false)

const currentImageIndex = ref(0)
const selectedColorCode = ref<string | null>(null)
const selectedSize = ref<string | null>(null)
const sizeChartOpen = ref(false)
const fittingOpen = ref(false)

const variants = computed(() => product.value?.product_variants ?? [])
const images = computed(() => product.value?.image_urls ?? [])

const colors = computed(() => {
  const map = new Map<string, { color_code: string; color: string | null }>()
  for (const v of variants.value) {
    if (v.color_code && !map.has(v.color_code)) {
      map.set(v.color_code, { color_code: v.color_code, color: v.color })
    }
  }
  return [...map.values()]
})

const selectedColorName = computed(
  () => colors.value.find((c) => c.color_code === selectedColorCode.value)?.color ?? ''
)

const hasSizes = computed(() => variants.value.some((v) => v.size))

const sizeOptions = computed(() => {
  const relevant = selectedColorCode.value
    ? variants.value.filter((v) => v.color_code === selectedColorCode.value)
    : variants.value

  const sizeMap = new Map<string, boolean>()
  for (const v of relevant) {
    if (!v.size) continue
    if (!sizeMap.has(v.size)) sizeMap.set(v.size, false)
    if (v.is_available) sizeMap.set(v.size, true)
  }

  return [...sizeMap.entries()]
    .map(([size, available]) => ({ size, available }))
    .sort((a, b) => {
      const wa = SIZE_ORDER[a.size.toUpperCase()] ?? 999
      const wb = SIZE_ORDER[b.size.toUpperCase()] ?? 999
      return wa - wb
    })
})

const priceInfo = computed(() => {
  if (!product.value) return { current: 0, original: null as number | null }
  if (product.value.is_discount && product.value.discount_rate) {
    return {
      current: Math.round(product.value.price * (product.value.discount_rate / 100)),
      original: product.value.price,
    }
  }
  return { current: product.value.price, original: null }
})

const sizeChartHeaders = computed(() => {
  const rows = product.value?.size_chart
  return rows && rows.length > 0 ? Object.keys(rows[0]) : []
})

const fittingRows = computed(() => product.value?.fitting_chart ?? [])
const fittingHeaders = computed(() => (fittingRows.value.length > 0 ? Object.keys(fittingRows.value[0]) : []))

function swatchBorder(code: string) {
  return code.toLowerCase() === '#ffffff' ? '#eee' : code
}

function selectColor(code: string) {
  selectedColorCode.value = code
  selectedSize.value = null // 換顏色要重新選尺寸
}

function selectSize(size: string, available: boolean) {
  if (!available) return
  selectedSize.value = size
}

function selectThumb(idx: number) {
  currentImageIndex.value = idx
}

function prevImage() {
  currentImageIndex.value = (currentImageIndex.value - 1 + images.value.length) % images.value.length
}

function nextImage() {
  currentImageIndex.value = (currentImageIndex.value + 1) % images.value.length
}

function onImgError(e: Event) {
  ;(e.target as HTMLImageElement).src = BLANK
}

async function addToCart() {
  if (!product.value) return
  if (hasSizes.value && !selectedSize.value) {
    await alert('請選擇尺寸')
    return
  }

  const colorVariant = variants.value.find((v) => v.color_code === selectedColorCode.value)
  const item: OrderItem = {
    productId: product.value.id,
    productName: product.value.product_name,
    price: priceInfo.value.current,
    originalPrice: product.value.is_discount ? product.value.price : null,
    image: product.value.image_urls?.[0] ?? '',
    colorCode: selectedColorCode.value,
    color: colorVariant?.color ?? null,
    size: selectedSize.value,
    quantity: 1,
  }

  cart.addItem(item)
  cart.openDrawer()
}

async function load() {
  loading.value = true
  loadFailed.value = false
  currentImageIndex.value = 0
  selectedColorCode.value = null
  selectedSize.value = null
  try {
    const { data } = await apiFetch<{ success: true; data: Product }>(`/api/products/${route.params.id}`)
    product.value = data
    if (colors.value.length > 0) selectedColorCode.value = colors.value[0].color_code
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => route.params.id, load)
</script>

<template>
  <div v-if="loading" class="state-msg">載入中...</div>
  <div v-else-if="loadFailed || !product" class="state-msg">載入商品失敗</div>
  <div v-else class="detail-wrap">
    <div class="gallery">
      <div class="main-img-wrap">
        <img :src="images[currentImageIndex] ?? BLANK" :alt="product.product_name" @error="onImgError" />
        <template v-if="images.length > 1">
          <div class="img-nav prev" @click="prevImage"><div class="img-nav-arrow">‹</div></div>
          <div class="img-nav next" @click="nextImage"><div class="img-nav-arrow">›</div></div>
        </template>
      </div>
      <div v-if="images.length > 0" class="thumb-row">
        <img
          v-for="(url, i) in images"
          :key="i"
          class="thumb"
          :class="{ active: i === currentImageIndex }"
          :src="url"
          @error="onImgError"
          @click="selectThumb(i)"
        />
      </div>
    </div>

    <div class="info">
      <div class="info-name">{{ product.product_name }}</div>
      <div class="info-price">
        NT$ {{ priceInfo.current }}
        <span v-if="priceInfo.original" class="price-original">NT$ {{ priceInfo.original }}</span>
      </div>

      <div v-if="colors.length > 0">
        <div class="section-label">
          COLOR
          <span style="text-transform: none; letter-spacing: 0">- {{ selectedColorName }}</span>
        </div>
        <div class="color-picker">
          <span
            v-for="c in colors"
            :key="c.color_code"
            class="color-swatch"
            :class="{ selected: c.color_code === selectedColorCode }"
            :style="{ background: c.color_code, borderColor: swatchBorder(c.color_code) }"
            :title="c.color ?? ''"
            @click="selectColor(c.color_code)"
          ></span>
        </div>
      </div>

      <div v-if="hasSizes">
        <div class="section-label" style="display: flex; justify-content: space-between; align-items: center">
          <span>SIZE</span>
          <button v-if="sizeChartHeaders.length" class="size-chart-link" @click="sizeChartOpen = true">
            尺寸表
          </button>
        </div>
        <div class="size-picker">
          <span v-if="sizeOptions.length === 0" style="font-size: 13px; color: #aaa">此顏色無可選尺寸</span>
          <template v-else>
            <button
              v-for="opt in sizeOptions"
              :key="opt.size"
              class="size-btn"
              :class="{ selected: opt.size === selectedSize, unavailable: !opt.available }"
              @click="selectSize(opt.size, opt.available)"
            >
              {{ opt.size }}
            </button>
          </template>
        </div>
      </div>

      <button class="add-to-cart" @click="addToCart">加入購物車</button>

      <div>
        <button type="button" class="info-label fitting-toggle" @click="fittingOpen = !fittingOpen">
          FITTING REPORT
          <svg
            class="fitting-caret"
            :class="{ open: fittingOpen }"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div v-if="fittingOpen" class="fitting-body">
          <p v-if="fittingRows.length === 0" class="fitting-empty">尚未有試穿報告，來當第 1 位衝鋒者吧 .ᐟ.ᐟ.ᐟ</p>
          <div v-else class="size-table-scroll">
            <table class="size-table">
              <thead>
                <tr>
                  <th v-for="h in fittingHeaders" :key="h">{{ h }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in fittingRows" :key="i">
                  <td v-for="h in fittingHeaders" :key="h">{{ row[h] ?? '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-if="product.description">
        <div class="info-label">DESCRIPTION</div>
        <div class="info-description">{{ product.description }}</div>
      </div>
    </div>
  </div>

  <!-- 尺寸表 Modal -->
  <div v-if="sizeChartOpen" class="modal-overlay show" @click="sizeChartOpen = false">
    <div class="modal-box" @click.stop>
      <div class="modal-header">
        <span class="modal-title">尺寸表</span>
        <button class="modal-close" @click="sizeChartOpen = false">✕</button>
      </div>
      <div class="modal-body">
        <div class="size-table-scroll">
          <table class="size-table">
            <thead>
              <tr>
                <th v-for="h in sizeChartHeaders" :key="h">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in product?.size_chart ?? []" :key="i">
                <td v-for="h in sizeChartHeaders" :key="h">{{ row[h] ?? '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-wrap {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 24px 64px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 32px;
}
@media (min-width: 768px) {
  .detail-wrap {
    grid-template-columns: 1fr 1fr;
    gap: 48px;
    align-items: start;
  }
}

.gallery {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.main-img-wrap {
  width: 100%;
  aspect-ratio: 6 / 9;
  background: #f5f5f5;
  overflow: hidden;
  position: relative;
  cursor: pointer;
}
.main-img-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: opacity 0.2s;
}
.img-nav {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  display: flex;
  align-items: center;
  opacity: 1;
  cursor: pointer;
}
.img-nav.prev {
  left: 0;
  justify-content: flex-start;
  padding-left: 12px;
}
.img-nav.next {
  right: 0;
  justify-content: flex-end;
  padding-right: 12px;
}
.img-nav-arrow {
  background: transparent;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  font-size: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.thumb-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}
.thumb-row::-webkit-scrollbar {
  display: none;
}
.thumb {
  width: 64px;
  aspect-ratio: 6 / 9;
  object-fit: cover;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s;
  flex-shrink: 0;
  background: #f5f5f5;
}
.thumb.active,
.thumb:hover {
  opacity: 1;
}

.info {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0; /* 跟 .gallery 一樣：grid item 預設不會縮小到比內容窄，寬表格會把整頁撐寬，要顯式取消這個下限 */
}
.info-name {
  font-size: 22px;
  font-weight: bold;
  line-height: 1.4;
  letter-spacing: 0.5px;
}
.info-price {
  font-size: 18px;
  font-weight: bold;
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.price-original {
  font-size: 14px;
  color: #aaa;
  text-decoration: line-through;
  font-weight: normal;
}
.section-label {
  font-size: 12px;
  letter-spacing: 1px;
  color: #888;
  margin-bottom: 10px;
  text-transform: uppercase;
}

.color-picker {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}
.color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: outline-color 0.15s;
  display: inline-block;
}
.color-swatch.selected {
  outline-color: #333;
}

.size-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.size-btn {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  background: #fff;
  color: #333;
  transition: border-color 0.15s, background 0.15s;
  min-width: 52px;
  text-align: center;
}
.size-btn:hover:not(.unavailable) {
  border-color: #333;
}
.size-btn.selected {
  border-color: #333;
  background: #333;
  color: #fff;
}
.size-btn.unavailable {
  color: #ccc;
  border-color: #eee;
  cursor: not-allowed;
  text-decoration: line-through;
}

.size-chart-link {
  font-size: 12px;
  color: #888;
  text-decoration: underline;
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
  padding: 0;
}
.size-chart-link:hover {
  color: #333;
}

.add-to-cart {
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
.add-to-cart:hover {
  background: #000;
}

.info-label {
  font-size: 14px;
  letter-spacing: 1px;
  color: #888;
  text-transform: uppercase;
  border-top: #aaa solid 1px;
  padding-top: 15px;
}
.fitting-toggle {
  background: none;
  border: none;
  /* 只重設 font-family（瀏覽器 <button> 預設字型跟頁面不同），
     不要用 font: inherit 整組重設，那會連 font-size 一起蓋掉，
     蓋掉 .info-label 原本設定的 14px，讓這顆按鈕字級跑掉 */
  font-family: inherit;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 15px 0 0;
  margin: 0;
}
.fitting-caret {
  flex-shrink: 0;
  transition: transform 0.2s;
  color: #888;
  margin-right: 10px;
}
.fitting-caret.open {
  transform: rotate(180deg);
}
.fitting-body {
  padding-top: 10px;
  margin-left: 10px;
  margin-right: 10px;
}
.fitting-empty {
  font-size: 14px;
  color: #888;
  text-align: center;
  padding: 16px 0;
  margin: 0;
}
.info-description {
  font-size: 14px;
  line-height: 1.6;
  color: #555;
  white-space: pre-wrap;
  margin-left: 10px;
  margin-right: 10px;
  padding-top: 10px;
}

.state-msg {
  padding: 80px 24px;
  text-align: center;
  color: #aaa;
  font-size: 15px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.modal-box {
  background: #fff;
  border-radius: 8px;
  width: 100%;
  max-width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 28px 24px 20px;
  flex-shrink: 0; /* 標題列固定不動，內容捲動時不會跟著跑 */
}
.modal-title {
  font-size: 15px;
  font-weight: bold;
}
.modal-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #888;
  line-height: 1;
}
.modal-body {
  padding: 0 24px 28px;
  overflow-y: auto; /* 內容太高時，這裡捲動，不會捲到 modal-header */
}
.size-table-scroll {
  overflow-x: auto; /* 欄位太多時橫向捲動，不會把 modal 撐寬 */
}
.size-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.size-table th,
.size-table td {
  padding: 10px 12px;
  text-align: center;
  border-bottom: 1px solid #f0f0f0;
  white-space: nowrap;
}
.size-table thead th {
  font-weight: bold;
  color: #555;
  font-size: 12px;
  letter-spacing: 0.5px;
}
.size-table tbody tr:last-child td {
  border-bottom: none;
}
</style>
