import { useRouter } from 'vue-router'
import { useAdminAuthStore } from '@/stores/adminAuth'
import { useModal } from './useModal'

// 每支後台頁面呼叫 API 時，遇到 token 過期/失效（401/403）都要做同一件事：
// 清掉 admin_token、提示、導回後台登入頁。抽成共用邏輯，不用每頁重複寫
export function useAdminGuard() {
  const router = useRouter()
  const admin = useAdminAuthStore()
  const { alert } = useModal()

  async function handleAuthError() {
    admin.logout()
    await alert('登入已過期，請重新登入。')
    router.push('/admin/login')
  }

  return { handleAuthError }
}
