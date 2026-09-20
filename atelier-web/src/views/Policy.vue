<template>
  <main class="policy-container">
    <h1 class="policy-title">SHOPPING POLICY</h1>

    <section class="policy-section">
      <h2 class="section-title">✦ 關於商品 ｜ Products</h2>
      <div class="policy-item">本店商品皆由指定通路代為購入，屬於 <span class="highlight">「非現貨」預購制度</span>。</div>
      <div class="policy-item">
        <strong>出貨時間：</strong>付款完成後，約 <span class="highlight">14–21 個工作天</span>（不含週休二日及國定假日）寄出。
      </div>
      <div class="policy-item">
        <strong>訂單限制：</strong>預購商品於付款後即向廠商追加訂購，訂單成立後<span class="highlight">恕不接受更改內容或取消</span>。
      </div>
    </section>

    <section class="policy-section">
      <h2 class="section-title">✦ 取消與退換貨 ｜ Returns</h2>
      <div class="policy-item">
        代購商品一律先付款，因無法確認韓國銷售狀況，故有可能會遇到缺貨，若缺貨商品將<span class="highlight">退款處理</span>。
      </div>
      <div class="policy-item">
        本店提供代購服務，屬依消費者要求所為之給付，下單後<span class="highlight">恕不接受取消或退換貨</span>（重大瑕疵除外）。
      </div>
    </section>

    <section class="policy-section">
      <h2 class="section-title">✦ 溫馨提醒 ｜ Notice</h2>
      <div class="policy-item"><strong>色差：</strong>螢幕顯示器與拍攝光線不同，照片與實品可能有些微色差。</div>
      <div class="policy-item"><strong>尺寸：</strong>手工測量誤差值在 <span class="highlight">+- 1–2cm</span> 內皆屬正常範圍。</div>
    </section>
  </main>
</template>

<style scoped>
.policy-container {
  max-width: 640px;
  margin: 0 auto;
  padding: 50px 24px 40px;
  line-height: 1.8;
  letter-spacing: 0.5px;
}
.policy-title {
  font-size: 20px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 50px;
  letter-spacing: 2px;
  color: #3d3025;
}
.policy-section {
  margin-bottom: 40px;
}
.section-title {
  font-size: 14px;
  font-weight: bold;
  color: #3d3025;
  border-bottom: 1px solid #3d3025;
  padding-bottom: 6px;
  margin-bottom: 16px;
  letter-spacing: 1px;
}
.policy-item {
  font-size: 13.5px;
  color: #555;
  margin-bottom: 12px;
}
.policy-item strong {
  color: #3d3025;
  display: inline-block;
  min-width: 50px;
}
.highlight {
  color: #a47e5c;
  font-weight: bold;
}
</style>
