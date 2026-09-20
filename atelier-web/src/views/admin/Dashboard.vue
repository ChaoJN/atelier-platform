<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApiFetch } from '@/composables/useApi'
import { useAdminGuard } from '@/composables/useAdminGuard'

const { handleAuthError } = useAdminGuard()

const stats = ref({
  todayOrders: null as number | null,
  pendingPayment: null as number | null,
  pendingReconcile: null as number | null,
  pendingShipment: null as number | null,
})

onMounted(async () => {
  try {
    const data = await adminApiFetch<{
      success: true
      todayOrders: number
      pendingPayment: number
      pendingReconcile: number
      pendingShipment: number
    }>('/api/admin/dashboard-stats')
    stats.value = {
      todayOrders: data.todayOrders,
      pendingPayment: data.pendingPayment,
      pendingReconcile: data.pendingReconcile,
      pendingShipment: data.pendingShipment,
    }
  } catch (err) {
    const status = (err as Error & { status?: number }).status
    if (status === 401 || status === 403) await handleAuthError()
  }
})
</script>

<template>
  <div class="card-grid">
    <div class="card">
      <h3>今日訂單</h3>
      <div class="number">{{ stats.todayOrders === null ? '—' : stats.todayOrders }} 筆</div>
    </div>
    <div class="card">
      <h3>待付款訂單</h3>
      <div class="number">{{ stats.pendingPayment === null ? '—' : stats.pendingPayment }} 筆</div>
    </div>
    <div class="card">
      <h3>待對帳訂單</h3>
      <div class="number">{{ stats.pendingReconcile === null ? '—' : stats.pendingReconcile }} 筆</div>
    </div>
    <div class="card">
      <h3>待出貨訂單</h3>
      <div class="number">{{ stats.pendingShipment === null ? '—' : stats.pendingShipment }} 筆</div>
    </div>
  </div>
</template>

<style scoped>
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}
.card {
  background-color: rgba(255, 255, 255, 0.15);
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(225, 225, 225, 0.4);
}
.card h3 {
  margin: 0;
  font-size: 16px;
}
.card .number {
  font-size: 36px;
  font-weight: bold;
  margin: 10px 0 0 0;
  color: #fff;
}
</style>
