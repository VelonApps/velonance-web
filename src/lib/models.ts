import { z } from 'zod'
export const currencies = ['TRY', 'USD', 'EUR', 'GBP'] as const
const currencyNames: Record<string, string> = {
  TRY: 'Türk lirası',
  USD: 'Amerikan doları',
  EUR: 'Euro',
  GBP: 'İngiliz sterlini',
}
export const goldUnits = ['Gram', 'Çeyrek', 'Yarım', 'Tam', 'Cumhuriyet']
// Seçim listeleri; extra, kayıtlı hesap/kur birimlerini de listeye katar ki eski değerler kaybolmasın.
export function currencyOptions(extra: string[] = []) {
  return [...new Set([...currencies, ...extra.filter((c) => /^[A-Z]{3}$/.test(c))])].map((c) => ({
    value: c,
    label: currencyNames[c] ? `${c} – ${currencyNames[c]}` : c,
  }))
}
export function unitOptions(rates: { unit: string; asset: string }[] = []) {
  const gold = [
    ...new Set([...goldUnits, ...rates.filter((r) => r.asset === 'gold').map((r) => r.unit)]),
  ]
  return [
    ...currencyOptions(rates.filter((r) => r.asset === 'currency').map((r) => r.unit)),
    ...gold.map((g) => ({ value: 'gold:' + g, label: 'Altın – ' + g })),
  ]
}
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Üç harfli para birimi kodu girin.')
const text = z.string().trim().max(500)
const id = z.string().max(128)
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçerli bir tarih girin.')
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Geçerli bir tarih girin.',
  )
export const minor = z.number().int().min(0).max(1_000_000_000_000)
export const positive = minor.positive('Tutar sıfırdan büyük olmalı.')
export const kinds = [
  'income',
  'expense',
  'transfer_in',
  'transfer_out',
  'debt_draw',
  'debt_lend',
  'debt_repay',
  'debt_collect',
] as const
export const transactionSchema = z
  .object({
    kind: z.enum(kinds),
    title: text.min(2, 'En az iki karakter girin.'),
    description: text,
    amountMinor: positive,
    currency: currencySchema,
    rateMicros: positive,
    tryMinor: positive,
    date,
    conversionDate: date,
    conversionMethod: z.literal('manual'),
    status: z.enum(['pending', 'settled', 'cancelled']),
    cashDate: z.union([date, z.literal('')]),
    accountId: id,
    applicationId: id,
    categoryId: id,
    group: z.enum([
      'income',
      'advertising',
      'ai',
      'infrastructure',
      'business',
      'development',
      'other',
    ]),
    allocations: z
      .array(
        z.object({ applicationId: id.min(1), basisPoints: z.number().int().positive().max(10000) }),
      )
      .max(5),
    notes: text,
    vendor: text,
    invoice: text,
    attachmentName: text,
    expectedDate: z.union([date, z.literal('')]),
    linkId: id,
    apple: z
      .object({
        mode: z.enum(['gross', 'net']),
        grossMinor: minor,
        commissionBps: z.number().int().min(0).max(10000),
        refundMinor: minor,
        adjustmentMinor: z.number().int().min(-1e12).max(1e12),
        netMinor: minor,
        period: z.string().max(7),
      })
      .nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'settled' && (!v.accountId || !v.cashDate))
      ctx.addIssue({
        code: 'custom',
        path: ['accountId'],
        message: 'Ödenen işlem için hesap ve ödeme tarihi gerekli.',
      })
    if (
      v.allocations.length &&
      (v.applicationId ||
        v.allocations.reduce((s, a) => s + a.basisPoints, 0) !== 10000 ||
        new Set(v.allocations.map((a) => a.applicationId)).size !== v.allocations.length)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['allocations'],
        message: 'Dağılım benzersiz uygulamalarda toplam %100 olmalı; doğrudan uygulama seçmeyin.',
      })
    if (v.currency === 'TRY' && v.rateMicros !== 1000000)
      ctx.addIssue({ code: 'custom', path: ['rateMicros'], message: 'TRY kuru 1 olmalı.' })
  })
export type TransactionInput = z.infer<typeof transactionSchema>
export interface Meta {
  id: string
  createdAt: unknown
  updatedAt: unknown
  createdBy: string
  updatedBy: string
  schemaVersion: 1
  deleted: boolean
}
export type Transaction = TransactionInput & Meta & { cashInMinor: number; cashOutMinor: number }
export const applicationSchema = z.object({
  name: text.min(2),
  platform: z.enum(['iOS', 'Android', 'Both']),
  bundleId: text,
  url: z.union([z.url().startsWith('https://'), z.literal('')]),
  launchDate: z.union([date, z.literal('')]),
  status: z.enum(['development', 'testing', 'live', 'paused', 'archived']),
  description: text,
  icon: text,
})
export type Application = z.infer<typeof applicationSchema> & Meta
export const accountSchema = z.object({
  name: text.min(2),
  currency: currencySchema,
  type: z.enum(['bank', 'cash', 'apple', 'other']),
  openingMinor: z.number().int().min(-1e12).max(1e12),
  openingDate: date,
  notes: text,
  archived: z.boolean(),
})
export type Account = z.infer<typeof accountSchema> & Meta
export const categorySchema = z.object({
  name: text.min(2),
  kind: z.enum(['income', 'expense']),
  group: z.enum([
    'income',
    'advertising',
    'ai',
    'infrastructure',
    'business',
    'development',
    'other',
  ]),
  parentId: id,
})
export type Category = z.infer<typeof categorySchema> & Meta
export const rateSchema = z.object({
  unit: text.min(1),
  priceMicros: positive,
  date,
  asset: z.enum(['currency', 'gold']),
})
export type Rate = z.infer<typeof rateSchema> & Meta
export const obligationSchema = z.object({
  direction: z.enum(['payable', 'receivable']),
  counterparty: text.min(2),
  title: text.min(2),
  asset: z.enum(['currency', 'gold']),
  unit: text.min(1),
  quantityMicros: positive,
  originalRateMicros: positive,
  date,
  dueDate: date,
  notes: text,
  terms: text,
  interestBps: z.number().int().min(0).max(100000),
})
export type ObligationInput = z.infer<typeof obligationSchema>
export type Obligation = ObligationInput & Meta & { repaidMicros: number; lastRepaymentId: string }
export type AuditLog = {
  id: string
  entityType: string
  entityId: string
  action: string
  actorUid: string
  actorEmail?: string
  timestamp?: { toDate?: () => Date }
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}
export type AccessLog = {
  id: string
  event: 'sign_in' | 'sign_out'
  uid: string
  email: string
  displayName: string
  at?: { toDate?: () => Date }
  userAgent: string
}
export type AccessDenied = {
  id: string
  uid: string
  email: string
  lastAt?: { toDate?: () => Date }
  userAgent: string
}
export interface Repayment extends Meta {
  obligationId: string
  quantityMicros: number
  currency: string
  amountMinor: number
  rateMicros: number
  accountId: string
  date: string
  notes: string
  transactionId: string
  agreement: string
  settlementAsset: 'currency' | 'gold'
}
export const recurringSchema = z.object({
  title: text.min(2),
  amountMinor: positive,
  currency: currencySchema,
  rateMicros: positive,
  nextDate: date,
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly', 'custom']),
  intervalDays: z.number().int().min(1).max(3660),
  applicationId: id,
  categoryId: id,
  accountId: id,
  status: z.enum(['active', 'paused', 'cancelled']),
  notes: text,
})
export type Recurring = z.infer<typeof recurringSchema> & Meta
export interface Occurrence extends Meta {
  templateId: string
  date: string
  status: 'paid' | 'skipped'
  transactionId: string
}
export const campaignSchema = z.object({
  name: text.min(2),
  platform: text.min(2),
  applicationId: id,
  spendMinor: minor,
  currency: currencySchema,
  impressions: minor,
  clicks: minor,
  installs: minor,
  attributedRevenueMinor: minor,
  source: text.min(2),
  date,
  endDate: date,
})
export type Campaign = z.infer<typeof campaignSchema> & Meta
export const settingsSchema = z.object({
  name: text.min(2),
  currency: z.literal('TRY'),
  timezone: z.literal('Europe/Istanbul'),
  locale: z.literal('tr-TR'),
})
export type Settings = z.infer<typeof settingsSchema> & Meta
export type Entity =
  | Application
  | Account
  | Category
  | Rate
  | Obligation
  | Recurring
  | Campaign
  | Transaction
  | Repayment
  | Occurrence
  | Settings
export type CollectionName =
  | 'applications'
  | 'accounts'
  | 'categories'
  | 'exchangeRates'
  | 'obligations'
  | 'recurringTemplates'
  | 'advertisingCampaigns'
  | 'transactions'
  | 'repayments'
  | 'recurringOccurrences'
  | 'settings'
export const schemas = {
  applications: applicationSchema,
  accounts: accountSchema,
  categories: categorySchema,
  exchangeRates: rateSchema,
  obligations: obligationSchema,
  recurringTemplates: recurringSchema,
  advertisingCampaigns: campaignSchema,
  transactions: transactionSchema,
  settings: settingsSchema,
}
export const groupLabels = {
  income: 'Gelir',
  advertising: 'Reklam',
  ai: 'AI / API',
  infrastructure: 'Altyapı',
  business: 'İşletme',
  development: 'Geliştirme',
  other: 'Diğer',
}
export const defaultCategories = [
  ['App Store Abonelik', 'income', 'income'],
  ['App Store Tek Seferlik', 'income', 'income'],
  ['Uygulama İçi Satın Alma', 'income', 'income'],
  ['Reklam Geliri', 'income', 'income'],
  ['Müşteri Projeleri', 'income', 'income'],
  ['Danışmanlık', 'income', 'income'],
  ['Affiliate', 'income', 'income'],
  ['Diğer Gelirler', 'income', 'income'],
  ...['Apple Search Ads', 'Meta Ads', 'Google Ads', 'TikTok Ads', 'Influencer', 'Diğer Reklam'].map(
    (n) => [n, 'expense', 'advertising'],
  ),
  ...['OpenAI API', 'Anthropic API', 'Google AI', 'Replicate', 'fal.ai', 'Diğer AI'].map((n) => [
    n,
    'expense',
    'ai',
  ]),
  ...['Firebase', 'Cloud Hosting', 'Database', 'Storage', 'Server Infrastructure'].map((n) => [
    n,
    'expense',
    'infrastructure',
  ]),
  ...[
    'Apple Developer Program',
    'Software Licenses',
    'Development Tools',
    'Testing Tools',
    'Design Tools',
  ].map((n) => [n, 'expense', 'development']),
  ...[
    'Accounting',
    'Banking Fees',
    'Legal Services',
    'Domain Names',
    'Office Expenses',
    'Equipment',
    'Taxes',
    'Other Expenses',
  ].map((n) => [n, 'expense', 'business']),
]
