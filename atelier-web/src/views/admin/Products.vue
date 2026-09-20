<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import type { AdminProduct, Category } from '@atelier/types'
import { adminApiFetch } from '@/composables/useApi'
import { useAdminGuard } from '@/composables/useAdminGuard'
import { useModal } from '@/composables/useModal'

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

const router = useRouter()
const { handleAuthError } = useAdminGuard()
const { alert, confirm } = useModal()

const loading = ref(true)
const products = ref<AdminProduct[]>([])
const keyword = ref('')
const imageIndex = reactive<Record<number, number>>({})
let searchTimer: ReturnType<typeof setTimeout> | undefined
let carouselTimer: ReturnType<typeof setInterval> | undefined

function onImgError(e: Event) {
  ;(e.target as HTMLImageElement).src = BLANK
}

function imageFor(p: AdminProduct) {
  const urls = p.image_urls
  if (!urls || urls.length === 0) return null
  const idx = imageIndex[p.id] ?? 0
  return urls[idx % urls.length]
}

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
  try {
    const qs = keyword.value.trim() ? `?keyword=${encodeURIComponent(keyword.value.trim())}` : ''
    const { data } = await adminApiFetch<{ success: true; data: AdminProduct[] }>(`/api/admin/products${qs}`)
    products.value = data
    for (const p of data) imageIndex[p.id] = 0
    startCarousel()
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) await handleAuthError()
  } finally {
    loading.value = false
  }
}

function debounceSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadProducts, 300)
}

async function deleteProduct(p: AdminProduct) {
  const ok = await confirm('確定要刪除這個商品嗎？', { confirmText: '確認刪除', danger: true })
  if (!ok) return
  try {
    await adminApiFetch(`/api/admin/products/${p.id}`, { method: 'DELETE' })
    products.value = products.value.filter((x) => x.id !== p.id)
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) return handleAuthError()
    await alert('刪除失敗，請再試一次。')
  }
}

// ── 批次上下架 ──
const selectMode = ref(false)
const selectedIds = reactive(new Set<number>())
const bulkSaving = ref(false)

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  selectedIds.clear()
}

function toggleSelect(id: number) {
  if (selectedIds.has(id)) selectedIds.delete(id)
  else selectedIds.add(id)
}

function onCardClick(p: AdminProduct) {
  if (selectMode.value) toggleSelect(p.id)
  else router.push(`/admin/products/${p.id}`)
}

async function bulkSetActive(isActive: boolean) {
  if (selectedIds.size === 0) return
  const ok = await confirm(`確定要將選取的 ${selectedIds.size} 項商品${isActive ? '上架' : '下架'}嗎？`, {
    confirmText: '確認',
  })
  if (!ok) return

  bulkSaving.value = true
  const failedNames: string[] = []
  try {
    for (const id of selectedIds) {
      try {
        await adminApiFetch(`/api/admin/products/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ is_active: isActive }), // 只帶這個欄位，後端是部分更新，不會動到其他欄位
        })
        const p = products.value.find((x) => x.id === id)
        if (p) p.is_active = isActive
      } catch (err) {
        const status = (err as Error & { status?: number }).status
        if (status === 401 || status === 403) throw err // 登入過期就整批停下來，交給外層統一處理
        failedNames.push(products.value.find((x) => x.id === id)?.product_name ?? `#${id}`)
      }
    }
    if (failedNames.length > 0) {
      await alert(`以下商品更新失敗，請再試一次：\n${failedNames.join('、')}`)
    }
    selectedIds.clear()
    selectMode.value = false
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) return handleAuthError()
    await alert('更新失敗，請再試一次。')
  } finally {
    bulkSaving.value = false
  }
}

onMounted(loadProducts)
onUnmounted(() => clearInterval(carouselTimer))

// ── 分類管理 ──
const catModalOpen = ref(false)
const categories = ref<Category[]>([])
const newCatName = ref('')
const newCatSlug = ref('')
const newCatActive = ref(true)
const newCatNameInvalid = ref(false)
const newCatSlugInvalid = ref(false)

const editingId = ref<number | null>(null)
const editName = ref('')
const editSlug = ref('')
const editActive = ref(true)
const editNameInvalid = ref(false)
const editSlugInvalid = ref(false)

async function loadCategories() {
  const { data } = await adminApiFetch<{ success: true; data: Category[] }>('/api/admin/categories')
  categories.value = data
}

function openCategoryModal() {
  catModalOpen.value = true
  newCatName.value = ''
  newCatSlug.value = ''
  newCatActive.value = true
  editingId.value = null
  loadCategories()
}

function closeCatModal() {
  catModalOpen.value = false
}

async function addCategory() {
  newCatNameInvalid.value = !newCatName.value.trim()
  newCatSlugInvalid.value = !newCatSlug.value.trim()
  if (newCatNameInvalid.value || newCatSlugInvalid.value) return

  await adminApiFetch('/api/admin/categories', {
    method: 'POST',
    body: JSON.stringify({ name: newCatName.value.trim(), slug: newCatSlug.value.trim(), is_active: newCatActive.value }),
  })
  newCatName.value = ''
  newCatSlug.value = ''
  await loadCategories()
}

function startEdit(cat: Category) {
  editingId.value = cat.id
  editName.value = cat.name
  editSlug.value = cat.slug ?? ''
  editActive.value = cat.is_active
  editNameInvalid.value = false
  editSlugInvalid.value = false
}

function cancelEdit() {
  editingId.value = null
}

async function saveCategory(id: number) {
  editNameInvalid.value = !editName.value.trim()
  editSlugInvalid.value = !editSlug.value.trim()
  if (editNameInvalid.value || editSlugInvalid.value) return

  await adminApiFetch(`/api/admin/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: editName.value.trim(), slug: editSlug.value.trim(), is_active: editActive.value }),
  })
  editingId.value = null
  await loadCategories()
}

async function deleteCategory(cat: Category) {
  const ok = await confirm(`確定刪除「${cat.name}」分類？`, { confirmText: '確認刪除', danger: true })
  if (!ok) return
  await adminApiFetch(`/api/admin/categories/${cat.id}`, { method: 'DELETE' })
  await loadCategories()
}
</script>

<template>
  <div class="search-container">
    <input v-model="keyword" type="text" placeholder="搜尋商品名稱..." @input="debounceSearch" />
  </div>

  <div class="actions-row">
    <button class="menu-item" @click="router.push('/admin/products/new')">+ 新增商品</button>
    <button class="menu-item" @click="openCategoryModal">+ 編輯分類</button>
    <button class="menu-item" @click="toggleSelectMode">{{ selectMode ? '取消批次操作' : '批次上下架' }}</button>
  </div>

  <div v-if="selectMode" class="bulk-bar">
    <span class="bulk-count">已選取 {{ selectedIds.size }} 項</span>
    <button class="menu-item" :disabled="selectedIds.size === 0 || bulkSaving" @click="bulkSetActive(true)">上架</button>
    <button class="menu-item" :disabled="selectedIds.size === 0 || bulkSaving" @click="bulkSetActive(false)">下架</button>
  </div>

  <div v-if="loading" class="empty-msg">載入中...</div>
  <div v-else-if="products.length === 0" class="empty-msg">尚無商品，快來新增商品吧 ;)</div>
  <div v-else class="card-grid">
    <div
      v-for="p in products"
      :key="p.id"
      class="product-card"
      :class="{ selected: selectMode && selectedIds.has(p.id) }"
    >
      <input
        v-if="selectMode"
        type="checkbox"
        class="select-checkbox"
        :checked="selectedIds.has(p.id)"
        @click.stop="toggleSelect(p.id)"
      />
      <img v-if="imageFor(p)" class="product-img" :src="imageFor(p)!" @error="onImgError" />
      <div v-else class="product-img"></div>
      <div class="product-info" @click="onCardClick(p)">
        <div class="name">{{ p.product_name }}</div>
        <div class="price">NT$ {{ p.price }}</div>
        <div class="stock">庫存：-</div>
        <div class="status" :class="p.is_active ? 'active' : 'inactive'">
          {{ p.is_active ? '上架中' : '已下架' }}
        </div>
      </div>
      <button v-if="!selectMode" class="delete-btn" aria-label="刪除商品" @click="deleteProduct(p)">✕</button>
    </div>
  </div>

  <!-- 分類管理 Modal -->
  <div v-if="catModalOpen" class="modal-overlay show" @click.self="closeCatModal">
    <div class="modal-box cat-modal-box">
      <div class="cat-modal-header">
        <span class="cat-modal-title">分類管理</span>
        <button class="cat-close-btn" @click="closeCatModal">&times;</button>
      </div>

      <div class="cat-new-form">
        <div class="cat-new-inputs">
          <input
            v-model="newCatName"
            type="text"
            placeholder="名稱（中）"
            maxlength="30"
            class="cat-edit-input"
            :class="{ invalid: newCatNameInvalid }"
            @input="newCatNameInvalid = false"
          />
          <input
            v-model="newCatSlug"
            type="text"
            placeholder="名稱（英）"
            maxlength="30"
            class="cat-edit-input"
            :class="{ invalid: newCatSlugInvalid }"
            @input="newCatSlugInvalid = false"
          />
        </div>
        <div class="cat-new-actions">
          <button
            class="cat-btn"
            :style="{ color: newCatActive ? '#4ade80' : 'rgba(255,255,255,0.4)', borderColor: newCatActive ? '#4ade80' : '#555' }"
            @click="newCatActive = !newCatActive"
          >
            {{ newCatActive ? '啟用中' : '已停用' }}
          </button>
          <button class="cat-btn cat-btn-primary" @click="addCategory">新增</button>
        </div>
      </div>

      <div class="cat-list">
        <div v-if="categories.length === 0" class="cat-empty">尚無分類</div>
        <div v-for="cat in categories" v-else :key="cat.id" class="cat-row" :class="{ editing: editingId === cat.id }">
          <template v-if="editingId === cat.id">
            <div class="cat-edit-inputs">
              <input
                v-model="editName"
                class="cat-edit-input"
                maxlength="30"
                placeholder="名稱（中）"
                :class="{ invalid: editNameInvalid }"
                @keydown.escape="cancelEdit"
              />
              <input
                v-model="editSlug"
                class="cat-edit-input"
                maxlength="30"
                placeholder="代號（英）"
                :class="{ invalid: editSlugInvalid }"
                @keydown.enter="saveCategory(cat.id)"
                @keydown.escape="cancelEdit"
              />
            </div>
            <div class="cat-edit-actions">
              <button
                class="cat-btn"
                :style="{ color: editActive ? '#4ade80' : 'rgba(255,255,255,0.4)', borderColor: editActive ? '#4ade80' : '#555' }"
                @click="editActive = !editActive"
              >
                {{ editActive ? '啟用中' : '已停用' }}
              </button>
              <div class="cat-edit-buttons">
                <button class="cat-btn" @click="cancelEdit">取消</button>
                <button class="cat-btn" @click="saveCategory(cat.id)">儲存</button>
              </div>
            </div>
          </template>
          <template v-else>
            <span class="cat-dot" :class="cat.is_active ? 'active' : 'inactive'"></span>
            <span class="cat-name">{{ cat.name }}</span>
            <span class="cat-name">{{ cat.slug }}</span>
            <button class="cat-btn" @click="startEdit(cat)">編輯</button>
            <button class="cat-btn danger" @click="deleteCategory(cat)">刪除</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-container {
  display: flex;
  align-items: center;
  background-color: #1e1e1e;
  border-radius: 30px;
  padding: 10px 16px;
  gap: 10px;
  margin-bottom: 25px;
  width: 100%;
  max-width: 450px;
  box-sizing: border-box;
}
.search-container input {
  background: transparent;
  border: none;
  outline: none;
  color: rgba(255, 255, 255, 0.8);
  font-size: 15px;
  font-family: inherit;
  width: 100%;
}
.search-container input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.actions-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
  gap: 5px;

}
.menu-item {
  padding: 8px 20px;
  background-color: #000;
  color: #fff;
  border: 1px solid #fff;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}
.menu-item:hover {
  background-color: #fff;
  color: #000;
}
.menu-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.menu-item:disabled:hover {
  background-color: #000;
  color: #fff;
}

.bulk-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.bulk-count {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.select-checkbox {
  position: absolute;
  top: -8px;
  left: -8px;
  width: 20px;
  height: 20px;
  cursor: pointer;
  z-index: 1;
  accent-color: #fff;
}

.product-card.selected {
  outline: 2px solid #fff;
}

.empty-msg {
  color: rgba(255, 255, 255, 0.4);
  font-size: 20px;
  padding: 20px 0;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 350px);
  gap: 20px;
  margin-top: 10px;
}
@media (max-width: 350px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
.product-card {
  background-color: #1e1e1e;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: center;
  position: relative;
}
.product-img {
  width: 150px;
  height: 225px;
  object-fit: cover;
  border-radius: 8px;
  background-color: #333;
  flex-shrink: 0;
}
.product-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-left: 10px;
  flex: 1;
  align-self: stretch;
  justify-content: center;
  cursor: pointer;
}
.product-card .name {
  font-size: 15px;
  font-weight: bold;
}
.product-card .price,
.product-card .stock {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}
.product-card .status {
  font-size: 13px;
  padding: 2px 8px;
  border-radius: 10px;
  width: fit-content;
}
.status.active {
  background-color: #0f5830;
  color: #2ecc71;
}
.status.inactive {
  background-color: #6b1717;
  color: #ff7875;
}
.delete-btn {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 22px;
  height: 22px;
  background-color: #1e1e1e;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  padding: 0;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
}
.delete-btn:hover {
  opacity: 0.7;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}
.modal-box {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 28px 24px;
  max-width: 320px;
  width: 90%;
  text-align: center;
}
.cat-modal-box {
  max-width: 420px;
  width: 90%;
  text-align: left;
}
.cat-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.cat-modal-title {
  font-weight: bold;
  font-size: 15px;
}
.cat-close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}
.cat-new-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
}
.cat-new-inputs {
  display: flex;
  gap: 6px;
}
.cat-new-actions {
  display: flex;
  gap: 6px;
  justify-content: space-between;
  align-items: center;
}
.cat-edit-input {
  flex: 1;
  min-width: 0;
  background: #111;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 4px 8px;
  color: #fff;
  font-size: 14px;
  font-family: inherit;
  outline: none;
}
.cat-edit-input.invalid {
  border-color: #ef4444;
}
.cat-btn {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  line-height: 1;
  cursor: pointer;
  font-family: inherit;
  border: 1px solid #555;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
}
.cat-btn:hover {
  border-color: #fff;
  color: #fff;
}
.cat-btn.danger:hover {
  border-color: #ef4444;
  color: #ef4444;
}
.cat-btn-primary {
  color: #fff;
  border-color: #fff;
}

.cat-list {
  max-height: 320px;
  overflow-y: auto;
}
.cat-empty {
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
  text-align: center;
  padding: 20px 0;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 14px;
}
.cat-row:last-child {
  border-bottom: none;
}
.cat-row.editing {
  flex-direction: column;
  align-items: stretch;
}
.cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cat-dot.active {
  background: #4ade80;
}
.cat-dot.inactive {
  background: #555;
}
.cat-name {
  flex: 1;
}
.cat-edit-inputs {
  display: flex;
  gap: 6px;
}
.cat-edit-actions {
  display: flex;
  gap: 6px;
  justify-content: space-between;
  align-items: center;
}
.cat-edit-buttons {
  display: flex;
  gap: 6px;
}
</style>
