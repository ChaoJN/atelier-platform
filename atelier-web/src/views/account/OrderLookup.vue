<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { Order, OrderStatus } from '@atelier/types'
import { apiFetch } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

const STATUS_MAP: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: '待確認', cls: 'status-pending' },
  paid: { label: '已付款', cls: 'status-paid' },
  processing: { label: '處理中', cls: 'status-processing' },
  shipped: { label: '已出貨', cls: 'status-shipped' },
  delivered: { label: '已送達', cls: 'status-delivered' },
  cancelled: { label: '已取消', cls: 'status-cancelled' },
}

const DELIVERY_MAP: Record<string, string> = {
  'store-to-store': '7-11 店到店',
  'hand-deliver': '面交',
}

const router = useRouter()
const auth = useAuthStore()

const profileLoading = ref(true)
const email = ref('')
const displayName = ref('')
const savingName = ref(false)

const ordersLoading = ref(true)
const orders = ref<Order[]>([])
const expandedId = ref<number | null>(null)

const accountInputs = reactive<Record<number, string>>({})
const accountSubmitted = reactive<Record<number, boolean>>({})
const accountInvalid = reactive<Record<number, boolean>>({})

const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(msg: string) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastMsg.value = ''), 2000)
}

function onImgError(e: Event) {
  ;(e.target as HTMLImageElement).src = BLANK
}

function statusFor(status: OrderStatus) {
  return STATUS_MAP[status] ?? { label: status, cls: '' }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
}

function deliveryLabel(method: string) {
  return DELIVERY_MAP[method] ?? method ?? '—'
}

function deliveryDetail(order: Order) {
  const info = order.delivery_info as { store_id?: string; store_name?: string; meeting?: string } | null
  if (!info) return '—'
  return order.delivery_method === 'store-to-store' ? `${info.store_id} ${info.store_name}` : (info.meeting ?? '—')
}

function toggleDetail(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}

async function saveAccountInfo(order: Order) {
  const val = (accountInputs[order.id] ?? '').trim()
  if (!/^\d{5}$/.test(val)) {
    accountInvalid[order.id] = true
    return
  }
  await apiFetch(`/api/orders/${order.id}/payment-account`, {
    method: 'PATCH',
    body: JSON.stringify({ payment_account_info: val }),
  })
  accountSubmitted[order.id] = true
}

async function saveDisplayName() {
  const val = displayName.value.trim()
  if (!val) return
  savingName.value = true
  try {
    await auth.saveDisplayName(val)
    showToast('已儲存')
  } finally {
    savingName.value = false
  }
}

async function loadProfile() {
  try {
    const { data } = await apiFetch<{ success: true; data: { email: string; display_name: string | null } }>(
      '/api/members/me'
    )
    email.value = data.email
    displayName.value = data.display_name ?? ''
  } finally {
    profileLoading.value = false
  }
}

async function loadOrders() {
  try {
    const { data } = await apiFetch<{ success: true; data: Order[] }>('/api/orders/me')
    orders.value = data
    for (const order of data) {
      accountInputs[order.id] = order.payment_account_info ?? ''
      accountSubmitted[order.id] = !!order.payment_account_info
    }
  } catch (err) {
    if ((err as Error & { status?: number }).status === 401) {
      auth.logout()
      router.push('/login')
    }
  } finally {
    ordersLoading.value = false
  }
}

onMounted(() => {
  if (!auth.isLoggedIn) {
    localStorage.setItem('redirect_after_login', '/account/orders')
    router.push('/login')
    return
  }
  loadProfile()
  loadOrders()
})
</script>

<template>
  <div class="toast" :class="{ show: !!toastMsg }">{{ toastMsg }}</div>

  <div class="account-wrap">
    <div class="page-title">ACCOUNT</div>

    <div v-if="profileLoading" class="state-msg">載入中...</div>
    <div v-else class="profile-card">
      <div class="profile-row">
        <span class="profile-label">Email</span>
        <span class="profile-value">{{ email }}</span>
      </div>
      <div class="profile-row">
        <span class="profile-label">暱稱</span>
        <div class="profile-edit-row">
          <input v-model="displayName" class="profile-input" placeholder="設定暱稱" />
          <button class="profile-save-btn" :disabled="savingName" @click="saveDisplayName">儲存</button>
        </div>
      </div>
    </div>

    <div class="section-title">訂單紀錄</div>

    <div v-if="ordersLoading" class="state-msg">載入中...</div>
    <div v-else-if="orders.length === 0" class="empty-state">
      尚無訂單紀錄
      <br />
      <RouterLink to="/product">去逛逛</RouterLink>
    </div>
    <template v-else>
      <div v-for="order in orders" :key="order.id" class="order-card">
        <div class="order-header" @click="toggleDetail(order.id)">
          <div class="order-header-row">
            <div>
              <div class="order-no">{{ order.order_no }}</div>
              <div class="order-date">{{ formatDate(order.created_at) }}</div>
            </div>
            <div class="order-right">
              <div class="order-amount">NT$ {{ order.pay_amount.toLocaleString() }}</div>
              <span class="status-badge" :class="statusFor(order.status).cls">{{ statusFor(order.status).label }}</span>
            </div>
          </div>

          <div v-if="order.payment_method === 'transfer'" class="account-row" @click.stop>
            <span class="account-row-label">帳號末五碼</span>
            <input
              v-model="accountInputs[order.id]"
              type="text"
              maxlength="5"
              placeholder="請輸入末五碼"
              :disabled="accountSubmitted[order.id]"
              class="account-input"
              :class="{ invalid: accountInvalid[order.id], submitted: accountSubmitted[order.id] }"
              @input="accountInvalid[order.id] = false"
            />
            <button
              class="account-submit-btn"
              :disabled="accountSubmitted[order.id]"
              @click="saveAccountInfo(order)"
            >
              送出
            </button>
          </div>
        </div>

        <div class="order-detail" :class="{ open: expandedId === order.id }">
          <div class="detail-section">
            <div class="detail-label">商品明細</div>
            <div v-for="(item, i) in order.order_items" :key="i" class="detail-item">
              <img class="detail-item-img" :src="item.image || BLANK" alt="" @error="onImgError" />
              <div>
                <div class="detail-item-name">{{ item.productName }}</div>
                <div v-if="item.color || item.size" class="detail-item-variant">
                  {{ [item.color, item.size].filter(Boolean).join('・') }}
                </div>
              </div>
              <div class="detail-item-price">NT$ {{ item.price }} × {{ item.quantity }}</div>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-total-row"><span>商品金額</span><span>NT$ {{ order.order_amount.toLocaleString() }}</span></div>
            <div v-if="order.discount_amount" class="detail-total-row">
              <span>折扣</span><span>−NT$ {{ order.discount_amount.toLocaleString() }}</span>
            </div>
            <div v-if="order.delivery_fee" class="detail-total-row">
              <span>運費</span><span>NT$ {{ order.delivery_fee.toLocaleString() }}</span>
            </div>
            <div class="detail-total-row final"><span>實付金額</span><span>NT$ {{ order.pay_amount.toLocaleString() }}</span></div>
          </div>

          <div class="detail-section">
            <div class="detail-label">配送資訊</div>
            <div class="detail-info-row"><span class="detail-info-key">配送方式</span><span>{{ deliveryLabel(order.delivery_method) }}</span></div>
            <div class="detail-info-row"><span class="detail-info-key">配送詳情</span><span>{{ deliveryDetail(order) }}</span></div>
            <div class="detail-info-row"><span class="detail-info-key">收件人</span><span>{{ order.recipient_name || '—' }}</span></div>
            <div class="detail-info-row"><span class="detail-info-key">電話</span><span>{{ order.recipient_phone || '—' }}</span></div>
          </div>

          <div v-if="order.remark" class="detail-section">
            <div class="detail-label">備註</div>
            <div class="remark-text">{{ order.remark }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.account-wrap {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 24px 80px;
  box-sizing: border-box;
}
.page-title {
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 1px;
  margin-bottom: 24px;
}
.section-title {
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 1px;
  color: #999;
  margin: 24px 0 12px;
}
.state-msg {
  padding: 40px 24px;
  text-align: center;
  color: #aaa;
  font-size: 15px;
}

.profile-card {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 20px 24px;
  margin-bottom: 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}
.profile-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.profile-label {
  font-size: 12px;
  color: #aaa;
  width: 60px;
  flex-shrink: 0;
}
.profile-value {
  font-size: 14px;
  color: #333;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-edit-row {
  display: flex;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.profile-input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
.profile-input:focus {
  border-color: #333;
}
.profile-save-btn {
  flex-shrink: 0;
  padding: 8px 16px;
  background: #333;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}
.profile-save-btn:hover:not(:disabled) {
  background: #000;
}

.order-card {
  border: 1px solid #eee;
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}
.order-header {
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  cursor: pointer;
  gap: 10px;
}
.order-header:hover {
  background: #fafafa;
}
.order-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.order-no {
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 0.5px;
}
.order-date {
  font-size: 13px;
  color: #aaa;
  margin-top: 3px;
}
.order-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}
.order-amount {
  font-size: 13px;
  font-weight: bold;
}
.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: bold;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 3px;
}
.status-pending {
  background: #fff8e1;
  color: #f59e0b;
}
.status-paid {
  background: #e0f2fe;
  color: #0284c7;
}
.status-processing {
  background: #f3e8ff;
  color: #7c3aed;
}
.status-shipped {
  background: #dcfce7;
  color: #16a34a;
}
.status-delivered {
  background: #f0fdf4;
  color: #15803d;
}
.status-cancelled {
  background: #f5f5f5;
  color: #aaa;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.account-row-label {
  font-size: 12px;
  color: #aaa;
  flex-shrink: 0;
}
.account-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.account-input.invalid {
  border-color: #ff7875;
}
.account-input.submitted {
  background: #f5f5f5;
  color: #aaa;
}
.account-submit-btn {
  height: 34px;
  padding: 0 12px;
  background: #333;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
}
.account-submit-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.order-detail {
  display: none;
  border-top: 1px solid #f0f0f0;
  padding: 16px 20px;
  background: #fafafa;
}
.order-detail.open {
  display: block;
}
.detail-section {
  margin-bottom: 16px;
}
.detail-label {
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 1px;
  color: #aaa;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.detail-item {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}
.detail-item:last-child {
  border-bottom: none;
}
.detail-item-img {
  width: 44px;
  aspect-ratio: 6 / 9;
  object-fit: cover;
  background: #eee;
  flex-shrink: 0;
}
.detail-item-name {
  font-size: 13px;
  font-weight: bold;
}
.detail-item-variant {
  font-size: 12px;
  color: #888;
  margin-top: 2px;
}
.detail-item-price {
  font-size: 13px;
  margin-left: auto;
  flex-shrink: 0;
}
.detail-info-row {
  display: flex;
  gap: 8px;
  font-size: 13px;
  color: #555;
  margin-bottom: 4px;
}
.detail-info-key {
  color: #aaa;
  flex-shrink: 0;
}
.detail-total-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 4px 0;
  color: #555;
}
.detail-total-row.final {
  font-weight: bold;
  color: #333;
  border-top: 1px solid #e0e0e0;
  margin-top: 6px;
  padding-top: 8px;
}
.remark-text {
  font-size: 13px;
  color: #555;
}

.empty-state {
  text-align: center;
  padding: 80px 0;
  color: #aaa;
  font-size: 14px;
}
.empty-state a {
  display: inline-block;
  margin-top: 16px;
  color: #333;
  font-size: 13px;
  text-decoration: underline;
}

.toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%) translateY(16px);
  background: #fff;
  color: #333;
  border: 1px solid #ddd;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  font-size: 13px;
  padding: 10px 20px;
  border-radius: 20px;
  opacity: 0;
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: none;
  white-space: nowrap;
  z-index: 300;
}
.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>
