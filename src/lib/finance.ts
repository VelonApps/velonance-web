import Decimal from 'decimal.js'
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  subDays,
  subMonths,
  startOfMonth,
  startOfYear,
  endOfMonth,
} from 'date-fns'
import type { Account, Application, Obligation, Rate, Recurring, Transaction } from './models'
Decimal.set({ precision: 36, rounding: Decimal.ROUND_HALF_UP })
export const d = (v: Decimal.Value) => new Decimal(v)
export const sum = (values: Decimal.Value[]) =>
  values.reduce<Decimal>((s, v) => s.plus(v), d(0)).toNumber()
export const scale = (currency: string) =>
  ['JPY', 'KRW'].includes(currency) ? 1 : ['KWD', 'BHD', 'OMR'].includes(currency) ? 1000 : 100
// Accepts both "1234.56" and Turkish "1.234,56"; the last separator is the decimal one.
export function parseAmount(value: string) {
  const text = value.trim().replace(/\s/g, '')
  const normalized = text.includes(',')
    ? text.replaceAll('.', '').replace(',', '.')
    : text.split('.').length > 2
      ? text.replaceAll('.', '')
      : text
  if (!/^-?\d*\.?\d+$/.test(normalized)) throw new Error('Geçerli bir sayı girin. Örnek: 1234,56')
  return d(normalized)
}
export function toMinor(value: string, currency = 'TRY') {
  const n = parseAmount(value).times(scale(currency))
  if (!n.isInteger() || !n.isFinite() || n.abs().gt(1e12))
    throw new Error('Tutarın ondalık basamaklarını ve sınırını kontrol edin.')
  return n.toNumber()
}
export const fromMinor = (amount: number, currency = 'TRY') =>
  d(amount).div(scale(currency)).toString()
export function toMicros(value: string) {
  const n = parseAmount(value).times(1e6)
  if (!n.isInteger() || !n.isFinite() || n.abs().gt(1e12))
    throw new Error('En fazla altı ondalık basamak kullanın.')
  return n.toNumber()
}
export const convert = (minor: number, currency: string, rateMicros: number) =>
  d(minor).div(scale(currency)).times(rateMicros).div(1e6).times(100).toDecimalPlaces(0).toNumber()
export const valueQuantity = (micros: number, rateMicros: number) =>
  d(micros).div(1e6).times(rateMicros).div(1e6).times(100).toDecimalPlaces(0).toNumber()
export function remaining(obligation: Obligation) {
  return d(obligation.quantityMicros).minus(obligation.repaidMicros).toNumber()
}
export function validateRepayment(total: number, repaid: number, payment: number) {
  if (payment <= 0 || d(repaid).plus(payment).gt(total))
    throw new Error('Ödeme kalan borcu aşamaz.')
  return d(repaid).plus(payment).toNumber()
}
export const margin = (income: number, expense: number) =>
  income === 0
    ? null
    : d(income).minus(expense).div(income).times(100).toDecimalPlaces(2).toNumber()
export function appleProceeds(
  mode: 'gross' | 'net',
  gross: number,
  commissionBps: number,
  refund: number,
  adjustment: number,
  net: number,
) {
  const result =
    mode === 'net'
      ? d(net)
      : d(gross)
          .times(d(10000).minus(commissionBps))
          .div(10000)
          .minus(refund)
          .plus(adjustment)
          .toDecimalPlaces(0)
  if (result.isNegative()) throw new Error('Apple net geliri negatif olamaz.')
  return result.toNumber()
}
export function allocate(
  amount: number,
  allocations: { applicationId: string; basisPoints: number }[],
) {
  if (
    sum(allocations.map((a) => a.basisPoints)) !== 10000 ||
    new Set(allocations.map((a) => a.applicationId)).size !== allocations.length
  )
    throw new Error('Dağılım toplamı %100 olmalı.')
  let used = 0
  return allocations.map((a, i) => {
    const value =
      i === allocations.length - 1
        ? amount - used
        : d(amount).times(a.basisPoints).div(10000).floor().toNumber()
    used += value
    return { ...a, amountMinor: value }
  })
}
export function totals(rows: Transaction[]) {
  const active = rows.filter((r) => !r.deleted && r.status !== 'cancelled')
  const income = sum(active.filter((r) => r.kind === 'income').map((r) => r.tryMinor)),
    expense = sum(active.filter((r) => r.kind === 'expense').map((r) => r.tryMinor))
  return {
    income,
    expense,
    profit: d(income).minus(expense).toNumber(),
    margin: margin(income, expense),
    advertising: sum(
      active
        .filter((r) => r.kind === 'expense' && r.group === 'advertising')
        .map((r) => r.tryMinor),
    ),
    ai: sum(active.filter((r) => r.kind === 'expense' && r.group === 'ai').map((r) => r.tryMinor)),
  }
}
export function profitability(app: Application, rows: Transaction[]) {
  const direct = totals(rows.filter((r) => r.applicationId === app.id))
  const shared = sum(
    rows
      .filter(
        (r) =>
          r.kind === 'expense' && !r.deleted && r.status !== 'cancelled' && r.allocations.length,
      )
      .map(
        (r) =>
          allocate(r.tryMinor, r.allocations).find((a) => a.applicationId === app.id)
            ?.amountMinor || 0,
      ),
  )
  return {
    ...direct,
    shared,
    directContribution: direct.profit,
    profit: d(direct.profit).minus(shared).toNumber(),
    margin: margin(direct.income, d(direct.expense).plus(shared).toNumber()),
  }
}
export function cashFields(
  kind: Transaction['kind'],
  status: Transaction['status'],
  amount: number,
) {
  return {
    cashInMinor:
      status === 'settled' && ['income', 'transfer_in', 'debt_draw', 'debt_collect'].includes(kind)
        ? amount
        : 0,
    cashOutMinor:
      status === 'settled' && ['expense', 'transfer_out', 'debt_lend', 'debt_repay'].includes(kind)
        ? amount
        : 0,
  }
}
export function cashTotals(rows: Transaction[]) {
  const active = rows.filter(
    (r) => !r.deleted && r.status === 'settled' && !r.kind.startsWith('transfer'),
  )
  const incoming = sum(active.filter((r) => r.cashInMinor > 0).map((r) => r.tryMinor)),
    outgoing = sum(active.filter((r) => r.cashOutMinor > 0).map((r) => r.tryMinor))
  return { incoming, outgoing, net: d(incoming).minus(outgoing).toNumber() }
}
export function accountBalance(account: Account, incoming: number, outgoing: number) {
  return d(account.openingMinor).plus(incoming).minus(outgoing).toNumber()
}
export const today = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date())
export type Period =
  'today' | 'week' | 'month' | 'previous' | 'three' | 'six' | 'year' | 'lastYear' | 'custom'
export function periodRange(period: Period, now = today()) {
  const n = new Date(now + 'T12:00:00')
  if (period === 'lastYear') {
    const year = n.getFullYear() - 1
    return { start: year + '-01-01', end: year + '-12-31' }
  }
  const end = period === 'previous' ? endOfMonth(subMonths(n, 1)) : n
  const start =
    period === 'today'
      ? n
      : period === 'week'
        ? subDays(n, 6)
        : period === 'previous'
          ? startOfMonth(subMonths(n, 1))
          : period === 'three'
            ? startOfMonth(subMonths(n, 2))
            : period === 'six'
              ? startOfMonth(subMonths(n, 5))
              : period === 'year'
                ? startOfYear(n)
                : startOfMonth(n)
  return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') }
}
// The equally long window right before the given range.
export function previousRange(range: { start: string; end: string }) {
  const start = new Date(range.start + 'T12:00:00'),
    end = new Date(range.end + 'T12:00:00'),
    days = differenceInCalendarDays(end, start) + 1
  return {
    start: format(subDays(start, days), 'yyyy-MM-dd'),
    end: format(subDays(start, 1), 'yyyy-MM-dd'),
  }
}
export function changePercent(current: number, previous: number) {
  return previous === 0
    ? null
    : d(current).minus(previous).div(Math.abs(previous)).times(100).toDecimalPlaces(1).toNumber()
}
export function breakdown(
  rows: Transaction[],
  kind: 'income' | 'expense',
  key: (r: Transaction) => string,
) {
  const active = rows.filter((r) => !r.deleted && r.status !== 'cancelled' && r.kind === kind),
    total = sum(active.map((r) => r.tryMinor)),
    groups = new Map<string, { amount: number; count: number }>()
  active.forEach((r) => {
    const label = key(r),
      current = groups.get(label) || { amount: 0, count: 0 }
    groups.set(label, {
      amount: d(current.amount).plus(r.tryMinor).toNumber(),
      count: current.count + 1,
    })
  })
  return [...groups]
    .map(([label, v]) => ({
      label,
      ...v,
      share: total ? d(v.amount).div(total).times(100).toDecimalPlaces(1).toNumber() : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}
export function debtSummary(obligations: Obligation[], rates: Map<string, number>, now = today()) {
  const open = obligations.filter((o) => !o.deleted && remaining(o) > 0)
  const side = (direction: Obligation['direction']) => {
    const rows = open.filter((o) => o.direction === direction),
      priced = rows.filter((o) => rates.has(rateKey(o.unit, o.asset)))
    return {
      count: rows.length,
      overdue: rows.filter((o) => o.dueDate < now).length,
      current: sum(
        priced.map((o) => valueQuantity(remaining(o), rates.get(rateKey(o.unit, o.asset))!)),
      ),
      historical: sum(rows.map((o) => valueQuantity(remaining(o), o.originalRateMicros))),
      missing: [
        ...new Set(rows.filter((o) => !rates.has(rateKey(o.unit, o.asset))).map((o) => o.unit)),
      ],
    }
  }
  return { payable: side('payable'), receivable: side('receivable') }
}
export type StatementRow = { row: Transaction; delta: number; balance: number }
// Running balance for one account; cancelled rows stay visible with no effect.
export function statementRows(opening: number, rows: Transaction[]): StatementRow[] {
  let balance = d(opening)
  return [...rows]
    .sort(
      (a, b) =>
        a.cashDate.localeCompare(b.cashDate) ||
        ((a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0) -
          ((b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0) ||
        a.id.localeCompare(b.id),
    )
    .map((row) => {
      const delta = d(row.cashInMinor).minus(row.cashOutMinor)
      balance = balance.plus(delta)
      return { row, delta: delta.toNumber(), balance: balance.toNumber() }
    })
}
export function nextOccurrence(
  template: Pick<Recurring, 'frequency' | 'intervalDays' | 'nextDate'>,
  date = template.nextDate,
) {
  const n = new Date(date + 'T12:00:00')
  return format(
    template.frequency === 'weekly'
      ? addDays(n, 7)
      : template.frequency === 'custom'
        ? addDays(n, template.intervalDays)
        : addMonths(
            n,
            template.frequency === 'quarterly' ? 3 : template.frequency === 'yearly' ? 12 : 1,
          ),
    'yyyy-MM-dd',
  )
}
export function dueOccurrences(template: Recurring, end: string, max = 120) {
  const dates: string[] = []
  let cursor = template.nextDate
  while (template.status === 'active' && cursor <= end && dates.length < max) {
    dates.push(cursor)
    cursor = nextOccurrence(template, cursor)
  }
  return dates
}
export const rateKey = (unit: string, asset: 'currency' | 'gold' = 'currency') =>
  asset === 'gold' ? 'gold:' + unit : unit
export function latestRates(rates: Rate[]) {
  const sorted = [...rates]
    .filter((r) => !r.deleted && r.date <= today())
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        ((a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0) -
          ((b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0) ||
        a.id.localeCompare(b.id),
    )
  return new Map<string, number>([
    ...sorted.map((r) => [rateKey(r.unit, r.asset), r.priceMicros] as [string, number]),
    ['TRY', 1000000],
  ])
}
export function valuation(accounts: (Account & { balance: number })[], rates: Map<string, number>) {
  const missing = accounts
    .filter((a) => !a.archived && !rates.has(a.currency))
    .map((a) => a.currency)
  return {
    amount: sum(
      accounts
        .filter((a) => !a.archived && rates.has(a.currency))
        .map((a) => convert(a.balance, a.currency, rates.get(a.currency)!)),
    ),
    missing: [...new Set(missing)],
  }
}
export const money = (value: number, currency = 'TRY') =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    maximumFractionDigits: scale(currency) === 1 ? 0 : scale(currency) === 1000 ? 3 : 2,
  }).format(d(value).div(scale(currency)).toNumber())
export const number = (value: number) =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 6 }).format(value)
export const dateLabel = (date: string) =>
  date
    ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(date + 'T12:00:00'),
      )
    : '—'
export const chartMonths = (rows: Transaction[]) => {
  const groups = new Map<string, Transaction[]>()
  rows.forEach((r) => {
    const key = r.date.slice(0, 7)
    groups.set(key, [...(groups.get(key) || []), r])
  })
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, entries]) => ({ month, ...totals(entries) }))
}
export function adMetrics(c: {
  spendMinor: number
  installs: number
  clicks: number
  impressions: number
  attributedRevenueMinor: number
}) {
  return {
    cpi: c.installs ? d(c.spendMinor).div(c.installs).toDecimalPlaces(0).toNumber() : null,
    cpc: c.clicks ? d(c.spendMinor).div(c.clicks).toDecimalPlaces(0).toNumber() : null,
    ctr: c.impressions ? d(c.clicks).div(c.impressions).times(100).toNumber() : null,
    roas: c.spendMinor ? d(c.attributedRevenueMinor).div(c.spendMinor).toNumber() : null,
  }
}
