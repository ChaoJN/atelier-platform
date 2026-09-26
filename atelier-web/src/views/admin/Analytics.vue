<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import type { Order, AdminProduct } from '@atelier/types'
import { adminApiFetch } from '@/composables/useApi'
import { useAdminGuard } from '@/composables/useAdminGuard'
import { useModal } from '@/composables/useModal'
import { taipeiToday } from '@/utils/date'

interface ProcurementRecord {
  product_id: number
  color: string | null
  size: string | null
  purchase_quantity: number
}

const { handleAuthError } = useAdminGuard()
const { confirm } = useModal()

const dateStart = ref(taipeiToday(-30))
const dateEnd = ref(taipeiToday(0))

const allOrders = ref<Order[]>([])
const costMap = reactive<Record<number, number>>({}) // productId -> cost_price
const procMap = reactive<Record<string, number>>({}) // "productId__color__size" -> purchase_quantity
const loading = ref(true)

function procKey(productId: number, color: string, size: string) {
  return `${productId}__${color}__${size}`
}

function getProc(productId: number, color: string, size: string) {
  return procMap[procKey(productId, color, size)] ?? 0
}

const hasCost = computed(() => Object.keys(costMap).length > 0)

const filteredOrders = computed(() => {
  // 用 +08:00 明確指定台北時區的當地時間邊界，不受瀏覽器本機時區影響
  const start = dateStart.value ? new Date(`${dateStart.value}T00:00:00+08:00`) : null
  const end = dateEnd.value ? new Date(`${dateEnd.value}T23:59:59+08:00`) : null
  return allOrders.value.filter((o) => {
    if (o.status === 'cancelled') return false
    const d = new Date(o.created_at)
    if (start && d < start) return false
    if (end && d > end) return false
    return true
  })
})

const revenue = computed(() => filteredOrders.value.reduce((sum, o) => sum + (o.pay_amount ?? 0), 0))

// 成本用 product_id 對應（舊版是用商品名稱字串比對，同名商品會撞在一起，改成用 id 更可靠）
const totalCost = computed(() =>
  filteredOrders.value.reduce((sum, o) => {
    const itemsCost = (o.order_items ?? []).reduce(
      (s, item) => s + (costMap[item.productId] ?? 0) * (item.quantity ?? 1),
      0
    )
    return sum + itemsCost + (o.delivery_fee ?? 0)
  }, 0)
)

const profit = computed(() => revenue.value - totalCost.value)

interface DemandRow {
  productId: number
  name: string
  color: string
  size: string
  qty: number
}

const demandRows = computed<DemandRow[]>(() => {
  const map = new Map<string, DemandRow>()
  for (const o of filteredOrders.value) {
    for (const item of o.order_items ?? []) {
      const color = item.color ?? ''
      const size = item.size ?? ''
      const key = `${item.productId}||${color}||${size}`
      if (!map.has(key)) {
        map.set(key, { productId: item.productId, name: item.productName, color, size, qty: 0 })
      }
      map.get(key)!.qty += item.quantity ?? 1
    }
  }
  return [...map.values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'zh-TW') || a.color.localeCompare(b.color) || a.size.localeCompare(b.size)
  )
})

function onDateStartChange() {
  if (dateStart.value && dateEnd.value && dateStart.value > dateEnd.value) dateEnd.value = dateStart.value
}
function onDateEndChange() {
  if (dateStart.value && dateEnd.value && dateEnd.value < dateStart.value) dateStart.value = dateEnd.value
}

async function saveProc(row: DemandRow, value: string) {
  const qty = parseInt(value, 10) || 0
  procMap[procKey(row.productId, row.color, row.size)] = qty
  try {
    await adminApiFetch('/api/admin/procurement', {
      method: 'PUT',
      body: JSON.stringify({ product_id: row.productId, color: row.color, size: row.size, purchase_quantity: qty }),
    })
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) await handleAuthError()
  }
}

async function resetProcurement() {
  const ok = await confirm('確定要重置所有採購紀錄嗎？', { confirmText: '重置', danger: true })
  if (!ok) return
  try {
    await adminApiFetch('/api/admin/procurement', { method: 'DELETE' })
    for (const key of Object.keys(procMap)) delete procMap[key]
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) await handleAuthError()
  }
}

async function loadProducts() {
  try {
    const { data } = await adminApiFetch<{ success: true; data: AdminProduct[] }>('/api/admin/products?limit=9999')
    for (const p of data) {
      if (p.cost_price != null) costMap[p.id] = p.cost_price
    }
  } catch {
    // 成本載入失敗就顯示「—」，不擋整頁（跟舊版行為一致）
  }
}

async function loadProcurement() {
  try {
    const { data } = await adminApiFetch<{ success: true; data: ProcurementRecord[] }>('/api/admin/procurement')
    for (const r of data) {
      procMap[procKey(r.product_id, r.color ?? '', r.size ?? '')] = r.purchase_quantity ?? 0
    }
  } catch {
    // 同上，不擋整頁
  }
}

async function loadOrders() {
  try {
    const { data } = await adminApiFetch<{ success: true; data: Order[] }>('/api/admin/orders')
    allOrders.value = data
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) await handleAuthError()
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadProducts(), loadProcurement()])
  await loadOrders()
})
</script>

<template>
  <div class="filter-bar">
    <label>日期區間</label>
    <input v-model="dateStart" type="date" @change="onDateStartChange" />
    <span class="filter-sep">—</span>
    <input v-model="dateEnd" type="date" @change="onDateEndChange" />
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-label">訂單數</div>
      <div class="summary-value">{{ loading ? '—' : filteredOrders.length }}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">預估收入</div>
      <div class="summary-value">{{ loading ? '—' : `NT$ ${revenue.toLocaleString()}` }}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">預估成本＝商品成本＋運費</div>
      <div class="summary-value">{{ !loading && hasCost ? `NT$ ${totalCost.toLocaleString()}` : '—' }}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">預估收益</div>
      <div class="summary-value" :class="!loading && hasCost ? (profit >= 0 ? 'profit' : 'loss') : ''">
        {{ !loading && hasCost ? `NT$ ${profit.toLocaleString()}` : '—' }}
      </div>
    </div>
  </div>

  <div class="section-header">
    <div class="section-label">採購統整</div>
    <button class="reset-btn" @click="resetProcurement">重置採購紀錄</button>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>商品名稱</th>
          <th>顏色</th>
          <th>尺寸</th>
          <th>訂單需求</th>
          <th>目前採購</th>
          <th>尚未採購</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="6" class="empty">載入中...</td>
        </tr>
        <tr v-else-if="demandRows.length === 0">
          <td colspan="6" class="empty">此區間無有效訂單</td>
        </tr>
        <tr v-for="row in demandRows" v-else :key="`${row.productId}-${row.color}-${row.size}`">
          <td>{{ row.name }}</td>
          <td>{{ row.color || '—' }}</td>
          <td>{{ row.size || '—' }}</td>
          <td><span class="qty-badge">{{ row.qty }}</span></td>
          <td>
            <input
              class="editable-input"
              type="number"
              min="0"
              placeholder="0"
              :value="getProc(row.productId, row.color, row.size) || ''"
              @change="saveProc(row, ($event.target as HTMLInputElement).value)"
            />
          </td>
          <td>
            <span
              class="qty-remaining"
              :class="{ done: Math.max(0, row.qty - getProc(row.productId, row.color, row.size)) === 0 }"
            >
              {{ Math.max(0, row.qty - getProc(row.productId, row.color, row.size)) === 0 ? '✓' : Math.max(0, row.qty - getProc(row.productId, row.color, row.size)) }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 24px;
  background: #1e1e1e;
  border-radius: 12px;
  padding: 16px 20px;
}
.filter-bar label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  width: 100%;
}
.filter-bar input[type='date'] {
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  font-family: inherit;
  padding: 6px 10px;
  cursor: pointer;
  position: relative;
}
.filter-bar input[type='date']::-webkit-calendar-picker-indicator {
  filter: invert(1);
  cursor: pointer;
  width: 100%;
  position: absolute;
  left: 0;
  opacity: 0;
}
.filter-sep {
  color: rgba(255, 255, 255, 0.3);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}
.summary-card {
  background: #1e1e1e;
  border-radius: 12px;
  padding: 18px 20px;
}
.summary-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 1px;
  margin-bottom: 8px;
}
.summary-value {
  font-size: 22px;
  font-weight: bold;
}
.summary-value.profit {
  color: #4ade80;
}
.summary-value.loss {
  color: #f87171;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.section-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 1px;
  text-transform: uppercase;
  font-weight: bold;
}
.reset-btn {
  padding: 6px 16px;
  background: transparent;
  border: 1px solid #555;
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.reset-btn:hover {
  border-color: #f87171;
  color: #f87171;
}

.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 640px;
}
thead tr {
  border-bottom: 1px solid #333;
}
th {
  text-align: left;
  padding: 10px 12px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.5px;
  font-weight: bold;
  white-space: nowrap;
}
td {
  padding: 10px 12px;
  border-bottom: 1px solid #1a1a1a;
  vertical-align: middle;
}
tr:last-child td {
  border-bottom: none;
}
tr:hover td {
  background: #161616;
}

.qty-badge {
  display: inline-block;
  background: #2a2a2a;
  border-radius: 6px;
  padding: 2px 10px;
  font-weight: bold;
  min-width: 32px;
  text-align: center;
}
.qty-remaining {
  font-weight: bold;
  color: #f59e0b;
}
.qty-remaining.done {
  color: #4ade80;
}

.editable-input {
  background: #2a2a2a;
  border: 1px solid #333;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  font-family: inherit;
  padding: 4px 8px;
  width: 72px;
  text-align: center;
}
.editable-input:focus {
  outline: none;
  border-color: #666;
}
.editable-input::-webkit-outer-spin-button,
.editable-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.editable-input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.empty {
  color: rgba(255, 255, 255, 0.3);
  padding: 60px 0;
  text-align: center;
  font-size: 14px;
}
</style>
