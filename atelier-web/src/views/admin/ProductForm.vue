<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import Sortable from 'sortablejs'
import type { AdminProduct, Category } from '@atelier/types'
import { adminApiFetch } from '@/composables/useApi'
import { useAdminGuard } from '@/composables/useAdminGuard'
import { useModal } from '@/composables/useModal'

interface ImageItem {
  key: number
  previewUrl: string
  blob: Blob | null // 新上傳（本機還沒送出）才有 blob
  remoteUrl: string | null // 既有（已經在後端）的圖片才有這個
}

interface VariantRow {
  key: number
  id: number | null // 既有規格才有真正的 DB id
  color: string
  colorCode: string
  size: string
  isAvailable: boolean
  originalIsAvailable: boolean | null // 用來判斷是否真的改過，只有改過才 PUT
  state: 'existing' | 'new' | 'deleted'
}

interface SizeChartColumn {
  key: number
  name: string
}

interface SizeChartRow {
  key: number
  cells: Record<number, string> // 用 column.key 對應，不是欄位名稱，改欄位名稱或拖曳排序都不用搬動這裡的資料
}

const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/

const route = useRoute()
const router = useRouter()
const { handleAuthError } = useAdminGuard()
const { alert, confirm } = useModal()

const isEditMode = computed(() => !!route.params.id)

// ── 分類（真的打 API，跟商品本身的讀寫分開處理）──
const categories = ref<Category[]>([])
async function loadCategories() {
  try {
    const { data } = await adminApiFetch<{ success: true; data: Category[] }>('/api/admin/categories')
    categories.value = data
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) await handleAuthError()
  }
}

// ── 表單欄位 ──
const productName = ref('')
const productCode = ref('')
const selectedCategoryIds = reactive(new Set<number>())
const description = ref('')
// Vue 對 type="number" 的 input 用 v-model 時，即使沒寫 .number 修飾符，
// 有輸入內容時也會自動把值轉成 number（空字串則維持字串），型別要誠實寫成 string | number
const price = ref<string | number>('')
const costPrice = ref<string | number>('')
const isDiscount = ref(false)
const discountRate = ref<string | number>('')
const isActive = ref(false)
const createdAt = ref<string | null>(null)
const updatedAt = ref<string | null>(null)

function formatDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('zh-TW') : '-'
}

function toggleCategory(id: number) {
  if (selectedCategoryIds.has(id)) selectedCategoryIds.delete(id)
  else selectedCategoryIds.add(id)
}

// ── 欄位驗證錯誤狀態（紅框）──
const invalid = reactive<Record<string, boolean>>({})
const productNameEl = ref<HTMLInputElement>()
const priceEl = ref<HTMLInputElement>()
const costPriceEl = ref<HTMLInputElement>()
const discountRateEl = ref<HTMLInputElement>()
const variantColorEl = ref<HTMLInputElement>()

function clearInvalid(field: string) {
  invalid[field] = false
}

// ── 圖片 ──
const images = ref<ImageItem[]>([])
const removedImageUrls = ref<string[]>([]) // 編輯模式移除既有圖片時，記錄下來，儲存時才知道要打哪些 DELETE
let imageKeySeq = 0
const fileInput = ref<HTMLInputElement>()
const imagesContainer = ref<HTMLElement>()
let sortable: Sortable | null = null

const previewOverlaySrc = ref<string | null>(null)
function previewImage(url: string) {
  previewOverlaySrc.value = url
}

// 裁切 modal
const cropOverlayOpen = ref(false)
const cropImgEl = ref<HTMLImageElement>()
let cropper: Cropper | null = null
let cropResolve: ((blob: Blob | null) => void) | null = null
let cropObjectUrl: string | null = null

function openCrop(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    cropResolve = resolve
    cropObjectUrl = URL.createObjectURL(file)
    cropOverlayOpen.value = true
    nextTick(() => {
      const img = cropImgEl.value
      if (!img) return
      img.onload = () => {
        cropper?.destroy()
        cropper = new Cropper(img, { aspectRatio: 6 / 9, viewMode: 1, autoCropArea: 1 })
      }
      img.src = cropObjectUrl!
    })
  })
}

function cancelCrop() {
  cropOverlayOpen.value = false
  cropper?.destroy()
  cropper = null
  if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl)
  cropResolve?.(null)
  cropResolve = null
}

function confirmCrop() {
  if (!cropper) return
  const canvas = cropper.getCroppedCanvas({ maxWidth: 1200 })
  canvas.toBlob(
    (blob) => {
      cropOverlayOpen.value = false
      cropper?.destroy()
      cropper = null
      if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl)
      cropResolve?.(blob)
      cropResolve = null
    },
    'image/jpeg',
    0.85
  )
}

async function handleImageUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  const maxSize = 5 * 1024 * 1024

  for (const file of files) {
    if (!allowed.includes(file.type)) {
      await alert(`${file.name} 格式不支援，請上傳 JPG、PNG、WebP 或 SVG`)
      continue
    }
    if (file.size > maxSize) {
      await alert(`${file.name} 超過 5MB 限制`)
      continue
    }

    const blob = await openCrop(file)
    if (!blob) continue

    const previewUrl = URL.createObjectURL(blob)
    images.value.push({ key: imageKeySeq++, previewUrl, blob, remoteUrl: null })
  }

  input.value = ''
}

function deleteImage(item: ImageItem) {
  if (item.blob) URL.revokeObjectURL(item.previewUrl) // 只有本機 blob 產生的預覽網址才需要釋放
  if (item.remoteUrl) removedImageUrls.value.push(item.remoteUrl)
  images.value = images.value.filter((i) => i.key !== item.key)
}

// ── 尺寸表 ──
const sizeColumns = ref<SizeChartColumn[]>([])
const sizeRows = ref<SizeChartRow[]>([])
let sizeColKeySeq = 0
let sizeRowKeySeq = 0
const sizeColumnsWrap = ref<HTMLElement>()
let sizeSortable: Sortable | null = null

function addSizeColumn() {
  const key = sizeColKeySeq++
  sizeColumns.value.push({ key, name: '' })
  for (const row of sizeRows.value) row.cells[key] = ''
}

function deleteSizeColumn(col: SizeChartColumn) {
  sizeColumns.value = sizeColumns.value.filter((c) => c.key !== col.key)
  for (const row of sizeRows.value) delete row.cells[col.key]
}

function addSizeRow() {
  const cells: Record<number, string> = {}
  for (const col of sizeColumns.value) cells[col.key] = ''
  sizeRows.value.push({ key: sizeRowKeySeq++, cells })
}

function deleteSizeRow(row: SizeChartRow) {
  sizeRows.value = sizeRows.value.filter((r) => r.key !== row.key)
}

// 欄位名稱是空的，或跟別的欄位重複（去頭尾空白後比對），都算不合法
function sizeColumnInvalid(col: SizeChartColumn): boolean {
  const name = col.name.trim()
  if (!name) return true
  return sizeColumns.value.filter((c) => c.name.trim() === name).length > 1
}

// 編輯模式下，表格要等 loadProduct 讀完資料、DOM 真的畫出 <tr> 才能掛 Sortable，
// 所以這裡用 guard 擋重複建立，讓 onMounted 跟 loadProduct 讀完後都能各呼叫一次
function initSizeSortable() {
  if (sizeSortable || !sizeColumnsWrap.value) return
  sizeSortable = Sortable.create(sizeColumnsWrap.value, {
    handle: '.size-drag-handle',
    draggable: '.size-column',
    animation: 150,
    onEnd(evt) {
      if (evt.oldIndex === undefined || evt.newIndex === undefined) return
      const moved = sizeColumns.value.splice(evt.oldIndex, 1)[0]
      sizeColumns.value.splice(evt.newIndex, 0, moved)
    },
  })
}

// ── 試穿報告 ──
const FITTING_DEFAULT_HEADERS = ['試穿人員', '身高 (cm)', '體重 (kg)', '身形', '著用', '試穿感受']

const fittingColumns = ref<SizeChartColumn[]>([])
const fittingRows = ref<SizeChartRow[]>([])
let fittingColKeySeq = 0
let fittingRowKeySeq = 0
const fittingColumnsWrap = ref<HTMLElement>()
let fittingSortable: Sortable | null = null

function addFittingColumn() {
  const key = fittingColKeySeq++
  fittingColumns.value.push({ key, name: '' })
  for (const row of fittingRows.value) row.cells[key] = ''
}

function deleteFittingColumn(col: SizeChartColumn) {
  fittingColumns.value = fittingColumns.value.filter((c) => c.key !== col.key)
  for (const row of fittingRows.value) delete row.cells[col.key]
}

function addFittingRow() {
  const cells: Record<number, string> = {}
  for (const col of fittingColumns.value) cells[col.key] = ''
  fittingRows.value.push({ key: fittingRowKeySeq++, cells })
}

function deleteFittingRow(row: SizeChartRow) {
  fittingRows.value = fittingRows.value.filter((r) => r.key !== row.key)
}

function fittingColumnInvalid(col: SizeChartColumn): boolean {
  const name = col.name.trim()
  if (!name) return true
  return fittingColumns.value.filter((c) => c.name.trim() === name).length > 1
}

function initFittingSortable() {
  if (fittingSortable || !fittingColumnsWrap.value) return
  fittingSortable = Sortable.create(fittingColumnsWrap.value, {
    handle: '.size-drag-handle',
    draggable: '.size-column',
    animation: 150,
    onEnd(evt) {
      if (evt.oldIndex === undefined || evt.newIndex === undefined) return
      const moved = fittingColumns.value.splice(evt.oldIndex, 1)[0]
      fittingColumns.value.splice(evt.newIndex, 0, moved)
    },
  })
}

// 新增商品、或編輯商品但這個商品還沒有任何試穿報告資料時，先給一個預設骨架方便填寫，不用從 0 個欄位開始建
function initFittingDefault() {
  const columns = FITTING_DEFAULT_HEADERS.map((name) => ({ key: fittingColKeySeq++, name }))
  fittingColumns.value = columns
  fittingRows.value = [{ key: fittingRowKeySeq++, cells: Object.fromEntries(columns.map((c) => [c.key, ''])) }]
}

onMounted(() => {
  loadCategories()
  if (isEditMode.value) loadProduct(route.params.id as string)
  else initFittingDefault() // 新增商品：直接給試穿報告預設骨架
  nextTick(() => {
    if (imagesContainer.value) {
      sortable = Sortable.create(imagesContainer.value, {
        handle: '.img-drag-handle',
        draggable: '.img-wrapper',
        animation: 150,
        onEnd(evt) {
          if (evt.oldIndex === undefined || evt.newIndex === undefined) return
          const moved = images.value.splice(evt.oldIndex, 1)[0]
          images.value.splice(evt.newIndex, 0, moved)
        },
      })
    }
    initSizeSortable()
    initFittingSortable()
  })
})

onBeforeUnmount(() => {
  sortable?.destroy()
  sizeSortable?.destroy()
  fittingSortable?.destroy()
  for (const img of images.value) {
    if (img.blob) URL.revokeObjectURL(img.previewUrl)
  }
})

// ── 規格 ──
const variants = ref<VariantRow[]>([])
let variantKeySeq = 0
const vColor = ref('')
const vColorCode = ref('') // 空字串代表還沒選色，跟舊版一樣顯示虛線圓圈，不要一開始就填一個看起來像使用者選過的灰色
const vSize = ref('')
const vIsAvailable = ref(true)
const colorPickerInput = ref<HTMLInputElement>()

function onColorPickerInput(e: Event) {
  vColorCode.value = (e.target as HTMLInputElement).value.toUpperCase()
}

async function addVariant() {
  const color = vColor.value.trim().toUpperCase()
  const colorCode = vColorCode.value.trim().toUpperCase()
  const size = vSize.value.trim().toUpperCase()

  if (!colorCode || !color || !size) {
    invalid.variantColor = true
    invalid.variantSize = true
    variantColorEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    await alert('顏色和尺寸為必填')
    return
  }
  if (!HEX_RE.test(colorCode)) {
    invalid.variantColorCode = true
    await alert('請填入 HEX 代碼，或點擊顏色選擇器。')
    return
  }

  variants.value.push({
    key: variantKeySeq++,
    id: null,
    color,
    colorCode,
    size,
    isAvailable: vIsAvailable.value,
    originalIsAvailable: null,
    state: 'new',
  })
  vColor.value = ''
  vColorCode.value = ''
  vSize.value = ''
  vIsAvailable.value = true
}

async function deleteVariant(row: VariantRow) {
  const ok = await confirm('確定要刪除這筆規格嗎？', { confirmText: '確認刪除', danger: true })
  if (!ok) return
  if (row.state === 'new') {
    // 新增但還沒儲存過，直接從畫面移除即可
    variants.value = variants.value.filter((v) => v.key !== row.key)
  } else {
    // 既有規格：先標記刪除、畫面上隱藏，實際的 DELETE 留到儲存時一起打
    row.state = 'deleted'
  }
}

// ── 儲存 ──
const saving = ref(false)

async function save() {
  if (!productName.value.trim()) {
    invalid.productName = true
    productNameEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    productNameEl.value?.focus()
    return
  }

  const priceVal = Number(price.value)
  if (price.value === '' || isNaN(priceVal) || priceVal <= 0 || !Number.isInteger(priceVal)) {
    invalid.price = true
    priceEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    priceEl.value?.focus()
    return
  }

  const costVal = Number(costPrice.value)
  if (costPrice.value === '' || isNaN(costVal) || costVal <= 0 || !Number.isInteger(costVal)) {
    invalid.costPrice = true
    costPriceEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    costPriceEl.value?.focus()
    return
  }

  const discountVal = Number(discountRate.value)
  if (
    isDiscount.value &&
    (discountRate.value === '' || isNaN(discountVal) || !Number.isInteger(discountVal) || discountVal < 0 || discountVal > 100)
  ) {
    invalid.discountRate = true
    discountRateEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    discountRateEl.value?.focus()
    return
  }

  const liveVariants = variants.value.filter((v) => v.state !== 'deleted')
  if (liveVariants.length === 0) {
    invalid.variantColor = true
    invalid.variantSize = true
    invalid.variantColorCode = true
    variantColorEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }

  if (sizeColumns.value.some((c) => sizeColumnInvalid(c))) {
    await alert('尺寸表欄位名稱不能是空的或重複，請檢查後再儲存。')
    return
  }

  if (fittingColumns.value.some((c) => fittingColumnInvalid(c))) {
    await alert('試穿報告欄位名稱不能是空的或重複，請檢查後再儲存。')
    return
  }

  const ok = await confirm(isEditMode.value ? '確定要儲存這項商品嗎？' : '確定要新增這項商品嗎？', {
    confirmText: isEditMode.value ? '確認儲存' : '確認新增',
  })
  if (!ok) return

  saving.value = true
  try {
    const sizeChart =
      sizeColumns.value.length === 0
        ? null
        : sizeRows.value.map((row) => {
            const obj: Record<string, string> = {}
            for (const col of sizeColumns.value) obj[col.name.trim()] = (row.cells[col.key] ?? '').trim()
            return obj
          })

    // 跟尺寸表不同：試穿報告一開始就有預設骨架，如果整份都沒填過任何內容，
    // 存成一筆全空字串的資料會讓前台誤判成「有資料」，顯示一列空白，而不是鼓勵語，所以整份都空白時要存 null
    const fittingChart = (() => {
      if (fittingColumns.value.length === 0) return null
      const rows = fittingRows.value.map((row) => {
        const obj: Record<string, string> = {}
        for (const col of fittingColumns.value) obj[col.name.trim()] = (row.cells[col.key] ?? '').trim()
        return obj
      })
      return rows.some((row) => Object.values(row).some((v) => v !== '')) ? rows : null
    })()

    const payload = {
      product_name: productName.value.trim(),
      product_code: productCode.value.trim() || null,
      category: [...selectedCategoryIds],
      description: description.value.trim() || null,
      price: priceVal,
      cost_price: costVal,
      is_discount: isDiscount.value,
      discount_rate: isDiscount.value ? discountVal : null,
      is_active: isActive.value,
      size_chart: sizeChart,
      fitting_chart: fittingChart,
    }

    const productId = isEditMode.value ? Number(route.params.id) : await createProduct(payload)
    if (isEditMode.value) await updateProduct(productId, payload)

    const finalImageUrls = await syncImages(productId)
    if (finalImageUrls) {
      await adminApiFetch(`/api/admin/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ image_urls: finalImageUrls }),
      })
    }

    await syncVariants(productId)

    router.push('/admin/products')
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) return handleAuthError()
    await alert(`儲存失敗：${(err as Error).message}`)
  } finally {
    saving.value = false
  }
}

async function createProduct(payload: Record<string, unknown>): Promise<number> {
  const { data } = await adminApiFetch<{ success: true; data: { id: number } }>('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.id
}

async function updateProduct(id: number, payload: Record<string, unknown>) {
  await adminApiFetch(`/api/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

// 刪除被移除的既有圖片、上傳新圖片，回傳畫面上目前順序對應的最終網址陣列
async function syncImages(productId: number): Promise<string[] | null> {
  if (images.value.length === 0 && removedImageUrls.value.length === 0) return null

  for (const url of removedImageUrls.value) {
    await adminApiFetch(`/api/upload/products/${productId}/images`, {
      method: 'DELETE',
      body: JSON.stringify({ url }),
    })
  }

  const finalUrls: string[] = []
  for (const img of images.value) {
    if (img.remoteUrl) {
      finalUrls.push(img.remoteUrl)
    } else if (img.blob) {
      const formData = new FormData()
      formData.append('image', img.blob, 'cropped.jpg') // 檔名後端不會用，會自己重新產生
      const { url } = await adminApiFetch<{ success: true; url: string }>(
        `/api/upload/products/${productId}/images`,
        { method: 'POST', body: formData }
      )
      finalUrls.push(url)
    }
  }
  return finalUrls
}

async function syncVariants(productId: number) {
  for (const row of variants.value) {
    if (row.state === 'new') {
      await adminApiFetch(`/api/admin/products/${productId}/variants`, {
        method: 'POST',
        body: JSON.stringify({ color: row.color, color_code: row.colorCode, size: row.size, is_available: row.isAvailable }),
      })
    } else if (row.state === 'deleted') {
      await adminApiFetch(`/api/admin/products/${productId}/variants/${row.id}`, { method: 'DELETE' })
    } else if (row.state === 'existing' && row.isAvailable !== row.originalIsAvailable) {
      // 後端 PUT 會整筆覆蓋，要帶完整欄位，不能只送 is_available，否則其他欄位會被蓋成 undefined
      await adminApiFetch(`/api/admin/products/${productId}/variants/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify({ color: row.color, color_code: row.colorCode, size: row.size, is_available: row.isAvailable }),
      })
    }
  }
}

// ── 編輯模式：讀取既有商品 ──
const productLoading = ref(false)

async function loadProduct(id: string) {
  productLoading.value = true
  try {
    const { data } = await adminApiFetch<{ success: true; data: AdminProduct }>(`/api/admin/products/${id}`)
    productName.value = data.product_name
    productCode.value = data.product_code ?? ''
    for (const catId of data.category ?? []) selectedCategoryIds.add(catId)
    description.value = data.description ?? ''
    price.value = data.price
    costPrice.value = data.cost_price
    isDiscount.value = data.is_discount
    discountRate.value = data.discount_rate ?? ''
    isActive.value = data.is_active
    createdAt.value = data.created_at
    updatedAt.value = data.updated_at

    images.value = (data.image_urls ?? []).map((url) => ({
      key: imageKeySeq++,
      previewUrl: url,
      blob: null,
      remoteUrl: url,
    }))

    variants.value = (data.product_variants ?? []).map((v) => ({
      key: variantKeySeq++,
      id: v.id,
      color: v.color ?? '',
      colorCode: v.color_code ?? '',
      size: v.size ?? '',
      isAvailable: v.is_available,
      originalIsAvailable: v.is_available,
      state: 'existing' as const,
    }))

    const chartRows = data.size_chart ?? []
    if (chartRows.length > 0) {
      const columns = Object.keys(chartRows[0]).map((name) => ({ key: sizeColKeySeq++, name }))
      sizeColumns.value = columns
      sizeRows.value = chartRows.map((row) => ({
        key: sizeRowKeySeq++,
        cells: Object.fromEntries(columns.map((c) => [c.key, row[c.name] ?? ''])),
      }))
    }

    const fittingChartRows = data.fitting_chart ?? []
    if (fittingChartRows.length > 0) {
      const columns = Object.keys(fittingChartRows[0]).map((name) => ({ key: fittingColKeySeq++, name }))
      fittingColumns.value = columns
      fittingRows.value = fittingChartRows.map((row) => ({
        key: fittingRowKeySeq++,
        cells: Object.fromEntries(columns.map((c) => [c.key, row[c.name] ?? ''])),
      }))
    } else {
      initFittingDefault() // 這個商品還沒有試穿報告資料，一樣給預設骨架，不用從 0 個欄位開始建
    }
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) {
      await handleAuthError()
      return
    }
    await alert('讀取商品失敗，請再試一次。')
    router.push('/admin/products')
  } finally {
    productLoading.value = false
    nextTick(initSizeSortable)
    nextTick(initFittingSortable)
  }
}
</script>

<template>
  <h2 class="page-title">{{ isEditMode ? '編輯商品' : '新增商品' }}</h2>
  <p v-if="productLoading" class="hint-text">載入中...</p>
  <template v-else>

  <div class="field">
    <label>商品名稱</label>
    <input
      ref="productNameEl"
      v-model="productName"
      type="text"
      placeholder="請輸入商品名稱"
      autocomplete="off"
      :class="{ invalid: invalid.productName }"
      @input="clearInvalid('productName')"
    />
  </div>

  <div class="field">
    <label>原商品名稱／貨號（選填）</label>
    <input v-model="productCode" type="text" autocomplete="off" />
  </div>

  <div class="field">
    <label>分類</label>
    <div class="category-options">
      <div v-if="categories.length === 0" class="hint-text">尚無分類，請先新增分類。</div>
      <button
        v-for="cat in categories"
        v-else
        :key="cat.id"
        type="button"
        class="category-chip"
        :class="{ selected: selectedCategoryIds.has(cat.id) }"
        @click="toggleCategory(cat.id)"
      >
        {{ cat.name }}
      </button>
    </div>
  </div>

  <div class="field">
    <label>商品描述／試穿心得</label>
    <textarea v-model="description" placeholder="請輸入商品描述"></textarea>
  </div>

  <div class="field">
    <label>售價</label>
    <input
      ref="priceEl"
      v-model="price"
      type="number"
      placeholder="請輸入售價"
      min="0"
      :class="{ invalid: invalid.price }"
      @input="clearInvalid('price')"
      @wheel="($event.target as HTMLElement).blur()"
    />
  </div>

  <div class="field">
    <label>成本</label>
    <input
      ref="costPriceEl"
      v-model="costPrice"
      type="number"
      placeholder="請輸入商品成本"
      min="0"
      :class="{ invalid: invalid.costPrice }"
      @input="clearInvalid('costPrice')"
      @wheel="($event.target as HTMLElement).blur()"
    />
  </div>

  <div class="field">
    <label>折扣</label>
    <div class="discount-row">
      <label class="switch">
        <input v-model="isDiscount" type="checkbox" @change="discountRate = ''" />
        <span class="slider"></span>
      </label>
      <input
        ref="discountRateEl"
        v-model="discountRate"
        type="number"
        min="0"
        max="100"
        class="discount-input"
        :disabled="!isDiscount"
        :class="{ invalid: invalid.discountRate }"
        @input="clearInvalid('discountRate')"
        @wheel="($event.target as HTMLElement).blur()"
      />%
    </div>
  </div>

  <div class="field">
    <label>狀態</label>
    <div class="category-options">
      <button type="button" class="category-chip" :class="{ selected: isActive }" @click="isActive = true">上架中</button>
      <button type="button" class="category-chip" :class="{ selected: !isActive }" @click="isActive = false">已下架</button>
    </div>
  </div>

  <div class="field">
    <label>圖片</label>
    <div ref="imagesContainer" class="images">
      <div v-for="img in images" :key="img.key" class="img-wrapper">
        <div class="img-drag-handle">⠿</div>
        <img :src="img.previewUrl" class="img-thumb" @click="previewImage(img.previewUrl)" />
        <button class="img-delete-btn" aria-label="刪除圖片" @click="deleteImage(img)">✕</button>
      </div>
      <button class="img-add-btn" type="button" @click="fileInput?.click()">+</button>
    </div>
    <input ref="fileInput" type="file" accept="image/*" multiple class="hidden-input" @change="handleImageUpload" />
  </div>

  <div class="field">
    <label>商品規格</label>
    <div class="variant-add-form">
      <div class="color-picker-group">
        <div
          class="color-dot color-dot-preview"
          :style="vColorCode ? { background: vColorCode } : { background: 'transparent', border: '2px dashed #555' }"
          @click="colorPickerInput?.click()"
        ></div>
        <input ref="colorPickerInput" type="color" value="#555555" class="hidden-color-input" @input="onColorPickerInput" />
        <input
          v-model="vColorCode"
          type="text"
          placeholder="#HEX"
          class="variant-input-field hex-input"
          maxlength="7"
          autocomplete="off"
          :class="{ invalid: invalid.variantColorCode }"
          @input="clearInvalid('variantColorCode')"
        />
      </div>
      <input
        ref="variantColorEl"
        v-model="vColor"
        type="text"
        placeholder="顏色名稱"
        class="variant-input-field color-name-input"
        autocomplete="off"
        :class="{ invalid: invalid.variantColor }"
        @input="clearInvalid('variantColor')"
      />
      <input
        v-model="vSize"
        type="text"
        placeholder="尺寸"
        class="variant-input-field size-input"
        autocomplete="off"
        :class="{ invalid: invalid.variantSize }"
        @input="clearInvalid('variantSize')"
      />
      <label class="switch">
        <input v-model="vIsAvailable" type="checkbox" />
        <span class="slider"></span>
      </label>
      <button class="variant-add-btn" type="button" @click="addVariant">+ 新增規格</button>
    </div>

    <div v-for="row in variants" v-show="row.state !== 'deleted'" :key="row.key" class="variant-row">
      <div class="color-dot" :style="{ background: row.colorCode }"></div>
      <input type="text" :value="row.colorCode" disabled class="variant-input hex-input" />
      <input type="text" :value="row.color" disabled class="variant-input color-name-input" />
      <input type="text" :value="row.size" disabled class="variant-input size-input" />
      <label class="switch">
        <input v-model="row.isAvailable" type="checkbox" />
        <span class="slider"></span>
      </label>
      <button class="variant-add-btn danger" type="button" @click="deleteVariant(row)">刪除</button>
    </div>
  </div>

  <div class="field">
    <label>尺寸表</label>
    <p v-if="sizeColumns.length === 0" class="hint-text">尚未新增欄位，點擊「+ 新增欄位」開始建立尺寸表。</p>
    <div v-else class="size-chart-scroll">
      <div class="size-chart-columns">
        <!-- 每一欄是一個直的 flex div（表頭+所有格子疊在一起），Sortable 才能把整欄當成一個節點拖，
             不會像 <table> 那樣每個 <tr> 各自獨立，拖曳時只有表頭那一格在動 -->
        <div ref="sizeColumnsWrap" class="size-columns-draggable">
          <div v-for="col in sizeColumns" :key="col.key" class="size-column">
            <div class="size-col-header">
              <span class="size-drag-handle">⠿</span>
              <input
                v-model="col.name"
                type="text"
                placeholder="欄位名稱"
                class="size-col-input"
                :class="{ invalid: sizeColumnInvalid(col) }"
              />
              <button type="button" class="size-del-btn" @click="deleteSizeColumn(col)">✕</button>
            </div>
            <div v-for="row in sizeRows" :key="row.key" class="size-col-cell">
              <input v-model="row.cells[col.key]" type="text" class="size-cell-input" />
            </div>
          </div>
        </div>
        <!-- 刪除列按鈕固定在最右邊，不參與拖曳排序 -->
        <div class="size-column size-column-fixed">
          <div class="size-col-header size-col-header-spacer"></div>
          <div v-for="row in sizeRows" :key="row.key" class="size-col-cell">
            <button type="button" class="size-del-btn" @click="deleteSizeRow(row)">✕</button>
          </div>
        </div>
      </div>
    </div>
    <div class="size-chart-actions">
      <button type="button" class="variant-add-btn" @click="addSizeColumn">+ 新增欄位</button>
      <button type="button" class="variant-add-btn" :disabled="sizeColumns.length === 0" @click="addSizeRow">
        + 新增列
      </button>
    </div>
  </div>

  <div class="field">
    <label>試穿報告</label>
    <p v-if="fittingColumns.length === 0" class="hint-text">尚未新增欄位，點擊「+ 新增欄位」開始建立試穿報告。</p>
    <div v-else class="size-chart-scroll">
      <div class="size-chart-columns">
        <div ref="fittingColumnsWrap" class="size-columns-draggable">
          <div v-for="col in fittingColumns" :key="col.key" class="size-column">
            <div class="size-col-header">
              <span class="size-drag-handle">⠿</span>
              <input
                v-model="col.name"
                type="text"
                placeholder="欄位名稱"
                class="size-col-input"
                :class="{ invalid: fittingColumnInvalid(col) }"
              />
              <button type="button" class="size-del-btn" @click="deleteFittingColumn(col)">✕</button>
            </div>
            <div v-for="row in fittingRows" :key="row.key" class="size-col-cell">
              <input v-model="row.cells[col.key]" type="text" class="size-cell-input" />
            </div>
          </div>
        </div>
        <div class="size-column size-column-fixed">
          <div class="size-col-header size-col-header-spacer"></div>
          <div v-for="row in fittingRows" :key="row.key" class="size-col-cell">
            <button type="button" class="size-del-btn" @click="deleteFittingRow(row)">✕</button>
          </div>
        </div>
      </div>
    </div>
    <div class="size-chart-actions">
      <button type="button" class="variant-add-btn" @click="addFittingColumn">+ 新增欄位</button>
      <button type="button" class="variant-add-btn" :disabled="fittingColumns.length === 0" @click="addFittingRow">
        + 新增列
      </button>
    </div>
  </div>

  <div v-if="isEditMode" class="field"><label>建立時間</label><div class="value">{{ formatDateTime(createdAt) }}</div></div>
  <div v-if="isEditMode" class="field"><label>更新時間</label><div class="value">{{ formatDateTime(updatedAt) }}</div></div>

  <button class="primary-btn" :disabled="saving" @click="save">儲存</button>
  <button class="secondary-btn" @click="router.push('/admin/products')">取消</button>
  </template>

  <!-- 圖片放大預覽 -->
  <div v-if="previewOverlaySrc" class="img-preview-overlay" @click="previewOverlaySrc = null">
    <img :src="previewOverlaySrc" />
  </div>

  <!-- 裁切 Modal -->
  <div v-if="cropOverlayOpen" class="crop-overlay">
    <div class="crop-container">
      <img ref="cropImgEl" />
    </div>
    <div class="crop-actions">
      <button class="admin-modal-btn" @click="cancelCrop">取消</button>
      <button class="admin-modal-btn" @click="confirmCrop">確認裁切</button>
    </div>
  </div>
</template>

<style scoped>
.page-title {
  margin: 0 0 24px;
  font-size: 18px;
  color: rgba(255, 255, 255, 0.9);
}
.edit-notice {
  font-size: 13px;
  color: #f59e0b;
  background: #3d2e00;
  padding: 10px 14px;
  border-radius: 8px;
  margin: 0 0 20px;
}

.field {
  margin-bottom: 16px;
}
.field label {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
}
.field input,
.field textarea {
  width: 100%;
  background-color: #1e1e1e;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 10px 12px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  font-family: inherit;
  box-sizing: border-box;
  outline: none;
}
.field input:focus,
.field textarea:focus {
  border-color: #666;
}
.field input.invalid {
  border-color: #ff7875;
}
.field textarea {
  resize: vertical;
  min-height: 80px;
}
.hint-text {
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
}
.field .value {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.9);
}

.category-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
.category-chip {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid #444;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}
.category-chip.selected {
  border-color: #fff;
  background: #fff;
  color: #000;
}

.discount-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
}
.discount-input {
  max-width: 100px;
  margin: 0;
}

.switch {
  position: relative;
  display: inline-block;
  width: 72px;
  height: 34px;
  flex-shrink: 0;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  inset: 0;
  background-color: #444;
  border-radius: 17px;
  cursor: pointer;
  transition: 0.3s;
}
.slider::before {
  content: '';
  position: absolute;
  width: 26px;
  height: 26px;
  left: 4px;
  top: 4px;
  background-color: #fff;
  border-radius: 50%;
  transition: 0.3s;
  z-index: 1;
}
.slider::after {
  content: 'OFF';
  position: absolute;
  left: 38px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: #aaa;
  font-weight: bold;
  transition: 0.3s;
}
.switch input:checked + .slider {
  background-color: #fff;
}
.switch input:checked + .slider::before {
  background-color: #444;
  transform: translateX(36px);
}
.switch input:checked + .slider::after {
  content: 'ON';
  left: 10px;
  color: #444;
}
.disabled-slider {
  cursor: default;
}

.images {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.img-wrapper {
  position: relative;
  width: 100px;
  height: 150px;
  flex-shrink: 0;
}
.img-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
  background-color: #333;
  cursor: zoom-in;
}
.img-delete-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 22px;
  height: 22px;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  cursor: pointer;
  padding: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
}
.img-delete-btn:hover {
  background: rgba(0, 0, 0, 0.9);
}
.img-add-btn {
  width: 100px;
  height: 150px;
  border: 1px dashed #555;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-size: 28px;
  flex-shrink: 0;
  transition: border-color 0.2s, color 0.2s;
}
.img-add-btn:hover {
  border-color: #aaa;
  color: #aaa;
}
.img-drag-handle {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
  z-index: 1;
}
.img-drag-handle:active {
  cursor: grabbing;
}
.hidden-input {
  display: none;
}

.variant-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid #222;
  flex-wrap: wrap;
}
.color-dot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid #444;
}
.color-dot-preview {
  cursor: pointer;
}
.variant-add-form {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
  margin-bottom: 5px;
  align-items: center;
}
.color-picker-group {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}
.hidden-color-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.variant-input-field,
.variant-input {
  padding: 10px 12px;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  font-family: inherit;
  box-sizing: border-box;
  outline: none;
}
.variant-input-field:focus {
  border-color: #666;
}
.variant-input-field.invalid {
  border-color: #ff7875;
}
.variant-input:disabled {
  background: #454545;
  cursor: default;
}
/* 這三個要用複合 class 選擇器（跟範本上實際套用的組合一致），
   specificity 才會贏過 .field input 的 width:100%，不然欄位會被撐成滿寬，跟舊版一排橫排的樣子不一樣 */
.variant-input-field.hex-input,
.variant-input.hex-input {
  width: 95px;
}
.variant-input-field.color-name-input,
.variant-input.color-name-input {
  width: 180px;
}
.variant-input-field.size-input,
.variant-input.size-input {
  width: 62px;
}
.variant-add-btn {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid #fff;
  border-radius: 20px;
  color: #fff;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.variant-add-btn:hover {
  background: #fff;
  color: #000;
}
.variant-add-btn.danger {
  border-color: #ff7875;
  color: #ff7875;
}
.variant-add-btn.danger:hover {
  background: #ff7875;
  color: #000;
}
.variant-add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.size-chart-scroll {
  overflow-x: auto;
  margin-top: 6px;
}
.size-chart-columns {
  display: flex;
  align-items: flex-start;
}
.size-columns-draggable {
  display: flex;
}
.size-column {
  display: flex;
  flex-direction: column;
  border-right: 1px solid #333;
}
.size-col-header,
.size-col-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  box-sizing: border-box;
  /* 固定高度而不是 min-height：最右邊那欄只有一顆刪除按鈕、沒有 input，
     內容天生比較矮，一定要用同樣的高度撐開，才能跟左邊有 input 的欄位對齊 */
  height: 52px;
  border-bottom: 1px solid #333;
}
.size-col-header {
  background: #1a1a1a;
}
.size-drag-handle {
  display: inline-block;
  cursor: grab;
  color: rgba(255, 255, 255, 0.4);
  padding: 0 4px;
  user-select: none;
}
.size-drag-handle:active {
  cursor: grabbing;
}
.size-col-input,
.size-cell-input {
  width: 90px;
  padding: 8px 10px;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
  outline: none;
}
.size-col-input:focus,
.size-cell-input:focus {
  border-color: #666;
}
.size-col-input.invalid {
  border-color: #ff7875;
}
.size-del-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  font-size: 13px;
  padding: 0 4px;
}
.size-del-btn:hover {
  color: #ff7875;
}
.size-chart-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.primary-btn {
  padding: 10px 28px;
  background: #fff;
  color: #000;
  border: none;
  border-radius: 20px;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.2s;
  margin-right: 10px;
}
.primary-btn:hover:not(:disabled) {
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.8);
}
.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.secondary-btn {
  padding: 10px 28px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  border: 1px solid #444;
  border-radius: 20px;
  font-size: 15px;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.2s, color 0.2s;
}
.secondary-btn:hover {
  border-color: #aaa;
  color: rgba(255, 255, 255, 0.9);
}

.img-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
}
.img-preview-overlay img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
}

.crop-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}
.crop-container {
  width: 90vw;
  max-width: 500px;
  max-height: 60vh;
}
.crop-container img {
  max-width: 100%;
}
.crop-actions {
  display: flex;
  gap: 12px;
}
.admin-modal-btn {
  padding: 8px 24px;
  border-radius: 20px;
  border: 1px solid #fff;
  background: transparent;
  color: #fff;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s, color 0.2s;
}
.admin-modal-btn:hover {
  background: #fff;
  color: #000;
}
</style>
