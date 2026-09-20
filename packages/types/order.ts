export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

export interface OrderItem {
  productId: number
  productName: string
  price: number
  originalPrice?: number | null
  image?: string
  colorCode?: string | null
  color?: string | null
  size?: string | null
  quantity: number
}

export interface OrderStatusEvent {
  status: OrderStatus
  changed_at: string
}

export interface Order {
  id: number
  order_no: string
  member_id: string
  order_amount: number
  pay_amount: number
  coupon_code?: string | null
  discount_amount?: number | null
  delivery_fee?: number | null
  order_items: OrderItem[]
  payment_method: string
  payment_account_info?: string | null
  recipient_name: string
  recipient_phone: string
  delivery_method: string
  delivery_info?: unknown
  remark?: string | null
  status: OrderStatus
  status_history: OrderStatusEvent[]
  created_at: string
  updated_at?: string | null
}
