<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import { useAuthStore } from '@/stores/auth'

type Step = 'email' | 'otp' | 'name'

const router = useRouter()
const auth = useAuthStore()

const step = ref<Step>('email')
const email = ref('')
const agreed = ref(false)
const otp = ref('')
const displayName = ref('')

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
  if (!email.value) return showTip('請先輸入 Email')
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.value)) return showTip('請輸入有效的 Email 格式')
  if (!agreed.value) return showTip('請同意新用戶自動註冊或舊用戶登入')

  sending.value = true
  try {
    const { message } = await auth.sendOtp(email.value)
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
    const { user } = await auth.verifyOtp(email.value, otp.value)
    if (!user.name) {
      showTip('驗證成功！請設定您的暱稱', 'success')
      step.value = 'name'
    } else {
      showTip('登入成功！正在跳轉...', 'success')
      redirect()
    }
  } catch (err) {
    showTip((err as Error).message)
  } finally {
    verifying.value = false
  }
}

async function saveNameAndRedirect() {
  const name = displayName.value.trim()
  if (!name) return showTip('請輸入暱稱')
  try {
    await auth.saveDisplayName(name)
    redirect()
  } catch (err) {
    showTip((err as Error).message)
  }
}

function skipName() {
  redirect()
}

function redirect() {
  const target = localStorage.getItem('redirect_after_login') ?? '/'
  localStorage.removeItem('redirect_after_login')
  router.push(target)
}
</script>

<template>
  <AuthLayout>
    <div class="login-card">
      <h1 class="title">會員登入 / 註冊</h1>

      <div v-if="step === 'email'" class="step">
        <label for="email-input">電子郵件</label>
        <input
          id="email-input"
          v-model="email"
          type="email"
          placeholder="example@mail.com"
          @keydown.enter="sendOtp"
        />
        <div class="checkbox-row">
          <input id="agree" v-model="agreed" type="checkbox" />
          <label for="agree">我同意新用戶自動註冊或舊用戶登入</label>
        </div>
        <button class="primary-btn" :disabled="sending || countdown > 0" @click="sendOtp">
          {{ countdown > 0 ? `${countdown} 秒後可再次獲取驗證碼` : '獲取驗證碼' }}
        </button>
      </div>

      <div v-else-if="step === 'otp'" class="step">
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

      <div v-else class="step">
        <p class="welcome">歡迎加入！請設定您的暱稱</p>
        <input v-model="displayName" type="text" placeholder="暱稱（可稍後在帳號頁修改）" maxlength="20" />
        <button class="primary-btn" @click="saveNameAndRedirect">完成，進入網站</button>
        <button class="secondary-btn" @click="skipName">略過</button>
      </div>

      <p v-if="tip" class="tip" :class="tipType">{{ tip }}</p>
    </div>
  </AuthLayout>
</template>

<style scoped>
.login-card {
  width: 100%;
  max-width: 380px;
}
.title {
  font-size: 20px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 28px;
  letter-spacing: 1px;
  color: #333;
}
.step {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
label {
  font-size: 13px;
  color: #666;
}
input[type='email'],
input[type='text'] {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 16px;
  font-family: inherit;
  box-sizing: border-box;
}
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.checkbox-row label {
  font-size: 13px;
  color: #666;
  cursor: pointer;
}
input[type='checkbox'] {
  width: auto;
}
.primary-btn {
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
  margin-top: 4px;
}
.primary-btn:hover:not(:disabled) {
  background: #000;
}
.primary-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
.secondary-btn,
.link-btn {
  width: 100%;
  padding: 12px;
  background: transparent;
  border: 1px solid #ddd;
  color: #888;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.secondary-btn:hover,
.link-btn:hover {
  border-color: #333;
  color: #333;
}
.countdown {
  font-size: 13px;
  color: #888;
  text-align: center;
  margin: 4px 0 0;
}
.welcome {
  font-size: 14px;
  color: #333;
  margin-bottom: 4px;
}
.sent-to {
  font-size: 13px;
  color: #666;
  margin: 0 0 4px;
}
.sent-to strong {
  color: #333;
}
.text-link {
  background: none;
  border: none;
  padding: 0;
  margin-left: 6px;
  font-size: 12px;
  color: #888;
  text-decoration: underline;
  cursor: pointer;
  font-family: inherit;
}
.text-link:hover {
  color: #333;
}
.tip {
  margin: 16px 0 0;
  font-size: 13px;
  padding: 10px 12px;
  border-radius: 6px;
}
.tip.error {
  background: #fdecea;
  color: #cc0000;
  border-left: 3px solid #cc0000;
}
.tip.success {
  background: #eaf6ec;
  color: #1a7f37;
  border-left: 3px solid #1a7f37;
}
</style>
