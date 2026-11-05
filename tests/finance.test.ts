import { describe, expect, it } from 'vitest'
import {
  breakdown,
  changePercent,
  debtSummary,
  parseAmount,
  previousRange,
  statementRows,
  accountBalance,
  adMetrics,
  allocate,
  appleProceeds,
  cashFields,
  cashTotals,
  convert,
  dueOccurrences,
  latestRates,
  margin,
  periodRange,
  profitability,
  remaining,
  toMicros,
  toMinor,
  totals,
  validateRepayment,
  valuation,
  valueQuantity,
} from '../src/lib/finance'
import { transactionSchema } from '../src/lib/models'
import type {
  Account,
  Application,
  Obligation,
  Rate,
  Recurring,
  Transaction,
} from '../src/lib/models'
import { blankTransaction } from '../src/lib/repository'
const meta = {
  id: 'test',
  createdAt: null,
  updatedAt: null,
  createdBy: 'admin',
  updatedBy: 'admin',
  schemaVersion: 1 as const,
  deleted: false,
}
const row = (overrides: Partial<Transaction> = {}): Transaction => ({
  ...blankTransaction(),
  ...meta,
  amountMinor: 10000,
  tryMinor: 10000,
  cashInMinor: 0,
  cashOutMinor: 0,
  ...overrides,
})
const template = {
  ...meta,
  title: 'API',
  amountMinor: 1000,
  currency: 'USD',
  rateMicros: 42000000,
  nextDate: '2026-01-31',
  frequency: 'monthly',
  intervalDays: 30,
  applicationId: '',
  categoryId: '',
  accountId: '',
  status: 'active',
  notes: '',
} as Recurring
const obligation = { ...meta, quantityMicros: 10_000_000, repaidMicros: 2_000_000 } as Obligation
const app = { ...meta, id: 'a', name: 'NexaRoom' } as Application
const account = { ...meta, currency: 'USD', openingMinor: 10000, archived: false } as Account

describe('Decimal para ve kur hesabı', () => {
  it('TRY kuru ve kuruş hassasiyeti', () =>
    expect(convert(toMinor('0,29'), 'TRY', 1000000)).toBe(29))
  it('USD dönüşümü', () => expect(convert(toMinor('250', 'USD'), 'USD', 42500000)).toBe(1062500))
  it('EUR dönüşümü', () => expect(convert(12345, 'EUR', 46500000)).toBe(574043))
  it('sıfır basamaklı JPY ve üç basamaklı KWD', () => {
    expect(toMinor('100', 'JPY')).toBe(100)
    expect(toMinor('1.234', 'KWD')).toBe(1234)
    expect(convert(1234, 'KWD', 120000000)).toBe(14808)
  })
  it('fazla ondalık basamağı reddeder', () => expect(() => toMinor('1.001')).toThrow())
  it('mikro hassasiyet sınırını doğrular', () => {
    expect(toMicros('0.123456')).toBe(123456)
    expect(() => toMicros('0.1234567')).toThrow()
  })
  it('güncel kur tarihsel TRY karşılığını değiştirmez', () => {
    const historical = row({
      amountMinor: 10000,
      currency: 'USD',
      rateMicros: 42000000,
      tryMinor: 420000,
    })
    const current = convert(historical.amountMinor, 'USD', 45000000)
    expect(current).toBe(450000)
    expect(historical.tryMinor).toBe(420000)
  })
  it('son tarihli fiyatı seçer, silineni dışlar', () => {
    const rates = [
      { ...meta, unit: 'USD', date: '2026-01-01', priceMicros: 42000000 },
      { ...meta, unit: 'USD', date: '2026-02-01', priceMicros: 45000000 },
      { ...meta, unit: 'USD', date: '2026-03-01', priceMicros: 50000000, deleted: true },
    ] as Rate[]
    expect(latestRates(rates).get('USD')).toBe(45000000)
  })
  it('eksik kuru sıfır kur varsaymaz', () => {
    const result = valuation([{ ...account, balance: 10000 }], new Map([['TRY', 1000000]]))
    expect(result.missing).toEqual(['USD'])
    expect(result.amount).toBe(0)
  })
})
describe('Borç ve altın', () => {
  it('tarihsel ve güncel altın değerini ayırır', () => {
    expect(valueQuantity(10_000_000, 5_000_000_000)).toBe(5_000_000)
    expect(valueQuantity(10_000_000, 5_500_000_000)).toBe(5_500_000)
  })
  it('kalan miktarı korur', () => expect(remaining(obligation)).toBe(8_000_000))
  it('kısmi ödeme', () =>
    expect(validateRepayment(10_000_000, 2_000_000, 3_000_000)).toBe(5_000_000))
  it('tam ödeme', () =>
    expect(validateRepayment(10_000_000, 2_000_000, 8_000_000)).toBe(10_000_000))
  it('fazla ve negatif ödeme reddi', () => {
    expect(() => validateRepayment(100, 50, 51)).toThrow()
    expect(() => validateRepayment(100, 50, -1)).toThrow()
  })
  it('borç anaparasını gelir/gider saymaz', () =>
    expect(totals([row({ kind: 'debt_draw' }), row({ kind: 'debt_repay' })]).profit).toBe(0))
})
describe('Tahakkuk, gider dağılımı ve kâr', () => {
  it('bekleyen gelir tahakkuk eder, nakit değildir', () => {
    const pending = row()
    expect(totals([pending]).income).toBe(10000)
    expect(cashTotals([pending]).incoming).toBe(0)
  })
  it('tahsilat geliri ikinci kez arttırmaz', () => {
    const pending = row()
    const received = {
      ...pending,
      status: 'settled' as const,
      ...cashFields('income', 'settled', 10000),
    }
    expect(totals([received]).income).toBe(totals([pending]).income)
    expect(cashTotals([received]).incoming).toBe(10000)
  })
  it('iptal edilmiş ve silinmiş kaydı dışlar', () =>
    expect(totals([row({ status: 'cancelled' }), row({ deleted: true })]).income).toBe(0))
  it('sıfır gelirde marj tanımsızdır', () => expect(margin(0, 100)).toBeNull())
  it('kâr marjı', () => expect(margin(10000, 2500)).toBe(75))
  it('kuruş artığını son paya verir, toplam korunur', () => {
    const result = allocate(101, [
      { applicationId: 'a', basisPoints: 5000 },
      { applicationId: 'b', basisPoints: 3000 },
      { applicationId: 'c', basisPoints: 2000 },
    ])
    expect(result.map((a) => a.amountMinor)).toEqual([50, 30, 21])
  })
  it('yüzde toplamı ve yinelenen uygulamalar', () => {
    expect(() => allocate(100, [{ applicationId: 'a', basisPoints: 9999 }])).toThrow()
    expect(() =>
      allocate(100, [
        { applicationId: 'a', basisPoints: 5000 },
        { applicationId: 'a', basisPoints: 5000 },
      ]),
    ).toThrow()
  })
  it('doğrudan katkı ve dağıtım sonrası kâr', () => {
    const result = profitability(app, [
      row({ applicationId: 'a' }),
      row({ kind: 'expense', applicationId: 'a', tryMinor: 2000 }),
      row({
        kind: 'expense',
        tryMinor: 4000,
        allocations: [
          { applicationId: 'a', basisPoints: 5000 },
          { applicationId: 'b', basisPoints: 5000 },
        ],
      }),
    ])
    expect(result.directContribution).toBe(8000)
    expect(result.shared).toBe(2000)
    expect(result.profit).toBe(6000)
  })
  it('dağıtılmamış şirket giderini uygulamaya yüklemez', () =>
    expect(profitability(app, [row({ kind: 'expense' })]).expense).toBe(0))
  it('doğrudan atama ile yüzde dağılımı birlikte reddedilir', () =>
    expect(
      transactionSchema.safeParse({
        ...row({
          kind: 'expense',
          title: 'API',
          applicationId: 'a',
          allocations: [{ applicationId: 'b', basisPoints: 10000 }],
        }),
      }).success,
    ).toBe(false))
})
describe('Apple ve nakit', () => {
  it.each([1500, 3000, 2200])('%i baz puan komisyon', (c) =>
    expect(appleProceeds('gross', 10000, c, 0, 0, 0)).toBe(10000 - c),
  )
  it('iade ve net düzeltme', () =>
    expect(appleProceeds('gross', 10000, 1500, 500, -100, 0)).toBe(7900))
  it('net proceeds tekrar komisyon düşürmez', () =>
    expect(appleProceeds('net', 10000, 3000, 500, 100, 8500)).toBe(8500))
  it('negatif geliştirici geliri reddeder', () =>
    expect(() => appleProceeds('gross', 100, 1500, 500, 0, 0)).toThrow())
  it('transfer nakdi taşır, geliri değiştirmez', () => {
    const out = row({
        kind: 'transfer_out',
        status: 'settled',
        ...cashFields('transfer_out', 'settled', 10000),
      }),
      incoming = row({
        kind: 'transfer_in',
        status: 'settled',
        ...cashFields('transfer_in', 'settled', 10000),
      })
    expect(totals([out, incoming]).profit).toBe(0)
    expect(cashTotals([out, incoming]).net).toBe(0)
    expect(accountBalance(account, 0, 10000)).toBe(0)
    expect(accountBalance({ ...account, openingMinor: 0 }, 10000, 0)).toBe(10000)
  })
  it('anapara gerçek nakit akışına dahildir', () =>
    expect(
      cashTotals([
        row({ kind: 'debt_draw', status: 'settled', cashInMinor: 10000 }),
        row({ kind: 'expense', tryMinor: 3000, status: 'settled', cashOutMinor: 3000 }),
      ]).net,
    ).toBe(7000))
})
describe('Takvim ve reklam ölçümleri', () => {
  it('ay sonunu geçerli tarihe taşır', () =>
    expect(dueOccurrences(template, '2026-03-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-28',
    ]))
  it('duraklatılmış şablon oluşmaz', () =>
    expect(dueOccurrences({ ...template, status: 'paused' }, '2026-12-31')).toEqual([]))
  it('yıllık artık gün ve üst sınır', () => {
    expect(
      dueOccurrences({ ...template, nextDate: '2024-02-29', frequency: 'yearly' }, '2025-03-01'),
    ).toEqual(['2024-02-29', '2025-02-28'])
    expect(dueOccurrences({ ...template, frequency: 'weekly' }, '2030-01-01', 3)).toHaveLength(3)
  })
  it('bu ay ve geçen ay aralığı', () => {
    expect(periodRange('month', '2026-10-25')).toEqual({ start: '2026-10-01', end: '2026-10-25' })
    expect(periodRange('previous', '2026-10-25')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    })
  })
  it('CPI CPC CTR ve ROAS', () =>
    expect(
      adMetrics({
        spendMinor: 10000,
        installs: 20,
        clicks: 100,
        impressions: 1000,
        attributedRevenueMinor: 25000,
      }),
    ).toEqual({ cpi: 500, cpc: 100, ctr: 10, roas: 2.5 }))
  it('eksik performans verilerini üretmez', () =>
    expect(
      adMetrics({
        spendMinor: 0,
        installs: 0,
        clicks: 0,
        impressions: 0,
        attributedRevenueMinor: 0,
      }),
    ).toEqual({ cpi: null, cpc: null, ctr: null, roas: null }))
})

describe('Güncel değerleme ayrımı', () => {
  it('gelecekteki fiyatı güncel kur olarak kullanmaz', () => {
    const rates = [
      { ...meta, asset: 'currency', unit: 'USD', date: '2099-01-01', priceMicros: 90000000 },
      { ...meta, asset: 'currency', unit: 'USD', date: '2026-01-01', priceMicros: 42000000 },
    ] as Rate[]
    expect(latestRates(rates).get('USD')).toBe(42000000)
  })
  it('aynı adla altın ve döviz fiyatlarını karıştırmaz', () => {
    const rates = [
      { ...meta, asset: 'currency', unit: 'TRY', date: '2026-01-01', priceMicros: 1000000 },
      { ...meta, asset: 'gold', unit: 'TRY', date: '2026-01-01', priceMicros: 5000000000 },
    ] as Rate[]
    expect(latestRates(rates).get('TRY')).toBe(1000000)
    expect(latestRates(rates).get('gold:TRY')).toBe(5000000000)
  })
})
describe('Tutar girişi', () => {
  it.each([
    ['1234,56', 123456],
    ['1.234,56', 123456],
    ['1.234.567,89', 123456789],
    ['1234.56', 123456],
    ['1.234.567', 123456700],
    [' 12 ', 1200],
  ])('%s', (text, minor) => expect(toMinor(text)).toBe(minor))
  it('sayı olmayan girişi Türkçe mesajla reddeder', () =>
    expect(() => parseAmount('abc')).toThrow('Geçerli bir sayı'))
})
describe('Rapor hesapları', () => {
  const tx = (o: object) =>
    ({ deleted: false, status: 'settled', kind: 'expense', tryMinor: 100, ...o }) as Transaction
  it('önceki dönem aynı uzunluktadır', () => {
    expect(previousRange({ start: '2026-10-01', end: '2026-10-31' })).toEqual({
      start: '2026-08-31',
      end: '2026-09-30',
    })
    expect(previousRange({ start: '2026-11-02', end: '2026-11-02' })).toEqual({
      start: '2026-11-01',
      end: '2026-11-01',
    })
  })
  it('değişim yüzdesi', () => {
    expect(changePercent(150, 100)).toBe(50)
    expect(changePercent(50, 100)).toBe(-50)
    expect(changePercent(10, 0)).toBeNull()
  })
  it('dağılım iptalleri dışlar, büyükten küçüğe sıralar', () => {
    const rows = [
      tx({ vendor: 'A', tryMinor: 100 }),
      tx({ vendor: 'B', tryMinor: 300 }),
      tx({ vendor: 'A', tryMinor: 100 }),
      tx({ vendor: 'C', tryMinor: 999, status: 'cancelled' }),
      tx({ vendor: 'D', tryMinor: 999, kind: 'income' }),
    ]
    expect(breakdown(rows, 'expense', (r) => r.vendor)).toEqual([
      { label: 'B', amount: 300, count: 1, share: 60 },
      { label: 'A', amount: 200, count: 2, share: 40 },
    ])
  })
  it('ekstre bakiyeyi sırayla yürütür, iptal etkisizdir', () => {
    const rows = statementRows(1000, [
      tx({ id: 'b', cashDate: '2026-10-02', cashInMinor: 0, cashOutMinor: 300 }),
      tx({ id: 'a', cashDate: '2026-10-01', cashInMinor: 500, cashOutMinor: 0 }),
      tx({ id: 'c', cashDate: '2026-10-03', cashInMinor: 0, cashOutMinor: 0, status: 'cancelled' }),
    ])
    expect(rows.map((r) => r.balance)).toEqual([1500, 1200, 1200])
  })
  it('borç özeti güncel fiyatla çevirir, eksik fiyatı belirtir', () => {
    const o = (x: object) =>
      ({
        deleted: false,
        direction: 'payable',
        asset: 'currency',
        unit: 'USD',
        quantityMicros: 10000000,
        repaidMicros: 0,
        originalRateMicros: 40000000,
        dueDate: '2026-12-01',
        ...x,
      }) as Obligation
    const result = debtSummary(
      [
        o({}),
        o({ dueDate: '2026-01-01', repaidMicros: 5000000 }),
        o({ unit: 'EUR' }),
        o({ repaidMicros: 10000000 }),
        o({ direction: 'receivable', asset: 'gold', unit: 'Gram', originalRateMicros: 3000000000 }),
      ],
      new Map([['USD', 42000000]]),
      '2026-11-02',
    )
    expect(result.payable).toMatchObject({ count: 3, overdue: 1, current: 63000, missing: ['EUR'] })
    expect(result.receivable).toMatchObject({ count: 1, current: 0, missing: ['Gram'] })
    expect(result.receivable.historical).toBe(3000000)
  })
})
