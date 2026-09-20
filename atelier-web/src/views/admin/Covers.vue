<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApiFetch } from '@/composables/useApi'
import { useAdminGuard } from '@/composables/useAdminGuard'
import { useModal } from '@/composables/useModal'

const { handleAuthError } = useAdminGuard()
const { alert, confirm } = useModal()

const covers = ref<string[]>([])
const loading = ref(true)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement>()

async function loadCovers() {
  loading.value = true
  try {
    const { data } = await adminApiFetch<{ success: true; data: string[] }>('/api/covers')
    covers.value = data
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) await handleAuthError()
  } finally {
    loading.value = false
  }
}

async function handleUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  const maxSize = 5 * 1024 * 1024
  if (!allowed.includes(file.type)) {
    await alert('格式不支援，請上傳 JPG、PNG 或 WebP')
    return
  }
  if (file.size > maxSize) {
    await alert('圖片超過 5MB 限制')
    return
  }

  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('image', file)
    await adminApiFetch('/api/upload/covers', { method: 'POST', body: formData })
    await loadCovers()
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) return handleAuthError()
    await alert('上傳失敗，請再試一次。')
  } finally {
    uploading.value = false
  }
}

async function deleteCover(url: string) {
  const ok = await confirm('確定要刪除這張封面圖嗎？', { confirmText: '確認刪除', danger: true })
  if (!ok) return
  try {
    await adminApiFetch('/api/upload/covers', { method: 'DELETE', body: JSON.stringify({ url }) })
    covers.value = covers.value.filter((u) => u !== url)
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) return handleAuthError()
    await alert('刪除失敗，請再試一次。')
  }
}

onMounted(loadCovers)
</script>

<template>
  <h2 class="page-title">封面管理</h2>
  <p class="hint-text">
    首頁會依上傳順序輪播以下封面圖，淡入淡出切換；只有一張時不會輪播，直接靜態顯示。圖片會直接以原圖比例顯示（依螢幕裁切置中），不需要先裁切。
  </p>

  <p v-if="loading" class="hint-text">載入中...</p>
  <div v-else class="cover-grid">
    <div v-for="url in covers" :key="url" class="cover-item">
      <img :src="url" class="cover-thumb" />
      <button class="delete-btn" aria-label="刪除封面" @click="deleteCover(url)">✕</button>
    </div>
    <button class="cover-add-btn" type="button" :disabled="uploading" @click="fileInput?.click()">
      {{ uploading ? '上傳中...' : '+' }}
    </button>
  </div>
  <input ref="fileInput" type="file" accept="image/*" class="hidden-input" @change="handleUpload" />
</template>

<style scoped>
.page-title {
  margin: 0 0 12px;
  font-size: 18px;
  color: rgba(255, 255, 255, 0.9);
}
.hint-text {
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  margin: 0 0 24px;
  max-width: 560px;
  line-height: 1.6;
}
.cover-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.cover-item {
  position: relative;
  width: 220px;
  height: 130px;
  flex-shrink: 0;
}
.cover-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
  background-color: #333;
}
.delete-btn {
  position: absolute;
  top: -8px;
  right: -8px;
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
.cover-add-btn {
  width: 220px;
  height: 130px;
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
  font-family: inherit;
  transition: border-color 0.2s, color 0.2s;
}
.cover-add-btn:hover:not(:disabled) {
  border-color: #aaa;
  color: #aaa;
}
.cover-add-btn:disabled {
  cursor: not-allowed;
  font-size: 13px;
}
.hidden-input {
  display: none;
}
</style>
