import type { Bindings } from '../types/bindings'
import type { Order } from '@atelier/types'

type OrderMailPayload = Order & { member_email: string }

const DELIVERY_METHOD_MAP: Record<string, string> = {
  'store-to-store': '7-11 店到店',
  'hand-deliver': '雨停小班面交',
}

export async function sendOrderMail(env: Bindings, order: OrderMailPayload) {
  const itemsHtml = (order.order_items ?? [])
    .map(
      (item) => `<tr>
            <td style="padding:12px 2px; border-bottom:1px solid #F1EDE9; color:#4A4A4A; font-size:13px;">${item.productName}</td>
            <td style="padding:12px 2px; border-bottom:1px solid #F1EDE9; color:#7A7A7A; font-size:13px;">${[item.color, item.size].filter(Boolean).join(' / ') || '—'}</td>
            <td style="padding:12px 2px; border-bottom:1px solid #F1EDE9; text-align:right; color:#3D3025; font-weight:600; font-size:13px;">NT$ ${item.price.toLocaleString()} × ${item.quantity}</td>
        </tr>`
    )
    .join('')

  // --- 🌟 1. 動態解析運送資訊字串（已套用你修改的精美版本） 🌟 ---
  let parsedDeliveryInfo = '—'
  try {
    // 如果資料庫撈出來的是 JSON 字串，先解開它；如果已經是 Object 則直接用
    const info: any =
      typeof order.delivery_info === 'string' ? JSON.parse(order.delivery_info) : order.delivery_info

    if (order.delivery_method === 'store-to-store') {
      parsedDeliveryInfo = `7-11 門市｜(${info?.store_id || ''}) ${info?.store_name || ''}`
    } else if (order.delivery_method === 'hand-deliver') {
      parsedDeliveryInfo = `與雨停相約 ⋰˚𖦹 ᪤ ꩜｜${info?.meeting || '速速通知小編預約面交小班呦'}`
    } else {
      // 防呆備用（例如純文字地址）
      parsedDeliveryInfo = typeof info === 'string' ? info : JSON.stringify(info)
    }
  } catch {
    // 萬一出錯就直接顯示原始欄位文字
    parsedDeliveryInfo = (order.delivery_info as string) || '—'
  }

  // --- 🌟 2. 動態顯示運送方法名稱 🌟 ---
  const parsedDeliveryMethod = DELIVERY_METHOD_MAP[order.delivery_method] || order.delivery_method || '—'

  // 確保數值型態正確
  const orderAmount = order.order_amount ?? 0
  const discountAmount = order.discount_amount ?? 0
  const deliveryFee = order.delivery_fee ?? 0

  const html = `
        <div style="background-color:#F9F6F3; padding:40px 20px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <div style="max-width:600px; margin:0 auto; background-color:#ffffff; border-radius:12px; box-shadow:0 4px 12px rgba(61,48,37,0.05); overflow:hidden;">

                <div style="background-color:#3D3025; padding:32px 24px; text-align:center;">
                    <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:500; letter-spacing:2px;">Rainstopha Select</h1>
                    <p style="color:#CBB59D; margin:8px 0 0 0; font-size:14px; letter-spacing:1px;">感謝您的訂購！以下是您的訂單資訊</p>
                </div>

                <div style="padding:24px 24px 40px 24px;">

                    <table style="width:100%; margin-bottom:24px; font-size:14px; color:#4A4A4A;">
                        <tr>
                            <td style="padding:4px 0;"><strong>訂單編號：</strong><span style="color:#3D3025; font-family:monospace; font-size:15px;">${order.order_no}</span></td>
                        </tr>
                        <tr>
                            <td style="padding:4px 0;"><strong>訂單日期：</strong>${new Date(order.created_at).toLocaleDateString('zh-TW')}</td>
                        </tr>
                    </table>

                    <h3 style="color:#3D3025; border-bottom:2px solid #3D3025; padding-bottom:8px; margin:0 0 8px 0; font-size:15px;">商品明細</h3>
                    <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
                        <thead>
                            <tr style="border-bottom:1px solid #3D3025;">
                                <th style="text-align:left; padding:8px 0; color:#3D3025; font-size:13px;">商品名稱</th>
                                <th style="text-align:left; padding:8px 0; color:#3D3025; font-size:13px;">規格</th>
                                <th style="text-align:right; padding:8px 0; color:#3D3025; font-size:13px;">金額</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>

                    <div style="border-top:1px solid #3D3025; border-bottom:1px solid #3D3025; padding:12px 0; margin-bottom:16px; font-size:14px; color:#4A4A4A;">
                        <table style="width:100%; border-collapse:collapse; line-height:2;">
                            <tr>
                                <td style="text-align:left;">商品總計</td>
                                <td style="text-align:right; color:#3D3025;">NT$ ${orderAmount.toLocaleString()}</td>
                            </tr>
                            ${
                              discountAmount > 0
                                ? `
                            <tr>
                                <td style="text-align:left;">折扣優惠</td>
                                <td style="text-align:right; color:#D32F2F;">- NT$ ${discountAmount.toLocaleString()}</td>
                            </tr>`
                                : ''
                            }
                            <tr>
                                <td style="text-align:left;">運費</td>
                                <td style="text-align:right; color:#3D3025;">NT$ ${deliveryFee.toLocaleString()}</td>
                            </tr>
                        </table>
                    </div>

                    <div style="background:#FDFCFB; border:1px solid #F1EDE9; border-radius:8px; padding:16px; margin-bottom:20px; font-size:14px; color:#4A4A4A;">
                        <div style="margin-bottom:8px;">
                            <strong>付款方式：</strong>
                            <span>${order.payment_method === 'transfer' ? '銀行轉帳' : order.payment_method}</span>
                        </div>
                        <div style="font-size:16px; color:#3D3025;">
                            <strong>實付金額：</strong>
                            <span style="font-weight:bold; color:#A47E5C; font-size:18px;">NT$ ${order.pay_amount.toLocaleString()}</span>
                        </div>
                    </div>

                    <div style="background:#FDFCFB; border:1px solid #F1EDE9; border-radius:8px; padding:16px; margin-bottom:20px; font-size:14px; line-height:1.6; color:#4A4A4A;">
                        <h4 style="margin:0 0 10px 0; color:#3D3025; font-size:14px; border-bottom:1px dashed #F1EDE9; padding-bottom:6px;">運送與收件資訊</h4>
                        <div style="margin-bottom:4px;"><strong>收件人姓名：</strong>${order.recipient_name || '—'}</div>
                        <div style="margin-bottom:4px;"><strong>收件人電話：</strong>${order.recipient_phone || '—'}</div>
                        <div style="margin-bottom:4px;"><strong>配送方式：</strong>${parsedDeliveryMethod}</div>
                        <div style="line-height:1.5;"><strong></strong>${parsedDeliveryInfo}</div>

                        ${
                          order.delivery_method === 'store-to-store'
                            ? `
                        <span style="color:#D32F2F; font-size:12px; display:block; margin-top:6px; line-height:1.4;">※ 店到店取貨請務必攜帶與「收件人姓名」相符之身分證件。</span>
                        `
                            : ''
                        }
                    </div>

                    ${
                      order.remark
                        ? `
                    <div style="background:#F9F9F9; border-radius:8px; padding:16px; margin-bottom:20px; font-size:14px; color:#4A4A4A; line-height:1.5;">
                        <strong style="color:#3D3025; display:block; margin-bottom:4px;">訂單備註</strong>
                        <div style="white-space:pre-wrap; color:#666666;">${order.remark}</div>
                    </div>`
                        : ''
                    }

                    ${
                      order.payment_method === 'transfer'
                        ? `
                    <div style="background:#F6F1EC; border-left:4px solid #CBB59D; border-radius:4px; padding:16px; margin-bottom:24px; font-size:14px; line-height:1.6; color:#4A4A4A;">
                        <strong style="color:#3D3025; display:block; margin-bottom:6px;">溫馨提醒：匯款資訊</strong>
                        銀行：(013) 國泰世華銀行<br>
                        帳號：<strong style="color:#3D3025; font-family:monospace; font-size:15px;">269506125994</strong><br>
                        戶名：陳語庭<br>
                        <span style="color:#8C7662; font-size:13px; display:block; margin-top:6px;">※ 請於 2 天內完成匯款，並登入官網 [ACCOUNT > 訂單記錄] 填寫帳號末五碼以供核對 ※</span>
                    </div>`
                        : ''
                    }

                    <hr style="border:0; border-top:1px solid #F1EDE9; margin:32px 0 24px 0;">

                    <div style="text-align:center; background-color:#FFF9F5; border:1px dashed #EADCD0; border-radius:8px; padding:20px 14px;">
                        <p style="color:#D32F2F; font-size:14px; font-weight:600; margin:0 0 10px 0;">⚠️ 注意：請勿直接回覆此信件</p>
                        <p style="color:#666666; font-size:13px; margin:0 0 16px 0; line-height:1.5;">
                            此為系統自動發送信件。若有任何訂單修改、商品諮詢等相關問題，請點擊下方按鈕私訊小編，我們將盡快為您處理。
                        </p>
                        <a href="https://www.instagram.com/rainstopha.select" target="_blank" style="display:inline-block; background-color:#3D3025; color:#ffffff; text-decoration:none; font-size:13px; font-weight:500; padding:10px 24px; border-radius:20px; letter-spacing:1px; box-shadow:0 2px 6px rgba(61,48,37,0.15);">
                            私訊 Rainstopha Select
                        </a>
                    </div>

                </div>
            </div>
        </div>
    `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Rainstopha Select <service@rainstopha-select.com>',
      to: order.member_email,
      // 用 bcc 通知管理者：跟 cc 不同，客戶收到的信看不到這兩個內部信箱，也不會多算一封 Resend 額度
      bcc: ['rainstopha@gmail.com', 'sever.from.nom@gmail.com'],
      subject: `【Rainstopha Select】訂單確認 ${order.order_no}`,
      html,
    }),
  })

  // fetch() 只有網路層失敗才會 reject，Resend 回 4xx/5xx 是正常完成的 HTTP 回應，
  // 不主動檢查的話，寄信被拒絕（例如測試網域限制收件人）會完全沒有任何紀錄，難以排查
  if (!res.ok) {
    throw new Error(`Resend 回應 ${res.status}：${await res.text()}`)
  }
}
