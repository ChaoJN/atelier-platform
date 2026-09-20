import { defineStore } from 'pinia'
import { apiFetch } from '@/composables/useApi'

interface VerifyOtpResult {
  message: string
  token: string
  user: { email: string; isAdmin: boolean; name: string | null }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('user_token') as string | null,
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
  },
  actions: {
    setToken(token: string) {
      this.token = token
      localStorage.setItem('user_token', token)
    },
    logout() {
      this.token = null
      localStorage.removeItem('user_token')
    },
    // 步驟一：發送驗證碼（會自動註冊新帳號）
    sendOtp(email: string) {
      return apiFetch<{ message: string }>('/api/auth/member-send-otp', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
    },
    // 步驟二：驗證碼比對成功後直接登入，把 token 存起來
    async verifyOtp(email: string, token: string) {
      const result = await apiFetch<VerifyOtpResult>('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, token }),
      })
      this.setToken(result.token)
      return result
    },
    // 步驟三（僅新用戶）：設定暱稱
    saveDisplayName(displayName: string) {
      return apiFetch('/api/members/me', {
        method: 'POST',
        body: JSON.stringify({ display_name: displayName }),
      })
    },
  },
})
