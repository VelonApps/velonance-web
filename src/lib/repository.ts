import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  serverTimestamp,
  getAggregateFromServer,
  sum as aggregateSum,
} from 'firebase/firestore'
import type {
  DocumentData,
  QueryDocumentSnapshot,
  QueryConstraint,
  Transaction as FirestoreTransaction,
} from 'firebase/firestore'
import { db, auth, studioId } from './firebase'
import {
  cashFields,
  convert,
  d,
  fromMinor,
  nextOccurrence,
  today,
  validateRepayment,
} from './finance'
import { schemas, transactionSchema } from './models'
import type {
  AccessDenied,
  AccessLog,
  Account,
  AuditLog,
  CollectionName,
  Entity,
  Obligation,
  ObligationInput,
  Recurring,
  Transaction,
  TransactionInput,
} from './models'
export const PAGE_SIZE = 50,
  REPORT_LIMIT = 1000,
  REFERENCE_LIMIT = 250
export function root(name: string) {
  if (!db || !auth?.currentUser || !studioId) throw new Error('Yetkili oturum gerekli.')
  return collection(db, 'studios', studioId, name)
}
const actor = () => {
  if (!auth?.currentUser) throw new Error('Oturum gerekli.')
  return auth.currentUser.uid
}
const metadata = () => ({
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  createdBy: actor(),
  updatedBy: actor(),
  schemaVersion: 1,
  deleted: false,
})
function audit(
  tx: FirestoreTransaction,
  entityType: string,
  entityId: string,
  action: string,
  before: DocumentData | null,
  after: DocumentData | null,
) {
  tx.set(doc(root('auditLogs')), {
    entityType,
    entityId,
    action,
    actorUid: actor(),
    ...(auth?.currentUser?.email ? { actorEmail: auth.currentUser.email } : {}),
    timestamp: serverTimestamp(),
    before,
    after,
    schemaVersion: 1,
  })
}
const userAgent = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent.slice(0, 300))
// Access logging is best-effort: a failed log write must never block signing in or out.
export async function recordAccess(event: AccessLog['event']) {
  const user = auth?.currentUser
  if (!db || !user?.email || !studioId) return
  await setDoc(doc(root('accessLogs')), {
    event,
    uid: user.uid,
    email: user.email,
    displayName: (user.displayName || '').slice(0, 200),
    at: serverTimestamp(),
    userAgent: userAgent(),
    schemaVersion: 1,
  }).catch(() => {})
}
export async function recordDenied() {
  const user = auth?.currentUser
  if (!db || !user?.email || !studioId) return
  await setDoc(doc(db, 'accessDenied', user.uid), {
    uid: user.uid,
    email: user.email,
    studioId,
    lastAt: serverTimestamp(),
    userAgent: userAgent(),
    schemaVersion: 1,
  }).catch(() => {})
}
export type AuditFilters = {
  entityType?: string
  action?: string
  actorUid?: string
  entityId?: string
  start?: string
  end?: string
}
export async function listAudit(filters: AuditFilters, cursor?: QueryDocumentSnapshot) {
  const constraints: QueryConstraint[] = []
  if (filters.entityType) constraints.push(where('entityType', '==', filters.entityType))
  if (filters.action) constraints.push(where('action', '==', filters.action))
  if (filters.actorUid) constraints.push(where('actorUid', '==', filters.actorUid))
  if (filters.entityId) constraints.push(where('entityId', '==', filters.entityId))
  if (filters.start)
    constraints.push(where('timestamp', '>=', new Date(filters.start + 'T00:00:00+03:00')))
  if (filters.end)
    constraints.push(where('timestamp', '<=', new Date(filters.end + 'T23:59:59.999+03:00')))
  const result = await getDocs(
    query(
      root('auditLogs'),
      ...constraints,
      orderBy('timestamp', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(PAGE_SIZE + 1),
    ),
  )
  const docs = result.docs.slice(0, PAGE_SIZE)
  return {
    rows: docs.map((s) => ({ ...s.data(), id: s.id }) as AuditLog),
    cursor: docs.at(-1),
    more: result.size > PAGE_SIZE,
  }
}
export async function listAccessLogs(cursor?: QueryDocumentSnapshot) {
  const result = await getDocs(
    query(
      root('accessLogs'),
      orderBy('at', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(PAGE_SIZE + 1),
    ),
  )
  const docs = result.docs.slice(0, PAGE_SIZE)
  return {
    rows: docs.map((s) => ({ ...s.data(), id: s.id }) as AccessLog),
    cursor: docs.at(-1),
    more: result.size > PAGE_SIZE,
  }
}
export async function listAccessDenied() {
  if (!db) throw new Error('Firebase gerekli.')
  const result = await getDocs(
    query(collection(db, 'accessDenied'), where('studioId', '==', studioId), limit(200)),
  )
  return result.docs
    .map((s) => ({ ...s.data(), id: s.id }) as AccessDenied)
    .sort((a, b) => (b.lastAt?.toDate?.()?.getTime() || 0) - (a.lastAt?.toDate?.()?.getTime() || 0))
}
export async function accountStatement(account: Account, start: string, end: string) {
  const [result, [period]] = await Promise.all([
    getDocs(
      query(
        root('transactions'),
        where('accountId', '==', account.id),
        where('deleted', '==', false),
        where('cashDate', '>=', start),
        where('cashDate', '<=', end),
        orderBy('cashDate'),
        limit(REPORT_LIMIT + 1),
      ),
    ),
    periodAccountBalances([account], start, end),
  ])
  if (result.size > REPORT_LIMIT)
    throw new Error('Ekstre 1.000 kayıt sınırını aşıyor. Daha dar bir tarih aralığı seçin.')
  return {
    rows: result.docs.map((s) => ({ ...s.data(), id: s.id }) as Transaction),
    opening: period.opening,
    closing: period.closing,
  }
}
export async function listEntities<T extends Entity>(name: CollectionName) {
  const q = await getDocs(
    query(
      root(name),
      ...(name === 'categories' ? [] : [where('deleted', '==', false)]),
      limit(REFERENCE_LIMIT + 1),
    ),
  )
  return {
    rows: q.docs.slice(0, REFERENCE_LIMIT).map((s) => ({ ...s.data(), id: s.id }) as T),
    truncated: q.size > REFERENCE_LIMIT,
  }
}
export async function listTransactions(
  start: string,
  end: string,
  cursor?: QueryDocumentSnapshot,
  field: 'date' | 'cashDate' = 'date',
  pageSize = PAGE_SIZE,
) {
  const filters: QueryConstraint[] = [
    where('deleted', '==', false),
    where(field, '>=', start),
    where(field, '<=', end),
    orderBy(field, 'desc'),
    orderBy('__name__', 'desc'),
  ]
  if (cursor) filters.push(startAfter(cursor))
  filters.push(limit(pageSize + 1))
  const result = await getDocs(query(root('transactions'), ...filters))
  if (pageSize === REPORT_LIMIT && result.size > REPORT_LIMIT)
    throw new Error(
      'Rapor 1.000 kayıt sınırını aşıyor. Doğru toplamlar için daha dar bir tarih aralığı seçin.',
    )
  const docs = result.docs.slice(0, pageSize)
  return {
    rows: docs.map((s) => ({ ...s.data(), id: s.id }) as Transaction),
    cursor: docs.at(-1),
    more: result.size > pageSize,
  }
}
export async function balances(accounts: Account[]) {
  return Promise.all(
    accounts.map(async (account) => {
      const result = await getAggregateFromServer(
        query(
          root('transactions'),
          where('accountId', '==', account.id),
          where('deleted', '==', false),
        ),
        { incoming: aggregateSum('cashInMinor'), outgoing: aggregateSum('cashOutMinor') },
      )
      if (
        !Number.isSafeInteger(result.data().incoming) ||
        !Number.isSafeInteger(result.data().outgoing)
      )
        throw new Error('Hesap toplamı güvenli sayı sınırını aşıyor; sunucu tarafı defter gerekli.')
      return {
        ...account,
        balance: d(account.openingMinor)
          .plus(result.data().incoming)
          .minus(result.data().outgoing)
          .toNumber(),
      }
    }),
  )
}
export async function saveEntity(
  name: Exclude<
    CollectionName,
    'transactions' | 'repayments' | 'recurringOccurrences' | 'obligations'
  >,
  input: unknown,
  id?: string,
  createOnly = false,
) {
  const parsed = schemas[name].parse(input)
  if (name === 'accounts' && (parsed as Account).openingDate > today())
    throw new Error('Hesap açılış tarihi gelecekte olamaz.')
  const ref = id ? doc(root(name), id) : doc(root(name))
  await runTransaction(db!, async (tx) => {
    const old = await tx.get(ref)
    if (createOnly && old.exists()) throw new Error('Kayıt zaten mevcut.')
    if (name === 'accounts' && old.exists()) {
      const data = old.data(),
        fresh = parsed as Account
      if (
        data.currency !== fresh.currency ||
        data.openingMinor !== fresh.openingMinor ||
        data.openingDate !== fresh.openingDate
      )
        throw new Error('Hesabın açılış bilgileri değiştirilemez. Düzeltme için ayrı hesap açın.')
    }
    const value = old.exists()
      ? { ...parsed, updatedAt: serverTimestamp(), updatedBy: actor() }
      : { ...parsed, ...metadata() }
    tx.set(ref, value, { merge: true })
    audit(
      tx,
      name,
      ref.id,
      old.exists() ? 'update' : 'create',
      old.exists() ? old.data() : null,
      parsed,
    )
  })
  return ref.id
}
export async function softDelete(name: CollectionName, id: string) {
  if (!['categories', 'exchangeRates', 'recurringTemplates', 'advertisingCampaigns'].includes(name))
    throw new Error('Bu kayıt bu yöntemle silinemez.')
  const ref = doc(root(name), id)
  await runTransaction(db!, async (tx) => {
    const old = await tx.get(ref)
    if (!old.exists()) throw new Error('Kayıt bulunamadı.')
    tx.update(ref, { deleted: true, updatedAt: serverTimestamp(), updatedBy: actor() })
    audit(tx, name, id, 'soft-delete', old.data(), { deleted: true })
  })
}
async function checkReferences(tx: FirestoreTransaction, row: TransactionInput) {
  if (row.status === 'settled') {
    const s = await tx.get(doc(root('accounts'), row.accountId))
    if (!s.exists() || s.data().deleted || s.data().archived || s.data().currency !== row.currency)
      throw new Error('Ödeme hesabının para birimi işlemle aynı olmalı ve hesap etkin olmalı.')
    if (row.cashDate < s.data().openingDate)
      throw new Error('Ödeme tarihi hesap açılışından önce olamaz.')
  }
  if (row.applicationId) {
    const s = await tx.get(doc(root('applications'), row.applicationId))
    if (!s.exists() || s.data().deleted) throw new Error('Uygulama bulunamadı.')
  }
  if (row.categoryId) {
    const s = await tx.get(doc(root('categories'), row.categoryId))
    if (
      !s.exists() ||
      s.data().deleted ||
      s.data().kind !== row.kind ||
      s.data().group !== row.group
    )
      throw new Error('Kategori, işlem türü ve grubu eşleşmiyor.')
  }
  for (const a of row.allocations) {
    const s = await tx.get(doc(root('applications'), a.applicationId))
    if (!s.exists() || s.data().deleted) throw new Error('Dağılımda geçersiz uygulama var.')
  }
}
export async function saveTransaction(input: TransactionInput, id?: string, createOnly = false) {
  const row = transactionSchema.parse(input)
  if (!['income', 'expense'].includes(row.kind)) throw new Error('Özel işlem servisini kullanın.')
  if (row.date > today() || (row.status === 'settled' && row.cashDate > today()))
    throw new Error(
      'Gerçekleşmiş işlem ve ödeme tarihleri gelecekte olamaz. Planlı giderler için tekrarlayan işlemleri kullanın.',
    )
  if (row.tryMinor !== convert(row.amountMinor, row.currency, row.rateMicros))
    throw new Error('TRY karşılığı hatalı.')
  const ref = id ? doc(root('transactions'), id) : doc(root('transactions'))
  await runTransaction(db!, async (tx) => {
    const old = await tx.get(ref)
    if (createOnly && old.exists()) throw new Error('Kayıt zaten mevcut.')
    if (
      old.exists() &&
      (!['income', 'expense'].includes(old.data().kind) || old.data().linkId !== '')
    )
      throw new Error('Bağlı kayıt düzenlenemez.')
    await checkReferences(tx, row)
    const value = {
      ...row,
      ...cashFields(row.kind, row.status, row.amountMinor),
      ...(old.exists() ? { updatedBy: actor(), updatedAt: serverTimestamp() } : metadata()),
    }
    tx.set(ref, value, { merge: true })
    audit(
      tx,
      'transactions',
      ref.id,
      old.exists() ? 'update' : 'create',
      old.exists() ? old.data() : null,
      row,
    )
  })
  return ref.id
}
export async function cancelTransaction(id: string) {
  const ref = doc(root('transactions'), id)
  await runTransaction(db!, async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists() || !['income', 'expense'].includes(s.data().kind) || s.data().linkId !== '')
      throw new Error('Yalnızca bağımsız gelir veya gider iptal edilebilir.')
    tx.update(ref, {
      status: 'cancelled',
      cashInMinor: 0,
      cashOutMinor: 0,
      updatedAt: serverTimestamp(),
      updatedBy: actor(),
    })
    audit(tx, 'transactions', id, 'cancel', s.data(), { status: 'cancelled' })
  })
}
const cancelled = () => ({
  status: 'cancelled' as const,
  cashInMinor: 0,
  cashOutMinor: 0,
  updatedAt: serverTimestamp(),
  updatedBy: actor(),
})
// Cancels one transfer as a pair, or a recurring payment's ledger entry.
export async function cancelLinkedTransaction(id: string) {
  const ref = doc(root('transactions'), id)
  await runTransaction(db!, async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists() || s.data().status !== 'settled' || !s.data().linkId)
      throw new Error('Bu kayıt iptal edilemez.')
    const row = s.data()
    if (row.kind === 'transfer_in' || row.kind === 'transfer_out') {
      const other = doc(root('transactions'), row.linkId),
        pair = await tx.get(other)
      if (!pair.exists() || pair.data().status !== 'settled')
        throw new Error('Transferin diğer bacağı bulunamadı.')
      tx.update(ref, cancelled())
      tx.update(other, cancelled())
      audit(tx, 'transactions', id, 'cancel-transfer', row, { status: 'cancelled', pair: other.id })
    } else if (row.kind === 'expense' || row.kind === 'income') {
      tx.update(ref, cancelled())
      audit(tx, 'transactions', id, 'cancel', row, { status: 'cancelled' })
    } else throw new Error('Anapara hareketini Borçlar ve Alacaklar ekranından iptal edin.')
  })
}
export async function updateObligationDetails(
  id: string,
  input: Pick<
    ObligationInput,
    'title' | 'counterparty' | 'dueDate' | 'notes' | 'terms' | 'interestBps'
  >,
) {
  const ref = doc(root('obligations'), id)
  await runTransaction(db!, async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists() || s.data().deleted) throw new Error('Borç bulunamadı.')
    tx.update(ref, { ...input, updatedAt: serverTimestamp(), updatedBy: actor() })
    audit(tx, 'obligations', id, 'update', s.data(), input)
  })
}
export async function cancelObligation(id: string) {
  const ref = doc(root('obligations'), id),
    entry = doc(root('transactions'), id)
  await runTransaction(db!, async (tx) => {
    const s = await tx.get(ref),
      ledger = await tx.get(entry)
    if (!s.exists() || s.data().deleted) throw new Error('Borç bulunamadı.')
    if (s.data().repaidMicros > 0)
      throw new Error('Ödemesi olan kayıt iptal edilemez. Önce ödemeleri geri alın.')
    tx.update(ref, { deleted: true, updatedAt: serverTimestamp(), updatedBy: actor() })
    if (ledger.exists() && ledger.data().status === 'settled') tx.update(entry, cancelled())
    audit(tx, 'obligations', id, 'cancel', s.data(), { deleted: true })
  })
}
export async function reverseRepayment(obligationId: string, repaymentId: string) {
  const ref = doc(root('obligations'), obligationId),
    payRef = doc(root('repayments'), repaymentId)
  await runTransaction(db!, async (tx) => {
    const [obligation, payment] = [await tx.get(ref), await tx.get(payRef)]
    if (!obligation.exists() || !payment.exists() || payment.data().deleted)
      throw new Error('Ödeme bulunamadı.')
    const row = payment.data()
    if (row.obligationId !== obligationId) throw new Error('Ödeme bu kayda ait değil.')
    const repaidMicros = d(obligation.data().repaidMicros).minus(row.quantityMicros).toNumber()
    if (repaidMicros < 0) throw new Error('Ödeme tutarı kayıtla uyuşmuyor.')
    tx.update(payRef, { deleted: true, updatedAt: serverTimestamp(), updatedBy: actor() })
    if (row.transactionId) tx.update(doc(root('transactions'), row.transactionId), cancelled())
    tx.update(ref, {
      repaidMicros,
      lastRepaymentId: repaymentId,
      updatedAt: serverTimestamp(),
      updatedBy: actor(),
    })
    audit(tx, 'repayments', repaymentId, 'reverse', row, { deleted: true, repaidMicros })
  })
}
export function blankTransaction(kind: TransactionInput['kind'] = 'income'): TransactionInput {
  return {
    kind,
    title: '',
    description: '',
    amountMinor: 0,
    currency: 'TRY',
    rateMicros: 1000000,
    tryMinor: 0,
    date: today(),
    conversionDate: today(),
    conversionMethod: 'manual',
    status: 'pending',
    cashDate: '',
    accountId: '',
    applicationId: '',
    categoryId: '',
    group: kind === 'income' ? 'income' : 'other',
    allocations: [],
    notes: '',
    vendor: '',
    invoice: '',
    attachmentName: '',
    expectedDate: '',
    linkId: '',
    apple: null,
  }
}
export async function transfer(input: {
  from: string
  to: string
  amountMinor: number
  receivedMinor: number
  rateMicros: number
  receivedRateMicros: number
  date: string
  notes: string
  key: string
}) {
  if (input.date > today()) throw new Error('Gerçek transfer tarihi gelecekte olamaz.')
  if (input.from === input.to) throw new Error('Farklı hesaplar seçin.')
  const outRef = doc(root('transactions'), input.key + '-out'),
    inRef = doc(root('transactions'), input.key + '-in')
  await runTransaction(db!, async (tx) => {
    if ((await tx.get(outRef)).exists()) return
    const [source, target] = await Promise.all([
      tx.get(doc(root('accounts'), input.from)),
      tx.get(doc(root('accounts'), input.to)),
    ])
    if (!source.exists() || !target.exists()) throw new Error('Hesap bulunamadı.')
    const sourceCurrency = source.data().currency,
      targetCurrency = target.data().currency
    if (sourceCurrency === targetCurrency && input.amountMinor !== input.receivedMinor)
      throw new Error(
        'Aynı para biriminde transfer tutarları eşit olmalı. Masrafları ayrı gider kaydedin.',
      )
    const base = {
      ...blankTransaction(),
      title: 'Hesaplar arası transfer',
      status: 'settled' as const,
      date: input.date,
      cashDate: input.date,
      conversionDate: input.date,
      notes: input.notes,
    }
    const out = {
      ...base,
      kind: 'transfer_out' as const,
      accountId: input.from,
      currency: sourceCurrency,
      amountMinor: input.amountMinor,
      rateMicros: input.rateMicros,
      tryMinor: convert(input.amountMinor, sourceCurrency, input.rateMicros),
      linkId: inRef.id,
    }
    const incoming = {
      ...base,
      kind: 'transfer_in' as const,
      accountId: input.to,
      currency: targetCurrency,
      amountMinor: input.receivedMinor,
      rateMicros: input.receivedRateMicros,
      tryMinor: convert(input.receivedMinor, targetCurrency, input.receivedRateMicros),
      linkId: outRef.id,
    }
    transactionSchema.parse(out)
    transactionSchema.parse(incoming)
    await checkReferences(tx, out)
    await checkReferences(tx, incoming)
    tx.set(outRef, { ...out, ...cashFields(out.kind, out.status, out.amountMinor), ...metadata() })
    tx.set(inRef, {
      ...incoming,
      ...cashFields(incoming.kind, incoming.status, incoming.amountMinor),
      ...metadata(),
    })
    audit(tx, 'transactions', input.key, 'transfer', null, { out, incoming })
  })
}
export async function createObligation(
  input: ObligationInput,
  cash: { accountId: string; amountMinor: number; currency: string; rateMicros: number } | null,
  key: string,
) {
  if (input.date > today()) throw new Error('Borç başlangıcı gelecekte olamaz.')
  const parsed = schemas.obligations.parse(input),
    ref = doc(root('obligations'), key)
  await runTransaction(db!, async (tx) => {
    if ((await tx.get(ref)).exists()) return
    let row: TransactionInput | null = null
    if (cash) {
      if (
        parsed.asset !== 'currency' ||
        cash.currency !== parsed.unit ||
        toQuantity(cash.amountMinor, cash.currency) !== parsed.quantityMicros
      )
        throw new Error('Anapara hareketi borcun para birimi ve miktarıyla aynı olmalı.')
      row = {
        ...blankTransaction(parsed.direction === 'payable' ? 'debt_draw' : 'debt_lend'),
        title: parsed.title,
        date: parsed.date,
        conversionDate: parsed.date,
        status: 'settled',
        cashDate: parsed.date,
        accountId: cash.accountId,
        currency: cash.currency,
        amountMinor: cash.amountMinor,
        rateMicros: cash.rateMicros,
        tryMinor: convert(cash.amountMinor, cash.currency, cash.rateMicros),
        linkId: key,
      }
      transactionSchema.parse(row)
      await checkReferences(tx, row)
    }
    tx.set(ref, { ...parsed, repaidMicros: 0, lastRepaymentId: '', ...metadata() })
    if (row)
      tx.set(doc(root('transactions'), key), {
        ...row,
        ...cashFields(row.kind, row.status, row.amountMinor),
        ...metadata(),
      })
    audit(tx, 'obligations', key, 'create', null, parsed)
  })
  return key
}
function toQuantity(amount: number, currency: string) {
  return d(fromMinor(amount, currency)).times(1e6).toNumber()
}
export async function repay(input: {
  obligationId: string
  quantityMicros: number
  amountMinor: number
  currency: string
  rateMicros: number
  accountId: string
  date: string
  notes: string
  agreement: string
  key: string
  inKind?: boolean
}) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    Number.isNaN(Date.parse(input.date)) ||
    new Date(input.date).toISOString().slice(0, 10) !== input.date ||
    input.date > today()
  )
    throw new Error('Geçerli bir gerçekleşmiş ödeme tarihi girin.')
  const ref = doc(root('obligations'), input.obligationId),
    payRef = doc(root('repayments'), input.key),
    ledgerRef = doc(root('transactions'), input.key)
  await runTransaction(db!, async (tx) => {
    if ((await tx.get(payRef)).exists()) return
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.data().deleted) throw new Error('Borç bulunamadı.')
    const obligation = snap.data() as Obligation
    const repaidMicros = validateRepayment(
      obligation.quantityMicros,
      obligation.repaidMicros,
      input.quantityMicros,
    )
    if (
      input.inKind &&
      (obligation.asset !== 'gold' ||
        input.currency !== obligation.unit ||
        input.amountMinor !== 0 ||
        input.accountId !== '')
    )
      throw new Error('Ayni ödeme yalnızca borcun özgün altın biriminde kaydedilir.')
    if (obligation.unit !== input.currency && !input.agreement.trim())
      throw new Error('Farklı varlıkla kapatma için mutabakat açıklaması gerekli.')
    if (
      obligation.asset === 'currency' &&
      obligation.unit === input.currency &&
      toQuantity(input.amountMinor, input.currency) !== input.quantityMicros
    )
      throw new Error('Ödeme tutarı kapatılan anaparayla eşleşmeli.')
    let row: TransactionInput | null = null
    if (!input.inKind) {
      row = {
        ...blankTransaction(obligation.direction === 'payable' ? 'debt_repay' : 'debt_collect'),
        title: obligation.title + ' · anapara',
        date: input.date,
        conversionDate: input.date,
        status: 'settled' as const,
        cashDate: input.date,
        accountId: input.accountId,
        currency: input.currency,
        amountMinor: input.amountMinor,
        rateMicros: input.rateMicros,
        tryMinor: convert(input.amountMinor, input.currency, input.rateMicros),
        linkId: input.obligationId,
        notes: input.notes,
      }
      transactionSchema.parse(row)
      await checkReferences(tx, row)
    }
    const { key, inKind, ...payment } = input
    tx.set(payRef, {
      ...payment,
      settlementAsset: inKind ? 'gold' : 'currency',
      transactionId: row ? ledgerRef.id : '',
      ...metadata(),
    })
    if (row)
      tx.set(ledgerRef, {
        ...row,
        ...cashFields(row.kind, row.status, row.amountMinor),
        ...metadata(),
      })
    tx.update(ref, {
      repaidMicros,
      lastRepaymentId: key,
      updatedAt: serverTimestamp(),
      updatedBy: actor(),
    })
    audit(tx, 'obligations', ref.id, 'repay', snap.data(), { repaidMicros, payment })
  })
}
export async function settleOccurrence(
  template: Recurring,
  date: string,
  action: 'paid' | 'skipped',
  rateMicros: number,
  paymentDate: string,
) {
  if (action === 'paid' && (date > today() || paymentDate > today()))
    throw new Error('Gelecek plan henüz gerçekleşmiş gider değildir.')
  const key = template.id + '_' + date,
    ref = doc(root('recurringOccurrences'), key)
  await runTransaction(db!, async (tx) => {
    if ((await tx.get(ref)).exists()) return
    const current = await tx.get(doc(root('recurringTemplates'), template.id))
    if (!current.exists() || current.data().status !== 'active' || current.data().nextDate !== date)
      throw new Error('Takvim değişti. Listeyi yenileyin.')
    let row: TransactionInput | null = null
    if (action === 'paid') {
      let group: TransactionInput['group'] = 'other'
      if (template.categoryId) {
        const category = await tx.get(doc(root('categories'), template.categoryId))
        if (!category.exists()) throw new Error('Kategori bulunamadı.')
        group = category.data().group
      }
      row = {
        ...blankTransaction('expense'),
        title: template.title,
        date,
        conversionDate: paymentDate,
        status: 'settled',
        cashDate: paymentDate,
        accountId: template.accountId,
        applicationId: template.applicationId,
        categoryId: template.categoryId,
        group,
        currency: template.currency,
        amountMinor: template.amountMinor,
        rateMicros,
        tryMinor: convert(template.amountMinor, template.currency, rateMicros),
        linkId: key,
        notes: template.notes,
      }
      transactionSchema.parse(row)
      await checkReferences(tx, row)
    }
    tx.set(ref, {
      templateId: template.id,
      date,
      status: action,
      transactionId: row ? key : '',
      ...metadata(),
    })
    if (row)
      tx.set(doc(root('transactions'), key), {
        ...row,
        ...cashFields(row.kind, row.status, row.amountMinor),
        ...metadata(),
      })
    tx.update(current.ref, {
      nextDate: nextOccurrence(template, date),
      updatedAt: serverTimestamp(),
      updatedBy: actor(),
    })
    audit(tx, 'recurringOccurrences', key, action, null, { templateId: template.id, date })
  })
}
export async function getAuthorizationUsers() {
  if (!db) throw new Error('Firebase gerekli.')
  const result = await getDocs(
    query(collection(db, 'authorizedUsers'), where('studioId', '==', studioId), limit(100)),
  )
  return result.docs.map((s) => s.data())
}
export async function readSettings() {
  const result = await getDoc(doc(root('settings'), 'general'))
  return result.exists() ? result.data() : null
}
export async function periodAccountBalances(accounts: Account[], start: string, end: string) {
  return Promise.all(
    accounts.map(async (account) => {
      const aggregate = async (endDate: string, exclusive: boolean) => {
        const result = await getAggregateFromServer(
          query(
            root('transactions'),
            where('accountId', '==', account.id),
            where('deleted', '==', false),
            where('cashDate', exclusive ? '<' : '<=', endDate),
          ),
          { incoming: aggregateSum('cashInMinor'), outgoing: aggregateSum('cashOutMinor') },
        )
        return d(result.data().incoming).minus(result.data().outgoing)
      }
      const [before, through] = await Promise.all([aggregate(start, true), aggregate(end, false)])
      return {
        accountId: account.id,
        name: account.name,
        currency: account.currency,
        opening: account.openingDate <= start ? d(account.openingMinor).plus(before).toNumber() : 0,
        closing: account.openingDate <= end ? d(account.openingMinor).plus(through).toNumber() : 0,
      }
    }),
  )
}
export async function expectedPayments(end: string) {
  const result = await getDocs(
    query(
      root('transactions'),
      where('deleted', '==', false),
      where('status', '==', 'pending'),
      where('expectedDate', '>=', '1900-01-01'),
      where('expectedDate', '<=', end),
      orderBy('expectedDate'),
      limit(REPORT_LIMIT + 1),
    ),
  )
  if (result.size > REPORT_LIMIT)
    throw new Error('Beklenen ödeme listesi 1.000 kayıt sınırını aşıyor; sunucu özeti gerekli.')
  return result.docs.map((s) => ({ ...s.data(), id: s.id }) as Transaction)
}
