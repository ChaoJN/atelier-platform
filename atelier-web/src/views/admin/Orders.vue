<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import type { Order, OrderStatus } from '@atelier/types'
import { adminApiFetch } from '@/composables/useApi'
import { useAdminGuard } from '@/composables/useAdminGuard'
import { useModal } from '@/composables/useModal'

type AdminOrder = Order & { member_name: string | null; member_email: string | null }

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

const STATUS_MAP: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: '待確認', cls: 'status-pending' },
  paid: { label: '已付款', cls: 'status-paid' },
  processing: { label: '處理中', cls: 'status-processing' },
  shipped: { label: '已出貨', cls: 'status-shipped' },
  delivered: { label: '已送達', cls: 'status-delivered' },
  cancelled: { label: '已取消', cls: 'status-cancelled' },
}

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: '待確認' },
  { value: 'paid', label: '已付款' },
  { value: 'processing', label: '處理中' },
  { value: 'shipped', label: '已出貨' },
  { value: 'delivered', label: '已送達' },
  { value: 'cancelled', label: '已取消' },
]

const DELIVERY_MAP: Record<string, string> = {
  'store-to-store': '7-11 店到店',
  'hand-deliver': '面交',
}

const route = useRoute()
const { handleAuthError } = useAdminGuard()
const { alert } = useModal()

const loading = ref(true)
const orders = ref<AdminOrder[]>([])
const keyword = ref('')
const currentFilter = ref<OrderStatus | ''>('')
const expandedId = ref<number | null>(null)

const filteredOrders = computed(() => {
  // 用空白分詞，每個詞都要對到才算符合（AND），這樣才能同時打「品名 顏色 尺寸」一次篩出
  // 訂了某個商品特定顏色尺寸的訂單，不會只符合其中一個詞就整批撈出來
  const terms = keyword.value.trim().toUpperCase().split(/\s+/).filter(Boolean)

  return orders.value.filter((o) => {
    if (currentFilter.value && o.status !== currentFilter.value) return false
    if (terms.length === 0) return true

    const orderNoUpper = o.order_no.toUpperCase()
    if (terms.every((t) => orderNoUpper.includes(t))) return true

    // 每個詞必須同時出現在「同一個商品項目」的名稱＋顏色＋尺寸組合裡，
    // 才算符合，避免多商品訂單裡分別各自符合不同詞卻誤判成同一項規格
    return (o.order_items ?? []).some((item) => {
      const haystack = [item.productName, item.color, item.size].filter(Boolean).join(' ').toUpperCase()
      return terms.every((t) => haystack.includes(t))
    })
  })
})

function statusFor(status: OrderStatus) {
  return STATUS_MAP[status] ?? { label: status, cls: '' }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-TW')
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false })
}

function paymentLabel(method: string) {
  return method === 'transfer' ? '銀行轉帳' : method || '—'
}

function deliveryLabel(method: string) {
  return DELIVERY_MAP[method] ?? method ?? '—'
}

function deliveryDetail(order: AdminOrder) {
  const info = order.delivery_info as { store_id?: string; store_name?: string; meeting?: string } | null
  if (!info) return '—'
  return order.delivery_method === 'store-to-store' ? `${info.store_id} ${info.store_name}` : (info.meeting ?? '—')
}

function toggleDetail(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}

// ── 匯出 CSV ──
function orderItemsCell(items: AdminOrder['order_items']) {
  return (items ?? [])
    .map((item) => `${item.productName} (${item.color ?? '-'} / ${item.size ?? '-'}) x ${item.quantity}`)
    .join('\n')
}

// 用 ="..." 公式包一層：Excel／Google Sheets 開啟 CSV 時都會固定當純文字讀，
// 電話號碼開頭的 0、店號等數字不會被自動轉型跑掉
function csvCell(value: string) {
  const escapedForFormula = value.replace(/"/g, '""')
  const formula = `="${escapedForFormula}"`
  const escapedForCsv = formula.replace(/"/g, '""')
  return `"${escapedForCsv}"`
}

// 商品明細要在 cell 內換行，不能用 ="..." 公式包——實測發現 Excel/Sheets 算公式時會把
// 裡面的換行符吃掉，變成擠在同一行。這欄本來就是純文字（商品名稱開頭），沒有被誤判成數字的風險，
// 單純用雙引號包起來就好，CSV 格式本身就支援 quoted 欄位內含換行
function csvCellPlain(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function exportCsv() {
  const headers = ['會員名稱', '會員信箱', '訂單編號', '商品明細', '收件人', '收件人電話', '寄送資訊', '備註']
  const rows = filteredOrders.value.map((o) => [
    csvCell(o.member_name ?? ''),
    csvCell(o.member_email ?? ''),
    csvCell(o.order_no),
    csvCellPlain(orderItemsCell(o.order_items)),
    csvCell(o.recipient_name ?? ''),
    csvCell(o.recipient_phone ?? ''),
    csvCell(deliveryDetail(o)),
    csvCell(o.remark ?? ''),
  ])

  const csvText = [headers.map(csvCell), ...rows].map((row) => row.join(',')).join('\r\n')
  const BOM = '\uFEFF' // 加 BOM，Excel 開啟時中文欄位才不會變亂碼
  const blob = new Blob([BOM + csvText], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `訂單出貨清單_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function onImgError(e: Event) {
  ;(e.target as HTMLImageElement).src = BLANK
}

async function updateStatus(order: AdminOrder, event: Event) {
  const status = (event.target as HTMLSelectElement).value as OrderStatus
  try {
    await adminApiFetch(`/api/admin/orders/${order.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    // 本地更新，不重新整個列表重打 API
    order.status = status
    order.status_history = [...(order.status_history ?? []), { status, changed_at: new Date().toISOString() }]
  } catch (err) {
    const httpStatus = (err as Error & { status?: number }).status
    if (httpStatus === 401 || httpStatus === 403) {
      await handleAuthError()
      return
    }
    await alert('狀態更新失敗，請再試一次。')
  }
}

async function loadOrders() {
  try {
    const { data } = await adminApiFetch<{ success: true; data: AdminOrder[] }>('/api/admin/orders')
    orders.value = data
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) await handleAuthError()
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadOrders()
  const q = route.query.search
  if (typeof q === 'string') keyword.value = q
})
</script>

<template>
  <div class="search-container">
    <input v-model="keyword" type="text" placeholder="搜尋訂單編號、商品名稱、顏色或尺寸..." autocomplete="off" />
    <button type="button" class="search-info" aria-label="搜尋說明">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
      <div class="search-tooltip">
        可輸入多個關鍵字，用空白分隔（例如「葫蘆褲 BLACK M」），每個詞都要同時符合同一項商品的名稱、顏色或尺寸才會顯示；也可以直接搜訂單編號。
      </div>
    </button>
  </div>

  <div class="filter-bar">
    <button class="filter-chip" :class="{ selected: currentFilter === '' }" @click="currentFilter = ''">ALL</button>
    <button
      v-for="opt in STATUS_OPTIONS"
      :key="opt.value"
      class="filter-chip"
      :class="{ selected: currentFilter === opt.value }"
      @click="currentFilter = opt.value"
    >
      {{ opt.label }}
    </button>
    <button class="export-btn" :disabled="filteredOrders.length === 0" @click="exportCsv">匯出 CSV</button>
  </div>

  <table class="orders-table">
    <thead>
      <tr>
        <th>訂單編號</th>
        <th>會員</th>
        <th>付款方式</th>
        <th>末五碼</th>
        <th>實付金額</th>
        <th>狀態</th>
        <th>變更狀態</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="loading">
        <td colspan="7" class="empty">載入中...</td>
      </tr>
      <tr v-else-if="filteredOrders.length === 0">
        <td colspan="7" class="empty">尚無訂單</td>
      </tr>
      <template v-for="order in filteredOrders" v-else :key="order.id">
        <tr class="order-row" @click="toggleDetail(order.id)">
          <td>
            <div class="order-no">{{ order.order_no }}</div>
            <div class="order-date">{{ formatDate(order.created_at) }}</div>
          </td>
          <td class="order-email">{{ order.member_name ?? '—' }}</td>
          <td class="nowrap-cell">{{ paymentLabel(order.payment_method) }}</td>
          <td>
            <span v-if="order.payment_account_info" class="account-badge">{{ order.payment_account_info }}</span>
            <span v-else class="dash">—</span>
          </td>
          <td class="order-amount nowrap-cell">NT$ {{ order.pay_amount.toLocaleString() }}</td>
          <td><span class="status-badge" :class="statusFor(order.status).cls">{{ statusFor(order.status).label }}</span></td>
          <td @click.stop>
            <select class="status-select" :value="order.status" @change="updateStatus(order, $event)">
              <option v-for="opt in STATUS_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </td>
        </tr>
        <tr class="detail-row" :class="{ open: expandedId === order.id }">
          <td colspan="7" class="detail-cell">
            <div class="detail-inner">
              <div>
                <div class="detail-section-title">商品明細</div>
                <div class="detail-items">
                  <div v-for="(item, i) in order.order_items" :key="i" class="detail-item">
                    <img class="detail-item-img" :src="item.image || BLANK" alt="" @error="onImgError" />
                    <div>
                      <div>{{ item.productName }}</div>
                      <div v-if="item.color || item.size" class="item-variant">
                        {{ [item.color, item.size].filter(Boolean).join('・') }}
                      </div>
                    </div>
                    <div class="item-price">NT$ {{ item.price }} × {{ item.quantity }}</div>
                  </div>
                </div>
                <div class="amount-summary">
                  <div class="detail-row-info"><span class="detail-key">商品金額</span><span>NT$ {{ order.order_amount.toLocaleString() }}</span></div>
                  <div v-if="order.discount_amount" class="detail-row-info"><span class="detail-key">折扣</span><span>－NT$ {{ order.discount_amount.toLocaleString() }}</span></div>
                  <div v-if="order.delivery_fee" class="detail-row-info"><span class="detail-key">運費</span><span>NT$ {{ order.delivery_fee.toLocaleString() }}</span></div>
                  <div class="detail-row-info"><span class="detail-key">實付金額</span><span>NT$ {{ order.pay_amount.toLocaleString() }}</span></div>
                </div>
              </div>
              <div>
                <div class="detail-section-title">配送資訊</div>
                <div class="detail-row-info"><span class="detail-key">方式</span><span>{{ deliveryLabel(order.delivery_method) }}</span></div>
                <div class="detail-row-info"><span class="detail-key">詳情</span><span>{{ deliveryDetail(order) }}</span></div>
                <div class="detail-row-info"><span class="detail-key">收件人</span><span>{{ order.recipient_name ?? '—' }}</span></div>
                <div class="detail-row-info"><span class="detail-key">電話</span><span>{{ order.recipient_phone ?? '—' }}</span></div>
                <div class="detail-row-info"><span class="detail-key">會員信箱</span><span>{{ order.member_email ?? '—' }}</span></div>
                <div v-if="order.remark" class="detail-row-info"><span class="detail-key">備註</span><span>{{ order.remark }}</span></div>
              </div>
              <div>
                <div class="detail-section-title">歷史狀態</div>
                <div v-for="(h, i) in order.status_history" :key="i" class="history-row">
                  <span class="status-badge history-badge" :class="statusFor(h.status).cls">{{ statusFor(h.status).label }}</span>
                  <span class="history-date">{{ formatDateTime(h.changed_at) }}</span>
                </div>
              </div>
            </div>
          </td>
        </tr>
      </template>
    </tbody>
  </table>
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

.search-info {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  background: none;
  border: none;
  padding: 0;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
}
.search-info:hover,
.search-info:focus-visible {
  color: rgba(255, 255, 255, 0.8);
}
.search-tooltip {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 240px;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.7);
  text-align: left;
  z-index: 50;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
/* hover 給桌機滑鼠使用；focus 讓觸控裝置點一下也能叫出來看，點別處失焦就自動收起 */
.search-info:hover .search-tooltip,
.search-info:focus-visible .search-tooltip {
  opacity: 1;
  pointer-events: auto;
}

.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
}
.filter-chip {
  padding: 6px 16px;
  border: 1px solid #444;
  border-radius: 20px;
  font-size: 13px;
  line-height: 1.6;
  cursor: pointer;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-family: inherit;
  transition: all 0.15s;
}
.filter-chip.selected,
.filter-chip:hover {
  border-color: #fff;
  color: #fff;
}
.filter-chip.selected {
  background: #222;
}

.export-btn {
  margin-left: auto;
  padding: 6px 16px;
  border: 1px solid #fff;
  border-radius: 20px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  background: transparent;
  color: #fff;
  font-family: inherit;
  transition: background-color 0.2s, color 0.2s;
}
.export-btn:hover:not(:disabled) {
  background: #fff;
  color: #000;
}
.export-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  border-color: #444;
  color: #444;
}

.orders-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.orders-table th {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid #333;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.orders-table td {
  padding: 14px 12px;
  border-bottom: 1px solid #1e1e1e;
  vertical-align: middle;
}
.order-row {
  cursor: pointer;
}
.order-row:hover td {
  background: #111;
}
.nowrap-cell {
  white-space: nowrap;
}
.dash {
  color: #444;
}

.order-no {
  font-weight: bold;
  font-size: 13px;
  letter-spacing: 0.5px;
}
.order-date {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
}
.order-email {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}
.order-amount {
  font-weight: bold;
}

.status-badge {
  font-size: 11px;
  padding: 3px 10px;
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

.status-select {
  background: #1e1e1e;
  color: #fff;
  border: 1px solid #444;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
}
.status-select:focus {
  border-color: #fff;
}

.account-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #1e1e1e;
  color: rgba(255, 255, 255, 0.6);
  border: 1px solid #333;
}

.detail-row {
  display: none;
}
.detail-row.open {
  display: table-row;
}
.detail-cell {
  padding: 0 12px 16px;
  background: #0a0a0a;
}
.detail-inner {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 30px;
  padding: 10px 0;
}
@media (max-width: 700px) {
  .detail-inner {
    grid-template-columns: 1fr;
  }
}
.detail-section-title {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 8px;
  font-weight: bold;
}
.detail-row-info {
  display: flex;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 4px;
}
.detail-key {
  color: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
}
.detail-items {
  margin-top: 4px;
}
.detail-item {
  display: flex;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid #1e1e1e;
  font-size: 13px;
  align-items: center;
}
.detail-item:last-child {
  border-bottom: none;
}
.detail-item-img {
  width: 36px;
  aspect-ratio: 6 / 9;
  object-fit: cover;
  background: #222;
  flex-shrink: 0;
}
.item-variant {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
.item-price {
  margin-left: auto;
  flex-shrink: 0;
}
.amount-summary {
  margin-top: 12px;
  border-top: 1px solid #222;
  padding-top: 10px;
}
.history-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 4px;
}
.history-badge {
  font-size: 10px;
}
.history-date {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.empty {
  color: rgba(255, 255, 255, 0.3);
  padding: 40px 0;
  text-align: center;
}
</style>
