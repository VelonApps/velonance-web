// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import type { RulesTestContext, RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore'
const state = vi.hoisted(() => ({
  db: null as ReturnType<RulesTestContext['firestore']> | null,
  uid: 'admin',
}))
vi.mock('../../src/lib/firebase', () => ({
  get db() {
    return state.db
  },
  get auth() {
    return { currentUser: { uid: state.uid, email: state.uid + '@example.test' } }
  },
  studioId: 'studio-test',
}))
import {
  accountStatement,
  blankTransaction,
  cancelLinkedTransaction,
  cancelObligation,
  createObligation,
  listAccessDenied,
  listAccessLogs,
  listAudit,
  recordAccess,
  recordDenied,
  reverseRepayment,
  updateObligationDetails,
  repay,
  saveEntity,
  saveTransaction,
  settleOccurrence,
  transfer,
  balances,
} from '../../src/lib/repository'
import { convert } from '../../src/lib/finance'
import type { Account, Recurring } from '../../src/lib/models'
let env: RulesTestEnvironment
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-velonance-repository',
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  })
}, 30000)
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) =>
    setDoc(doc(ctx.firestore(), 'authorizedUsers', 'admin'), {
      uid: 'admin',
      email: 'admin@example.test',
      active: true,
      role: 'ADMIN',
      studioId: 'studio-test',
    }),
  )
  state.db = env
    .authenticatedContext('admin', {
      email: 'admin@example.test',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
      // Gerçek Firebase belirteçlerinde her zaman bulunur; kurallar 5 günlük oturum sınırı için kullanır.
      auth_time: Math.floor(Date.now() / 1000),
    })
    .firestore()
  await saveEntity(
    'accounts',
    {
      name: 'TRY banka',
      currency: 'TRY',
      type: 'bank',
      openingMinor: 0,
      openingDate: '2026-01-01',
      notes: '',
      archived: false,
    },
    'try-bank',
  )
  await saveEntity(
    'accounts',
    {
      name: 'TRY kasa',
      currency: 'TRY',
      type: 'cash',
      openingMinor: 0,
      openingDate: '2026-01-01',
      notes: '',
      archived: false,
    },
    'try-cash',
  )
})
afterAll(async () => {
  await env?.cleanup()
})
const ledger = () => collection(state.db!, 'studios', 'studio-test', 'transactions')
describe('Gerçek depo işlemleri ve kurallar birlikte', () => {
  it('tahakkuk → tahsilat tek belgeyi günceller, bakiye doğru kalır', async () => {
    const row = {
      ...blankTransaction(),
      title: 'Abonelik',
      amountMinor: 10000,
      tryMinor: 10000,
      date: '2026-10-01',
    }
    const id = await saveTransaction(row, 'income1')
    await saveTransaction(
      { ...row, status: 'settled', accountId: 'try-bank', cashDate: '2026-10-25' },
      id,
    )
    expect((await getDocs(ledger())).size).toBe(1)
    const account = (
      await getDoc(doc(state.db!, 'studios', 'studio-test', 'accounts', 'try-bank'))
    ).data() as Account
    const result = await balances([{ ...account, id: 'try-bank' }])
    expect(result[0].balance).toBe(10000)
  })
  it('transfer iki bacakla atomik ve idempotent', async () => {
    const input = {
      from: 'try-bank',
      to: 'try-cash',
      amountMinor: 2500,
      receivedMinor: 2500,
      rateMicros: 1000000,
      receivedRateMicros: 1000000,
      date: '2026-10-25',
      notes: '',
      key: 'transfer1',
    }
    await transfer(input)
    await transfer(input)
    expect((await getDocs(ledger())).size).toBe(2)
  })
  it('para borcu ve aynı para biriminde anapara ödemesi', async () => {
    await createObligation(
      {
        direction: 'payable',
        counterparty: 'Kişi',
        title: 'Anapara',
        asset: 'currency',
        unit: 'TRY',
        quantityMicros: 100000000,
        originalRateMicros: 1000000,
        date: '2026-10-01',
        dueDate: '2026-12-01',
        notes: '',
        terms: '',
        interestBps: 0,
      },
      { accountId: 'try-bank', amountMinor: 10000, currency: 'TRY', rateMicros: 1000000 },
      'loan1',
    )
    await repay({
      obligationId: 'loan1',
      quantityMicros: 40000000,
      amountMinor: 4000,
      currency: 'TRY',
      rateMicros: 1000000,
      accountId: 'try-bank',
      date: '2026-10-25',
      notes: '',
      agreement: '',
      key: 'repay1',
    })
    const o = (
      await getDoc(doc(state.db!, 'studios', 'studio-test', 'obligations', 'loan1'))
    ).data()
    expect(o?.repaidMicros).toBe(40000000)
    expect((await getDocs(ledger())).size).toBe(2)
  })
  it('altını TRY ile anlaşmalı kapatır; özgün miktar korunur', async () => {
    await createObligation(
      {
        direction: 'payable',
        counterparty: 'Kişi',
        title: 'Altın',
        asset: 'gold',
        unit: 'Gram',
        quantityMicros: 2000000,
        originalRateMicros: 5000000000,
        date: '2026-10-01',
        dueDate: '2026-12-01',
        notes: '',
        terms: '',
        interestBps: 0,
      },
      null,
      'gold1',
    )
    const input = {
      obligationId: 'gold1',
      quantityMicros: 1000000,
      amountMinor: 550000,
      currency: 'TRY',
      rateMicros: 1000000,
      accountId: 'try-bank',
      date: '2026-10-25',
      notes: '',
      agreement: '1 Gram için 5500 TRY mutabakatı',
      key: 'gold-cash1',
    }
    await repay(input)
    await repay(input)
    const o = (
      await getDoc(doc(state.db!, 'studios', 'studio-test', 'obligations', 'gold1'))
    ).data()
    expect(o?.unit).toBe('Gram')
    expect(o?.repaidMicros).toBe(1000000)
    expect((await getDocs(ledger())).size).toBe(1)
  })
  it('eşzamanlı fazla ödemeden yalnızca biri tamamlanabilir', async () => {
    await createObligation(
      {
        direction: 'payable',
        counterparty: 'Kişi',
        title: 'Altın',
        asset: 'gold',
        unit: 'Gram',
        quantityMicros: 10000000,
        originalRateMicros: 5000000000,
        date: '2026-10-01',
        dueDate: '2026-12-01',
        notes: '',
        terms: '',
        interestBps: 0,
      },
      null,
      'concurrent',
    )
    const pay = {
      obligationId: 'concurrent',
      quantityMicros: 6000000,
      amountMinor: 0,
      currency: 'Gram',
      rateMicros: 5000000000,
      accountId: '',
      date: '2026-10-25',
      notes: '',
      agreement: '',
      inKind: true,
    }
    const results = await Promise.allSettled([
      repay({ ...pay, key: 'pay-a' }),
      repay({ ...pay, key: 'pay-b' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(
      (await getDoc(doc(state.db!, 'studios', 'studio-test', 'obligations', 'concurrent'))).data()
        ?.repaidMicros,
    ).toBe(6000000)
  })
  it('tekrarlayan gerçek ödeme tek oluşum / tek gider yaratır', async () => {
    const value = {
      title: 'AI API',
      amountMinor: 1500,
      currency: 'TRY',
      rateMicros: 1000000,
      nextDate: '2026-10-01',
      frequency: 'monthly',
      intervalDays: 30,
      applicationId: '',
      categoryId: '',
      accountId: 'try-bank',
      status: 'active',
      notes: '',
    }
    await saveEntity('recurringTemplates', value, 'template1')
    const template = { ...value, id: 'template1' } as Recurring
    await settleOccurrence(template, '2026-10-01', 'paid', 1000000, '2026-10-25')
    await settleOccurrence(template, '2026-10-01', 'paid', 1000000, '2026-10-25')
    const entries = await getDocs(ledger())
    expect(entries.size).toBe(1)
    expect(entries.docs[0].data().tryMinor).toBe(convert(1500, 'TRY', 1000000))
  })
  it('içe aktarma mevcut belgeyi değiştiremez', async () => {
    const row = { ...blankTransaction(), title: 'Gelir', amountMinor: 10000, tryMinor: 10000 }
    await saveTransaction(row, 'import1', true)
    await expect(
      saveTransaction({ ...row, title: 'Değiştirildi' }, 'import1', true),
    ).rejects.toThrow('Kayıt zaten mevcut.')
    expect((await getDoc(doc(ledger(), 'import1'))).data()?.title).toBe('Gelir')
  })
  it('kuruşlu ve döviz kurlu tutarlar kaydedilir', async () => {
    for (const [amountMinor, currency, rateMicros] of [
      [12345, 'TRY', 1000000],
      [199, 'TRY', 1000000],
      [1005, 'USD', 41500000],
      [101, 'USD', 42500000],
      [12999, 'EUR', 48123400],
      [1, 'USD', 500000],
    ] as const)
      await saveTransaction({
        ...blankTransaction('expense'),
        title: 'Kuruşlu kayıt',
        amountMinor,
        currency,
        rateMicros,
        tryMinor: convert(amountMinor, currency, rateMicros),
      })
  })
  it('beş uygulamaya dağıtılan kategorili ödeme kaydedilir', async () => {
    const apps = ['a1', 'a2', 'a3', 'a4', 'a5']
    for (const id of apps)
      await saveEntity(
        'applications',
        {
          name: 'Uygulama ' + id,
          platform: 'iOS',
          bundleId: '',
          url: '',
          launchDate: '',
          status: 'live',
          description: '',
          icon: '',
        },
        id,
      )
    await saveEntity(
      'categories',
      { name: 'Reklam', kind: 'expense', group: 'advertising', parentId: '' },
      'cat',
    )
    await saveTransaction({
      ...blankTransaction('expense'),
      title: 'Paylaşılan gider',
      group: 'advertising',
      categoryId: 'cat',
      status: 'settled',
      cashDate: '2026-10-05',
      accountId: 'try-bank',
      amountMinor: 123456,
      tryMinor: 123456,
      allocations: apps.map((applicationId) => ({ applicationId, basisPoints: 2000 })),
    })
  })
  const debt = {
    direction: 'payable' as const,
    counterparty: 'Kişi',
    title: 'Borç',
    asset: 'currency' as const,
    unit: 'TRY',
    quantityMicros: 1234560000,
    originalRateMicros: 1000000,
    date: '2026-10-01',
    dueDate: '2026-12-01',
    notes: '',
    terms: '',
    interestBps: 0,
  }
  const cash = { accountId: 'try-bank', amountMinor: 123456, currency: 'TRY', rateMicros: 1000000 }
  const balanceOf = async (id: string) =>
    (await balances([{ id, openingMinor: 0 } as Account]))[0].balance
  const payment = (key: string, amountMinor: number) => ({
    obligationId: 'd',
    quantityMicros: amountMinor * 10000,
    amountMinor,
    currency: 'TRY',
    rateMicros: 1000000,
    accountId: 'try-bank',
    date: '2026-10-05',
    notes: '',
    agreement: '',
    key,
  })
  it('hatalı borç iptal edilince nakit etkisi de geri alınır', async () => {
    await createObligation(debt, cash, 'd')
    expect(await balanceOf('try-bank')).toBe(123456)
    await cancelObligation('d')
    expect(await balanceOf('try-bank')).toBe(0)
  })
  it('ödemesi olan borç iptal edilemez; ödeme geri alınınca edilir', async () => {
    await createObligation(debt, cash, 'd')
    await repay(payment('p1', 1000))
    await expect(cancelObligation('d')).rejects.toThrow()
    await reverseRepayment('d', 'p1')
    expect(await balanceOf('try-bank')).toBe(123456)
    await cancelObligation('d')
    expect(await balanceOf('try-bank')).toBe(0)
  })
  it('ödeme iki kez geri alınamaz; sıradaki ödeme doğru hesaplanır', async () => {
    await createObligation(debt, cash, 'd')
    await repay(payment('p1', 1000))
    await repay(payment('p2', 2000))
    await reverseRepayment('d', 'p1')
    await expect(reverseRepayment('d', 'p1')).rejects.toThrow()
    await repay(payment('p3', 500))
    const snap = await getDoc(doc(state.db!, 'studios/studio-test/obligations/d'))
    expect(snap.data()?.repaidMicros).toBe(25000000)
    expect(await balanceOf('try-bank')).toBe(123456 - 2000 - 500)
  })
  it('borcun yalnızca finansal olmayan alanları düzenlenir', async () => {
    await createObligation(debt, cash, 'd')
    await updateObligationDetails('d', {
      title: 'Yeni başlık',
      counterparty: 'Yeni kişi',
      dueDate: '2027-01-01',
      notes: 'not',
      terms: 'koşul',
      interestBps: 250,
    })
    const snap = await getDoc(doc(state.db!, 'studios/studio-test/obligations/d'))
    expect(snap.data()).toMatchObject({ title: 'Yeni başlık', quantityMicros: 1234560000 })
  })
  it('transfer iki bacağıyla birlikte iptal edilir', async () => {
    await saveTransaction({
      ...blankTransaction('income'),
      title: 'Gelir',
      amountMinor: 10000,
      tryMinor: 10000,
      status: 'settled',
      cashDate: '2026-10-01',
      accountId: 'try-bank',
    })
    await transfer({
      from: 'try-bank',
      to: 'try-cash',
      amountMinor: 2500,
      receivedMinor: 2500,
      rateMicros: 1000000,
      receivedRateMicros: 1000000,
      date: '2026-10-02',
      notes: '',
      key: 'tr',
    })
    expect(await balanceOf('try-cash')).toBe(2500)
    await cancelLinkedTransaction('tr-in')
    expect(await balanceOf('try-cash')).toBe(0)
    expect(await balanceOf('try-bank')).toBe(10000)
    await expect(cancelLinkedTransaction('tr-out')).rejects.toThrow()
  })
  it('anapara hareketi transfer yoluyla tek başına iptal edilemez', async () => {
    await createObligation(debt, cash, 'd')
    await expect(cancelLinkedTransaction('d')).rejects.toThrow()
  })
  it('hesap ekstresi dönem başı ve hareketleri verir', async () => {
    const add = (title: string, date: string) =>
      saveTransaction({
        ...blankTransaction('income'),
        title,
        amountMinor: 1050,
        tryMinor: 1050,
        status: 'settled',
        cashDate: date,
        date,
        conversionDate: date,
        accountId: 'try-bank',
      })
    await add('Eski', '2026-09-01')
    await add('Yeni', '2026-10-10')
    const statement = await accountStatement(
      { id: 'try-bank', openingMinor: 0, openingDate: '2026-01-01' } as Account,
      '2026-10-01',
      '2026-10-31',
    )
    expect(statement.opening).toBe(1050)
    expect(statement.closing).toBe(2100)
    expect(statement.rows.map((r) => r.title)).toEqual(['Yeni'])
  })
  it('her işlem kullanıcı e-postasıyla loglanır ve filtrelenir', async () => {
    await createObligation(debt, cash, 'd')
    await cancelObligation('d')
    const all = await listAudit({ entityId: 'd' })
    expect(all.rows.map((r) => r.action).sort()).toEqual(['cancel', 'create'])
    expect(all.rows[0].actorEmail).toBe('admin@example.test')
    const only = await listAudit({ entityId: 'd', action: 'cancel' })
    expect(only.rows).toHaveLength(1)
    expect((await listAudit({ start: '2020-01-01', end: '2020-01-31' })).rows).toHaveLength(0)
  })
  it('oturum ve yetkisiz deneme kayıtları okunur', async () => {
    await recordAccess('sign_in')
    await recordDenied()
    const logs = await listAccessLogs()
    expect(logs.rows[0]).toMatchObject({ event: 'sign_in', email: 'admin@example.test' })
    expect((await listAccessDenied())[0].uid).toBe('admin')
  })
})
