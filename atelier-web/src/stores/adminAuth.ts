import { defineStore } from 'pinia'
import { apiFetch } from '@/composables/useApi'

// 後台管理員用獨立的 admin_token，跟前台會員的 user_token 是兩個分開的 session，
// 沿用舊版 admin/index.html 的做法（同一個瀏覽器可以同時登入會員又登入後台）
const STORAGE_KEY = 'admin_token'

interface VerifyOtpResult {
  message: string
  token: string
  user: { email: string; isAdmin: boolean; name: string | null }
}

export const useAdminAuthStore = defineStore('adminAuth', {
  state: () => ({
    token: localStorage.getItem(STORAGE_KEY) as string | null,
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
  },
  actions: {
    setToken(token: string) {
      this.token = token
      localStorage.setItem(STORAGE_KEY, token)
    },
    logout() {
      this.token = null
      localStorage.removeItem(STORAGE_KEY)
    },
    // 後台發送驗證碼：帳號不存在就直接失敗，不會自動註冊
    sendOtp(email: string) {
      return apiFetch<{ message: string }>('/api/auth/admin-send-otp', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
    },
    // 驗證碼比對成功後，要再檢查 isAdmin，不是管理員就拒絕、不存 token
    async verifyOtp(email: string, token: string) {
      const result = await apiFetch<VerifyOtpResult>('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, token }),
      })
      if (!result.user.isAdmin) {
        throw new Error('您不具備管理者權限，拒絕進入。')
      }
      this.setToken(result.token)
      return result
    },
  },
})
