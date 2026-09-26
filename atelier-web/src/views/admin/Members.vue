<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { Order, OrderStatus } from '@atelier/types'
import { adminApiFetch } from '@/composables/useApi'
import { useAdminGuard } from '@/composables/useAdminGuard'

interface Member {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  created_at: string
}

const STATUS_MAP: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: '待確認', cls: 'status-pending' },
  paid: { label: '已付款', cls: 'status-paid' },
  processing: { label: '處理中', cls: 'status-processing' },
  shipped: { label: '已出貨', cls: 'status-shipped' },
  delivered: { label: '已送達', cls: 'status-delivered' },
  cancelled: { label: '已取消', cls: 'status-cancelled' },
}

const router = useRouter()
const { handleAuthError } = useAdminGuard()

const loading = ref(true)
const keyword = ref('')
const members = ref<Member[]>([])
const expandedId = ref<string | null>(null)
const ordersCache = reactive<Record<string, Order[]>>({})
const ordersLoading = reactive<Record<string, boolean>>({})

const filteredMembers = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return members.value
  return members.value.filter(
    (m) =>
      (m.name ?? '').toLowerCase().includes(kw) ||
      (m.email ?? '').toLowerCase().includes(kw) ||
      (m.phone ?? '').includes(kw)
  )
})

function statusFor(status: OrderStatus) {
  return STATUS_MAP[status] ?? { label: status, cls: '' }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
}

function goToOrder(orderNo: string) {
  router.push({ path: '/admin/orders', query: { search: orderNo } })
}

async function toggleOrders(memberId: string) {
  if (expandedId.value === memberId) {
    expandedId.value = null
    return
  }
  expandedId.value = memberId

  if (ordersCache[memberId] !== undefined) return // 已快取，不重打

  ordersLoading[memberId] = true
  try {
    const { data } = await adminApiFetch<{ success: true; data: Order[] }>(
      `/api/admin/orders?member_id=${memberId}`
    )
    ordersCache[memberId] = data
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) await handleAuthError()
  } finally {
    ordersLoading[memberId] = false
  }
}

async function loadMembers() {
  try {
    const { data } = await adminApiFetch<{ success: true; data: Member[] }>('/api/admin/members')
    members.value = data
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) await handleAuthError()
  } finally {
    loading.value = false
  }
}

onMounted(loadMembers)
</script>

<template>
  <div class="search-container">
    <input v-model="keyword" type="text" placeholder="搜尋姓名、Email 或電話..." autocomplete="off" />
  </div>

  <div v-if="!loading" class="count-label">會員數<strong>{{ members.length }}</strong></div>

  <div v-if="loading" class="empty">載入中...</div>
  <div v-else-if="filteredMembers.length === 0" class="empty">找不到符合的會員</div>
  <div v-else class="member-grid">
    <div v-for="m in filteredMembers" :key="m.id" class="member-card">
      <div class="member-header" @click="toggleOrders(m.id)">
        <div>
          <div class="member-name">{{ m.name ?? '（未設定暱稱）' }}</div>
          <div class="member-email">{{ m.email ?? '—' }}</div>
          <div class="member-phone">{{ m.phone ?? '—' }}</div>
        </div>
        <div class="member-header-right">
          <div></div>
          <div class="join-date">{{ formatDate(m.created_at) }} 加入</div>
        </div>
      </div>

      <div class="member-orders" :class="{ open: expandedId === m.id }">
        <div class="orders-label">訂單紀錄</div>
        <div v-if="ordersLoading[m.id]" class="loading-text">載入中...</div>
        <div v-else-if="(ordersCache[m.id]?.length ?? 0) === 0" class="empty-text">尚無訂單</div>
        <div v-for="o in ordersCache[m.id]" v-else :key="o.id" class="order-row">
          <div>
            <div class="order-row-no" @click="goToOrder(o.order_no)">{{ o.order_no }}</div>
            <div class="order-row-date">{{ formatDate(o.created_at) }}</div>
          </div>
          <div class="order-row-right">
            <span class="order-row-amount">NT$ {{ o.pay_amount.toLocaleString() }}</span>
            <span class="status-badge" :class="statusFor(o.status).cls">{{ statusFor(o.status).label }}</span>
          </div>
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
  margin-bottom: 30px;
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

.count-label {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 16px;
  padding: 6px 16px;
  border: 1px solid #fff;
  border-radius: 20px;
}
.count-label strong {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
}

.member-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 350px);
  gap: 20px;
  /* 用 start 而不是預設的 stretch：展開訂單紀錄的卡片會變高，
     不能讓同一排其他卡片被拉伸成一樣高，各卡片維持自己的高度就好 */
  align-items: start;
}
@media (max-width: 350px) {
  .member-grid {
    grid-template-columns: 1fr;
  }
}
.member-card {
  background: #1e1e1e;
  border-radius: 12px;
  overflow: hidden;
}
.member-header {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  padding: 16px 20px;
  cursor: pointer;
  gap: 12px;
}
.member-header:hover {
  background: #252525;
}
.member-header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  flex-shrink: 0;
}
.member-name {
  font-size: 15px;
  font-weight: bold;
}
.member-email,
.member-phone {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 6px;
}
.join-date {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
}

.member-orders {
  display: none;
  border-top: 1px solid #333;
  padding: 12px 20px 16px;
  background: #0a0a0a;
}
.member-orders.open {
  display: block;
}
.orders-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 1px;
  text-transform: uppercase;
  font-weight: bold;
  margin-bottom: 10px;
}
.loading-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  padding: 4px 0;
}
.empty-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.3);
}
.order-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #1e1e1e;
  font-size: 13px;
  gap: 12px;
}
.order-row:last-child {
  border-bottom: none;
}
.order-row-no {
  font-weight: bold;
  letter-spacing: 0.5px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
}
.order-row-no:hover {
  color: #fff;
  text-decoration: underline;
}
.order-row-date {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
.order-row-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.order-row-amount {
  font-weight: bold;
}

.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: bold;
  white-space: nowrap;
}
.status-pending {
  background: #3d2e00;
  color: #f59e0b;
}
.status-paid {
  background: #0c2340;
  color: #38bdf8;
}
.status-processing {
  background: #2d1a4a;
  color: #c084fc;
}
.status-shipped {
  background: #0f2e1a;
  color: #4ade80;
}
.status-delivered {
  background: #0a1f12;
  color: #86efac;
}
.status-cancelled {
  background: #1e1e1e;
  color: #888;
}

.empty {
  color: rgba(255, 255, 255, 0.3);
  padding: 40px 0;
  text-align: center;
  font-size: 14px;
}
</style>
