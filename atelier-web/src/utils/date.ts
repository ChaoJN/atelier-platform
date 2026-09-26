// 全店只在台灣營運，日期一律以台北時區（UTC+8，無日光節約）為準，
// 不能用瀏覽器本機時區或 toISOString()（UTC）算「今天」，
// 否則凌晨 0~8 點之間開後台，算出來的「今天」會是 UTC 的昨天。
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000

export function taipeiToday(offsetDays = 0): string {
  const d = new Date(Date.now() + TAIPEI_OFFSET_MS)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export function taipeiMonthsAgo(months: number): string {
  const d = new Date(Date.now() + TAIPEI_OFFSET_MS)
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString().slice(0, 10)
}
