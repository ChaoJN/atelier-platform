<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useCartStore } from '@/stores/cart'
import { useAuthStore } from '@/stores/auth'
import { apiFetch } from '@/composables/useApi'
import { useModal } from '@/composables/useModal'

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

const router = useRouter()
const cart = useCartStore()
const auth = useAuthStore()
const { alert } = useModal()

type ShippingMethod = 'store-to-store' | 'hand-deliver'

const MEETING_OPTIONS = ['週日小班 10/18（日）', '週一小班 10/19（一）', '週一小班 10/26（一）']

const name = ref('')
const phone = ref('')
const remark = ref('')
const shippingMethod = ref<ShippingMethod>('store-to-store')
const storeId = ref('')
const storeName = ref('')
const meetingInfo = ref('')
const paymentMethod = ref('transfer')

const nameEl = ref<HTMLInputElement>()
const phoneEl = ref<HTMLInputElement>()
const storeIdEl = ref<HTMLInputElement>()
const storeNameEl = ref<HTMLInputElement>()
const meetingEl = ref<HTMLElement>()

const invalid = ref<Record<string, boolean>>({})
const submitting = ref(false)
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

const orderAmount = computed(() =>
  cart.items.reduce((sum, item) => sum + (item.originalPrice ?? item.price) * item.quantity, 0)
)
const discountAmount = computed(() => orderAmount.value - cart.subtotal)
const deliveryFee = computed(() => (shippingMethod.value === 'store-to-store' ? 60 : 0))
const finalTotal = computed(() => cart.subtotal + deliveryFee.value)

function variantLabel(color: string | null | undefined, size: string | null | undefined) {
  return [color, size].filter(Boolean).join('・')
}

function onImgError(e: Event) {
  ;(e.target as HTMLImageElement).src = BLANK
}

function showToast(msg: string) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastMsg.value = ''), 2000)
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => showToast('已複製帳號'))
}

async function markInvalid(field: string, el?: HTMLElement) {
  invalid.value[field] = true
  await nextTick()
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el?.focus()
}

function clearInvalid(field: string) {
  invalid.value[field] = false
}

async function submitOrder() {
  // 依運送方式檢核並收集細節
  let deliveryInfo: Record<string, string> | null = null
  if (shippingMethod.value === 'store-to-store') {
    if (!storeId.value.trim()) return markInvalid('storeId', storeIdEl.value)
    if (!storeName.value.trim()) return markInvalid('storeName', storeNameEl.value)
    deliveryInfo = { store_id: storeId.value.trim(), store_name: storeName.value.trim() }
  } else {
    if (!meetingInfo.value.trim()) return markInvalid('meeting', meetingEl.value)
    deliveryInfo = { meeting: meetingInfo.value.trim() }
  }

  if (!name.value.trim()) return markInvalid('name', nameEl.value)
  if (!/^09\d{8}$/.test(phone.value.trim())) return markInvalid('phone', phoneEl.value)

  submitting.value = true
  try {
    const result = await apiFetch<{ success: true; data: { order_no: string }[] }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        order_amount: orderAmount.value,
        pay_amount: finalTotal.value,
        discount_amount: discountAmount.value || 0,
        delivery_fee: deliveryFee.value || null,
        order_items: cart.items,
        payment_method: paymentMethod.value,
        recipient_name: name.value.trim(),
        recipient_phone: phone.value.trim(),
        delivery_method: shippingMethod.value,
        delivery_info: deliveryInfo,
        remark: remark.value.trim() || null,
      }),
    })

    await alert(`訂單成立！\n訂單編號：${result.data[0].order_no}`)
    localStorage.removeItem('cart')
    cart.items.splice(0, cart.items.length)
    router.push('/product')
  } catch (err) {
    const error = err as Error & { status?: number }
    if (error.status === 401) {
      localStorage.setItem(
        'checkout_draft',
        JSON.stringify({
          name: name.value,
          phone: phone.value,
          remark: remark.value,
          shipping: shippingMethod.value,
          payment: paymentMethod.value,
          storeId: storeId.value,
          storeName: storeName.value,
          meeting: meetingInfo.value,
        })
      )
      localStorage.setItem('redirect_after_login', '/checkout')
      await alert('請先登入')
      router.push('/login')
      return
    }
    await alert(error.message)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  if (!auth.isLoggedIn) {
    localStorage.setItem('redirect_after_login', '/checkout')
    router.push('/login')
    return
  }
  if (cart.items.length === 0) {
    router.push('/cart')
    return
  }

  // 還原登入前已填的草稿
  const draft = JSON.parse(localStorage.getItem('checkout_draft') ?? 'null')
  if (draft) {
    localStorage.removeItem('checkout_draft')
    if (draft.name) name.value = draft.name
    if (draft.phone) phone.value = draft.phone
    if (draft.remark) remark.value = draft.remark
    if (draft.payment) paymentMethod.value = draft.payment
    if (draft.shipping) shippingMethod.value = draft.shipping
    if (draft.storeId) storeId.value = draft.storeId
    if (draft.storeName) storeName.value = draft.storeName
    if (draft.meeting) meetingInfo.value = draft.meeting
  }
})
</script>

<template>
  <div class="toast" :class="{ show: !!toastMsg }">{{ toastMsg }}</div>

  <header class="checkout-header">
    <button class="back-btn" aria-label="返回" @click="router.push('/cart')">←</button>
    <div class="logo" @click="router.push('/')">Rainstopha Select</div>
    <div class="header-end"></div>
  </header>

  <div class="checkout-wrap">
    <!-- 訂單摘要 -->
    <div>
      <div class="section-title">訂單摘要</div>
      <div v-for="(item, i) in cart.items" :key="i" class="order-item">
        <img class="order-item-img" :src="item.image || BLANK" alt="" @error="onImgError" />
        <div class="order-item-info">
          <div class="order-item-name">{{ item.productName }}</div>
          <div v-if="variantLabel(item.color, item.size)" class="order-item-variant">
            {{ variantLabel(item.color, item.size) }}
          </div>
          <div class="order-item-price">NT$ {{ item.price }} × {{ item.quantity }}</div>
        </div>
        <div class="order-item-subtotal">NT$ {{ item.price * item.quantity }}</div>
      </div>
    </div>

    <!-- 運送方式 -->
    <div>
      <div class="section-title">運送方式</div>
      <div class="option-group">
        <label class="option-item" :class="{ selected: shippingMethod === 'store-to-store' }">
          <input v-model="shippingMethod" type="radio" name="shipping" value="store-to-store" />
          <div class="option-label">7-11 店到店</div>
        </label>
        <label class="option-item" :class="{ selected: shippingMethod === 'hand-deliver' }">
          <input v-model="shippingMethod" type="radio" name="shipping" value="hand-deliver" />
          <div class="option-label">雨停小班面交</div>
        </label>
      </div>

      <div v-if="shippingMethod === 'store-to-store'" class="delivery-detail">
        <a href="https://emap.pcsc.com.tw/" target="_blank" class="store-finder-link">點我查詢門市</a>
        <div class="form-group">
          <label>店號 *</label>
          <input
            ref="storeIdEl"
            v-model="storeId"
            type="text"
            placeholder="請輸入店號"
            :class="{ invalid: invalid.storeId }"
            @input="clearInvalid('storeId')"
          />
        </div>
        <div class="form-group">
          <label>店名 *</label>
          <input
            ref="storeNameEl"
            v-model="storeName"
            type="text"
            placeholder="請輸入店名"
            :class="{ invalid: invalid.storeName }"
            @input="clearInvalid('storeName')"
          />
        </div>
      </div>
      <div v-else class="delivery-detail">
        <div class="form-group">
          <label>與雨停相約</label>
          <div ref="meetingEl" class="meeting-options">
            <label
              v-for="opt in MEETING_OPTIONS"
              :key="opt"
              class="meeting-option"
              :class="{ selected: meetingInfo === opt, invalid: invalid.meeting }"
            >
              <input
                v-model="meetingInfo"
                type="radio"
                name="meeting"
                :value="opt"
                @change="clearInvalid('meeting')"
              />
              {{ opt }}
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- 收件資訊 -->
    <div>
      <div class="section-title">收件資訊</div>
      <div class="form-stack">
        <div class="form-row">
          <div class="form-group">
            <label>姓名 *</label>
            <input
              ref="nameEl"
              v-model="name"
              type="text"
              placeholder="收件人姓名"
              :class="{ invalid: invalid.name }"
              @input="clearInvalid('name')"
            />
          </div>
          <div class="form-group">
            <label>電話 *</label>
            <input
              ref="phoneEl"
              v-model="phone"
              type="tel"
              placeholder="0912345678"
              :class="{ invalid: invalid.phone }"
              @input="clearInvalid('phone')"
            />
          </div>
        </div>
        <div class="form-group">
          <label>備註</label>
          <textarea v-model="remark" placeholder="訂單備註（選填）"></textarea>
        </div>
      </div>
    </div>

    <!-- 付款方式 -->
    <div>
      <div class="section-title">付款方式</div>
      <div class="option-group">
        <label class="option-item selected">
          <input v-model="paymentMethod" type="radio" name="payment" value="transfer" />
          <div>
            <div class="option-label">銀行轉帳</div>
            <div class="option-sub">下單後 3 天內完成匯款</div>
          </div>
        </label>
      </div>
      <div class="transfer-info">
        <strong>匯款資訊</strong><br />
        銀行：(013) 國泰世華銀行<br />
        <div class="account-row">
          <span>帳號：2695-0612-5994</span>
          <button class="copy-btn" aria-label="複製帳號" @click="copyToClipboard('269506125994')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
        戶名：陳語庭
      </div>
    </div>

    <!-- 金額合計 -->
    <div>
      <div class="section-title">金額合計</div>
      <div class="total-row"><span class="label">商品總計</span><span>NT$ {{ orderAmount.toLocaleString() }}</span></div>
      <div v-if="discountAmount > 0" class="total-row">
        <span class="label">折扣</span><span>−NT$ {{ discountAmount.toLocaleString() }}</span>
      </div>
      <div class="total-row"><span class="label">運費</span><span>{{ deliveryFee === 0 ? 'NT$ 0' : `NT$ ${deliveryFee}` }}</span></div>
      <div class="total-row final"><span>應付金額</span><span>NT$ {{ finalTotal.toLocaleString() }}</span></div>
    </div>

    <button class="submit-btn" :disabled="submitting" @click="submitOrder">
      {{ submitting ? '處理中...' : '確認下單' }}
    </button>
  </div>

  <footer class="checkout-footer">
    <div class="footer-links"><RouterLink to="/policy">購物須知</RouterLink></div>
    Copyright © 2026 Rainstopha Select
  </footer>
</template>

<style scoped>
.checkout-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: #fff;
  border-bottom: 1px solid #eee;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 24px;
  height: 56px;
}
.back-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 22px;
  color: #333;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-self: start;
}
.logo {
  grid-column: 2;
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 1px;
  color: #333;
  cursor: pointer;
}

.checkout-wrap {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 24px 80px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.section-title {
  font-size: 16px;
  font-weight: bold;
  letter-spacing: 1px;
  color: #888;
  text-transform: uppercase;
  margin-bottom: 16px;
}

.order-item {
  display: flex;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid #f0f0f0;
  align-items: center;
}
.order-item:first-of-type {
  border-top: 1px solid #f0f0f0;
}
.order-item-img {
  width: 56px;
  aspect-ratio: 6 / 9;
  object-fit: cover;
  background: #f5f5f5;
  flex-shrink: 0;
}
.order-item-info {
  flex: 1;
}
.order-item-name {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 4px;
}
.order-item-variant {
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
}
.order-item-price {
  font-size: 13px;
}
.order-item-subtotal {
  font-size: 14px;
  font-weight: bold;
  flex-shrink: 0;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: 13px;
  color: #555;
}
.form-group input,
.form-group textarea {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}
.form-group input:focus,
.form-group textarea:focus {
  border-color: #333;
}
.form-group input.invalid {
  border-color: #ff7875;
}
.form-group textarea {
  resize: vertical;
  min-height: 80px;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 480px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

.option-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.option-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.option-item.selected {
  border-color: #333;
}
.option-item input[type='radio'] {
  accent-color: #333;
  width: 16px;
  height: 16px;
}
.option-label {
  font-size: 14px;
}

.meeting-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.meeting-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: border-color 0.15s;
}
.meeting-option.selected {
  border-color: #333;
}
.meeting-option.invalid {
  border-color: #ff7875;
}
.meeting-option input[type='radio'] {
  accent-color: #333;
  width: 16px;
  height: 16px;
}
.option-sub {
  font-size: 12px;
  color: #888;
}

.delivery-detail {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.store-finder-link {
  font-size: 13px;
  color: #888;
}

.transfer-info {
  background: #f9f9f9;
  border-radius: 4px;
  padding: 14px 16px;
  font-size: 13px;
  color: #555;
  line-height: 1.8;
  margin-top: 12px;
}
.account-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.copy-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  color: #555;
}

.total-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  padding: 8px 0;
}
.total-row.final {
  font-size: 16px;
  font-weight: bold;
  border-top: 1px solid #eee;
  padding-top: 14px;
  margin-top: 4px;
}
.total-row .label {
  color: #888;
}

.submit-btn {
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
.submit-btn:hover:not(:disabled) {
  background: #000;
}
.submit-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.checkout-footer {
  text-align: center;
  padding: 20px 0;
  font-size: 11px;
  color: #aaa;
}
.footer-links {
  margin-bottom: 4px;
}
.footer-links a {
  color: #aaa;
  text-decoration: underline;
  font-size: 11px;
  letter-spacing: 0.5px;
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
