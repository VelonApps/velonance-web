import { money, number } from './finance'
import type { AuditLog } from './models'
export const entityLabels: Record<string, string> = {
  transactions: 'İşlem',
  accounts: 'Hesap',
  applications: 'Uygulama',
  categories: 'Kategori',
  exchangeRates: 'Döviz / altın fiyatı',
  obligations: 'Borç / alacak',
  repayments: 'Geri ödeme',
  recurringTemplates: 'Tekrarlayan şablon',
  recurringOccurrences: 'Tekrarlayan oluşum',
  advertisingCampaigns: 'Reklam kampanyası',
  settings: 'Ayarlar',
}
export const actionLabels: Record<string, string> = {
  create: 'Oluşturuldu',
  update: 'Güncellendi',
  cancel: 'İptal edildi',
  'cancel-transfer': 'Transfer iptal edildi',
  'soft-delete': 'Arşivlendi',
  transfer: 'Transfer yapıldı',
  repay: 'Ödeme kaydedildi',
  reverse: 'Ödeme geri alındı',
  paid: 'Ödendi',
  skipped: 'Atlandı',
}
const fieldLabels: Record<string, string> = {
  kind: 'Tür',
  title: 'Başlık',
  name: 'Ad',
  description: 'Açıklama',
  amountMinor: 'Tutar',
  currency: 'Para birimi',
  rateMicros: 'TRY kuru',
  tryMinor: 'TRY karşılığı',
  date: 'Tarih',
  conversionDate: 'Kur tarihi',
  status: 'Durum',
  cashDate: 'Ödeme tarihi',
  accountId: 'Hesap',
  applicationId: 'Uygulama',
  categoryId: 'Kategori',
  group: 'Grup',
  allocations: 'Dağılım',
  notes: 'Not',
  vendor: 'Tedarikçi',
  invoice: 'Fatura',
  attachmentName: 'Belge adı',
  expectedDate: 'Beklenen tarih',
  linkId: 'Bağlı kayıt',
  openingMinor: 'Açılış bakiyesi',
  openingDate: 'Açılış tarihi',
  archived: 'Arşivde',
  type: 'Hesap türü',
  counterparty: 'Karşı taraf',
  direction: 'Yön',
  asset: 'Varlık',
  unit: 'Birim',
  quantityMicros: 'Miktar',
  originalRateMicros: 'İlk kur',
  repaidMicros: 'Ödenen miktar',
  dueDate: 'Vade',
  terms: 'Koşullar',
  interestBps: 'Faiz (baz puan)',
  priceMicros: 'Birim fiyat',
  deleted: 'Silindi işareti',
  spendMinor: 'Harcama',
  attributedRevenueMinor: 'İlişkilendirilmiş gelir',
  nextDate: 'Sonraki tarih',
  frequency: 'Sıklık',
  platform: 'Platform',
  source: 'Kaynak',
  obligationId: 'Borç kaydı',
  agreement: 'Mutabakat',
  settlementAsset: 'Ödeme varlığı',
  transactionId: 'Bağlı işlem',
  templateId: 'Şablon',
  pair: 'Karşı bacak',
  out: 'Çıkış',
  incoming: 'Giriş',
}
const hidden = new Set(['createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'schemaVersion'])
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !('toDate' in v)
function flatten(value: Record<string, unknown> | null, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value || {})) {
    if (hidden.has(key)) continue
    if (isRecord(v)) Object.assign(out, flatten(v, prefix + key + '.'))
    else out[prefix + key] = v
  }
  return out
}
function formatValue(field: string, value: unknown, currency: string) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'
  const key = field.split('.').at(-1) || field
  if (typeof value === 'number') {
    if (key === 'tryMinor' || key.endsWith('MinorTry')) return money(value)
    if (key.endsWith('Minor'))
      return /^[A-Z]{3}$/.test(currency) ? money(value, currency) : number(value / 100)
    if (key.endsWith('Micros')) return number(value / 1e6)
    return number(value)
  }
  if (typeof value === 'object') {
    const date = (value as { toDate?: () => Date }).toDate?.()
    return date
      ? date.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
      : JSON.stringify(value)
  }
  return String(value)
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function auditChanges(log: Pick<AuditLog, 'before' | 'after'>) {
  const before = flatten(log.before),
    after = flatten(log.after),
    // Nested records (transfer legs, payments) carry their own currency next to the amount.
    currencyOf = (field: string) => {
      const key = field.slice(0, field.lastIndexOf('.') + 1) + 'currency'
      return String(after[key] || before[key] || after.currency || before.currency || 'TRY')
    }
  return Object.keys(after)
    .filter((k) =>
      log.before ? !same(before[k], after[k]) : !['', null, undefined].includes(after[k] as string),
    )
    .map((field) => ({
      field,
      label: fieldLabels[field.split('.').at(-1) || field] || field,
      before: log.before ? formatValue(field, before[field], currencyOf(field)) : '—',
      after: formatValue(field, after[field], currencyOf(field)),
    }))
}
export function auditTitle(log: Pick<AuditLog, 'before' | 'after'>) {
  const pick = (r: Record<string, unknown> | null) => r?.title || r?.name || r?.counterparty
  return String(pick(log.after) || pick(log.before) || '')
}
export function browserLabel(userAgent: string) {
  const browser = /Edg\//.test(userAgent)
      ? 'Edge'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Diğer tarayıcı',
    system = /iPhone|iPad/.test(userAgent)
      ? 'iOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Windows/.test(userAgent)
            ? 'Windows'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : 'Bilinmeyen sistem'
  return browser + ' · ' + system
}
export const timeLabel = (value?: { toDate?: () => Date }) =>
  value?.toDate?.().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) || '—'
