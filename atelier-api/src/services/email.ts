import type { Bindings } from '../types/bindings'
import type { Order } from '@atelier/types'

type OrderMailPayload = Order & { member_email: string }

export async function sendOrderMail(env: Bindings, order: OrderMailPayload) {
  const itemsHtml = (order.order_items ?? [])
    .map(
      (item) => `<tr>
            <td style="padding:6px 0;">${item.productName}</td>
            <td style="padding:6px 0;">${[item.color, item.size].filter(Boolean).join(' / ') || '—'}</td>
            <td style="padding:6px 0; text-align:right;">NT$ ${item.price} × ${item.quantity}</td>
        </tr>`
    )
    .join('')

  const html = `
        <h2 style="margin-bottom:16px;">訂單確認</h2>
        <p>感謝您的訂購！以下是您的訂單資訊：</p>
        <br>
        <p><strong>訂單編號：</strong>${order.order_no}</p>
        <p><strong>訂單日期：</strong>${new Date(order.created_at).toLocaleDateString('zh-TW')}</p>
        <br>
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <thead>
                <tr style="border-bottom:1px solid #eee;">
                    <th style="text-align:left; padding:6px 0;">商品</th>
                    <th style="text-align:left; padding:6px 0;">規格</th>
                    <th style="text-align:right; padding:6px 0;">金額</th>
                </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
        </table>
        <br>
        <p><strong>實付金額：</strong>NT$ ${order.pay_amount.toLocaleString()}</p>
        <p><strong>付款方式：</strong>${order.payment_method === 'transfer' ? '銀行轉帳' : order.payment_method}</p>
        ${
          order.payment_method === 'transfer'
            ? `
        <br>
        <div style="background:#f9f9f9; border-radius:6px; padding:14px 16px; font-size:14px; line-height:1.8;">
            <strong>匯款資訊</strong><br>
            銀行：(013) 國泰世華銀行<br>
            帳號：<strong>012-3456-7890123</strong><br>
            戶名：Take a Breath 有限公司<br>
            <span style="color:#888; font-size:13px;">請於 3 天內完成匯款，並在訂單頁面填寫帳號末五碼以供核對。</span>
        </div>`
            : ''
        }
        <br>
        <p style="color:#888; font-size:13px;">如有任何問題，請回覆此信聯絡我們。</p>
    `

  // TODO: from 目前用 Resend 的測試網域，正式上線前要在 Resend 驗證自己的寄件網域再換掉，
  // 不然大多數收件匣會把信擋掉或丟垃圾信
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Take a Breath <onboarding@resend.dev>',
      to: order.member_email,
      subject: `【Take a Breath】訂單確認 ${order.order_no}`,
      html,
    }),
  })

  // fetch() 只有網路層失敗才會 reject，Resend 回 4xx/5xx 是正常完成的 HTTP 回應，
  // 不主動檢查的話，寄信被拒絕（例如測試網域限制收件人）會完全沒有任何紀錄，難以排查
  if (!res.ok) {
    throw new Error(`Resend 回應 ${res.status}：${await res.text()}`)
  }
}
