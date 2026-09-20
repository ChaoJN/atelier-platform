<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AdminAuthLayout from '@/layouts/AdminAuthLayout.vue'
import { useAdminAuthStore } from '@/stores/adminAuth'

const router = useRouter()
const admin = useAdminAuthStore()

const step = ref<'email' | 'otp'>('email')
const email = ref('')
const otp = ref('')

const sending = ref(false)
const verifying = ref(false)
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | undefined

const tip = ref('')
const tipType = ref<'error' | 'success'>('error')

function showTip(message: string, type: 'error' | 'success' = 'error') {
  tip.value = message
  tipType.value = type
}

function startCountdown() {
  countdown.value = 60
  countdownTimer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) clearInterval(countdownTimer)
  }, 1000)
}

onUnmounted(() => clearInterval(countdownTimer))

async function sendOtp() {
  if (countdown.value > 0) return
  if (!email.value) return showTip('請輸入管理員 Email')
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.value)) return showTip('請輸入有效的 Email 格式')

  sending.value = true
  try {
    const { message } = await admin.sendOtp(email.value)
    showTip(message, 'success')
    step.value = 'otp'
    startCountdown()
  } catch (err) {
    showTip((err as Error).message)
  } finally {
    sending.value = false
  }
}

function backToEmail() {
  step.value = 'email'
  otp.value = ''
  tip.value = ''
  // 倒數是針對「剛剛那個信箱」的限流提示，換信箱後就不適用了；
  // 如果使用者其實是打算重打同一個信箱，Supabase 還是會在伺服器端擋下來，不算繞過限流
  clearInterval(countdownTimer)
  countdown.value = 0
}

async function verifyOtp() {
  if (verifying.value) return
  if (!otp.value) return showTip('請輸入驗證碼')

  verifying.value = true
  try {
    await admin.verifyOtp(email.value, otp.value)
    showTip('管理員身份確認，正在跳轉...', 'success')
    router.push('/admin/dashboard')
  } catch (err) {
    showTip((err as Error).message)
  } finally {
    verifying.value = false
  }
}
</script>

<template>
  <AdminAuthLayout>
    <div class="login-card">
      <h1 class="title">管理員登入系統</h1>

      <div v-if="step === 'email'" class="step">
        <label for="admin-email-input">電子郵件</label>
        <input
          id="admin-email-input"
          v-model="email"
          type="email"
          placeholder="example@mail.com"
          @keydown.enter="sendOtp"
        />
        <button class="primary-btn" :disabled="sending || countdown > 0" @click="sendOtp">
          {{ countdown > 0 ? `${countdown} 秒後可再次獲取驗證碼` : '獲取驗證碼' }}
        </button>
      </div>

      <div v-else class="step">
        <p class="sent-to">
          驗證碼已發送至 <strong>{{ email }}</strong>
          <button type="button" class="text-link" @click="backToEmail">修改信箱</button>
        </p>
        <input
          v-model="otp"
          type="text"
          placeholder="請輸入 8 位數驗證碼"
          maxlength="8"
          autocomplete="off"
          @keydown.enter="verifyOtp"
        />
        <button class="primary-btn" :disabled="verifying" @click="verifyOtp">確認登入</button>
        <p v-if="countdown > 0" class="countdown">{{ countdown }} 秒後可再次獲取驗證碼</p>
        <button v-else class="link-btn" :disabled="sending" @click="sendOtp">重新發送驗證碼</button>
      </div>

      <p v-if="tip" class="tip" :class="tipType">{{ tip }}</p>
    </div>
  </AdminAuthLayout>
</template>

<style scoped>
.login-card {
  width: 100%;
  max-width: 380px;
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 32px 28px;
  box-sizing: border-box;
}
.title {
  font-size: 20px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 28px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.9);
}
.step {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}
input[type='email'],
input[type='text'] {
  width: 100%;
  padding: 12px;
  background-color: #111;
  border: 1px solid #444;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 16px;
  font-family: inherit;
  box-sizing: border-box;
  outline: none;
}
input[type='email']:focus,
input[type='text']:focus {
  border-color: #666;
}
.primary-btn {
  width: 100%;
  padding: 14px;
  background: #fff;
  color: #000;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
  font-family: inherit;
  letter-spacing: 1px;
  cursor: pointer;
  transition: opacity 0.2s;
  margin-top: 4px;
}
.primary-btn:hover:not(:disabled) {
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.8);
}
.primary-btn:disabled {
  background: #555;
  color: rgba(255, 255, 255, 0.5);
  cursor: not-allowed;
  box-shadow: none;
}
.link-btn {
  width: 100%;
  padding: 12px;
  background: transparent;
  border: 1px solid #444;
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.link-btn:hover {
  border-color: #aaa;
  color: rgba(255, 255, 255, 0.9);
}
.countdown {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  margin: 4px 0 0;
}
.sent-to {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 4px;
}
.sent-to strong {
  color: rgba(255, 255, 255, 0.9);
}
.text-link {
  background: none;
  border: none;
  padding: 0;
  margin-left: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  text-decoration: underline;
  cursor: pointer;
  font-family: inherit;
}
.text-link:hover {
  color: rgba(255, 255, 255, 0.9);
}
.tip {
  margin: 16px 0 0;
  font-size: 13px;
  padding: 10px 12px;
  border-radius: 8px;
}
.tip.error {
  background: #3d1a1a;
  color: #ff7875;
  border-left: 3px solid #ff7875;
}
.tip.success {
  background: #1a3d2a;
  color: #4ade80;
  border-left: 3px solid #4ade80;
}
</style>
