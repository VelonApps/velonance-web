import { d, parseAmount, rateKey } from './finance'
// Canlı kurlar yalnız ekranda tahmin olarak kullanılır; Firestore'a sadece yönetici "Kaydet" derse yazılır.
// Kaynaklara hiçbir kullanıcı veya finans verisi gönderilmez, yalnız herkese açık kur listesi okunur.
const TRUNCGIL = 'https://finans.truncgil.com/today.json'
const FRANKFURTER = 'https://api.frankfurter.dev/v1/latest?base=TRY&symbols=USD,EUR,GBP'
export const liveGold: Record<string, string> = {
  Gram: 'gram-altin',
  Çeyrek: 'ceyrek-altin',
  Yarım: 'yarim-altin',
  Tam: 'tam-altin',
  Cumhuriyet: 'cumhuriyet-altini',
}
const liveCurrencies = ['USD', 'EUR', 'GBP']
export type LiveRate = { unit: string; asset: 'currency' | 'gold'; priceMicros: number }
export type LiveRates = { rows: LiveRate[]; source: string; updatedAt: string }
async function getJson(url: string) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' })
    if (!response.ok) throw new Error('Kur kaynağı yanıt vermedi.')
    return (await response.json()) as Record<string, unknown>
  } finally {
    clearTimeout(timer)
  }
}
const micros = (value: string) => {
  const n = d(value).times(1e6).toDecimalPlaces(0).toNumber()
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Geçersiz kur.')
  return n
}
// Alış ve satışın ortalaması: borcun bugünkü değeri için tarafsız bir tahmin.
export function parseTruncgil(data: Record<string, unknown>): LiveRates {
  const mid = (key: string) => {
    const row = data[key] as Record<string, string> | undefined
    if (!row?.['Alış'] || !row?.['Satış']) return null
    try {
      return micros(parseAmount(row['Alış']).plus(parseAmount(row['Satış'])).div(2).toString())
    } catch {
      return null
    }
  }
  const rows: LiveRate[] = []
  for (const unit of liveCurrencies) {
    const price = mid(unit)
    if (price) rows.push({ unit, asset: 'currency', priceMicros: price })
  }
  for (const [unit, key] of Object.entries(liveGold)) {
    const price = mid(key)
    if (price) rows.push({ unit, asset: 'gold', priceMicros: price })
  }
  if (!rows.length) throw new Error('Kur listesi okunamadı.')
  return { rows, source: 'Truncgil Finans', updatedAt: String(data.Update_Date || '') }
}
export function parseFrankfurter(data: Record<string, unknown>): LiveRates {
  const rates = (data.rates || {}) as Record<string, number>
  const rows = liveCurrencies
    .filter((c) => rates[c] > 0)
    .map((unit) => ({
      unit,
      asset: 'currency' as const,
      priceMicros: micros(d(1).div(rates[unit]).toString()),
    }))
  if (!rows.length) throw new Error('Kur listesi okunamadı.')
  return { rows, source: 'Avrupa Merkez Bankası (Frankfurter)', updatedAt: String(data.date || '') }
}
export async function fetchLiveRates(): Promise<LiveRates> {
  try {
    return parseTruncgil(await getJson(TRUNCGIL))
  } catch {
    // Altın kuru olmadan da döviz için resmi yedek kaynak.
    return parseFrankfurter(await getJson(FRANKFURTER))
  }
}
export const liveRateMap = (live?: LiveRates) =>
  new Map(
    (live?.rows || []).map((r) => [rateKey(r.unit, r.asset), r.priceMicros] as [string, number]),
  )
