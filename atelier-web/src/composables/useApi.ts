const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(path: string, options: RequestInit, tokenKey: string): Promise<T> {
  const token = localStorage.getItem(tokenKey)
  // FormData（圖片上傳）不能手動設 Content-Type，瀏覽器要自己補上正確的 multipart boundary
  const isFormData = options.body instanceof FormData

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  const data = await res.json()
  if (!res.ok) {
    const error = new Error(data.error ?? '請求失敗') as Error & { status?: number }
    error.status = res.status
    throw error
  }
  return data as T
}

// 前台會員用，帶 user_token
export function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return request<T>(path, options, 'user_token')
}

// 後台管理用，帶 admin_token（跟 stores/adminAuth.ts 存的 key 一致，兩個 session 分開）
export function adminApiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return request<T>(path, options, 'admin_token')
}
