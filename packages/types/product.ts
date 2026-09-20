export interface ProductVariant {
  id: number
  product_id: number
  color: string | null
  color_code: string | null
  size: string | null
  is_available: boolean
  created_at: string
  updated_at: string | null
}

// 這是公開端點會回傳的商品形狀，故意不含 cost_price（成本價）——
// 那個欄位只在後台管理用，公開 API 絕對不能回傳，見 atelier-api 的 routes/products.ts
export interface Product {
  id: number
  product_name: string
  product_code: string | null
  category: number[]
  description: string | null
  price: number
  is_discount: boolean
  discount_rate: number | null
  image_urls: string[]
  size_chart: Record<string, string>[] | null
  fitting_chart: Record<string, string>[] | null
  is_active: boolean
  created_at: string
  updated_at: string | null
  product_variants?: ProductVariant[]
}

// 後台管理專用形狀：比 Product 多一個 cost_price（成本價）。
// 故意用獨立的型別、不是把 cost_price 加回 Product，這樣「哪裡看得到成本」在型別層級就分得清楚
export interface AdminProduct extends Product {
  cost_price: number
}

export interface Category {
  id: number
  name: string
  slug: string
  seq: number | null
  is_active: boolean
}
