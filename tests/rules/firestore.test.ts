// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
let env: RulesTestEnvironment
const studio = 'studio-a',
  base = `studios/${studio}`
function client(uid: string, claims: Record<string, unknown> = {}) {
  return env
    .authenticatedContext(uid, {
      email: uid + '@example.test',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
      ...claims,
    })
    .firestore()
}
function meta(uid = 'admin') {
  return {
    createdBy: uid,
    updatedBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
    deleted: false,
  }
}
function income(uid = 'admin', overrides: Record<string, unknown> = {}) {
  return {
    kind: 'income',
    title: 'Gerçek test geliri',
    description: '',
    amountMinor: 10000,
    currency: 'TRY',
    rateMicros: 1000000,
    tryMinor: 10000,
    date: '2026-10-25',
    conversionDate: '2026-10-25',
    conversionMethod: 'manual',
    status: 'pending',
    cashDate: '',
    accountId: '',
    applicationId: '',
    categoryId: '',
    group: 'income',
    allocations: [],
    notes: '',
    vendor: '',
    invoice: '',
    attachmentName: '',
    expectedDate: '',
    linkId: '',
    apple: null,
    cashInMinor: 0,
    cashOutMinor: 0,
    ...meta(uid),
    ...overrides,
  }
}
function obligation(overrides: Record<string, unknown> = {}) {
  return {
    direction: 'payable',
    counterparty: 'Test kişi',
    title: 'Altın borcu',
    asset: 'gold',
    unit: 'Gram',
    quantityMicros: 10000000,
    originalRateMicros: 5000000000,
    date: '2026-10-01',
    dueDate: '2026-12-01',
    notes: '',
    terms: '',
    interestBps: 0,
    repaidMicros: 0,
    lastRepaymentId: '',
    ...meta(),
    ...overrides,
  }
}
async function adminSeed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (context) =>
    setDoc(doc(context.firestore(), path), data),
  )
}
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-velonance',
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  })
}, 30000)
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (c) => {
    for (const [uid, role, s] of [
      ['admin', 'ADMIN', studio],
      ['viewer', 'VIEWER', studio],
      ['other', 'ADMIN', 'studio-b'],
    ])
      await setDoc(doc(c.firestore(), 'authorizedUsers', uid), {
        uid,
        email: uid + '@example.test',
        active: true,
        role,
        studioId: s,
      })
    await setDoc(doc(c.firestore(), base, 'transactions', 'existing'), income())
    await setDoc(doc(c.firestore(), base, 'accounts', 'a'), {
      name: 'TRY banka',
      currency: 'TRY',
      type: 'bank',
      openingMinor: 0,
      openingDate: '2026-01-01',
      notes: '',
      archived: false,
      ...meta(),
    })
    await setDoc(doc(c.firestore(), base, 'accounts', 'b'), {
      name: 'TRY kasa',
      currency: 'TRY',
      type: 'cash',
      openingMinor: 0,
      openingDate: '2026-01-01',
      notes: '',
      archived: false,
      ...meta(),
    })
  })
})
afterAll(async () => {
  await env?.cleanup()
})
describe('Deny-by-default ve roller', () => {
  it('anonim okuma/yazma reddi', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, base, 'transactions', 'existing')))
    await assertFails(setDoc(doc(db, base, 'transactions', 'new'), income()))
  })
  it('Google hesabı allowlist olmadan erişemez', async () => {
    const db = client('stranger')
    await assertFails(getDoc(doc(db, base, 'transactions', 'existing')))
    await assertFails(setDoc(doc(db, base, 'transactions', 'new'), income('stranger')))
  })
  it('VIEWER okur, yazamaz ve silemez', async () => {
    const db = client('viewer')
    await assertSucceeds(getDoc(doc(db, base, 'transactions', 'existing')))
    await assertFails(setDoc(doc(db, base, 'transactions', 'new'), income('viewer')))
    await assertFails(updateDoc(doc(db, base, 'transactions', 'existing'), { title: 'Değişiklik' }))
    await assertFails(deleteDoc(doc(db, base, 'transactions', 'existing')))
  })
  it('ADMIN okur ve geçerli gelir oluşturur', async () => {
    const db = client('admin')
    await assertSucceeds(getDoc(doc(db, base, 'transactions', 'existing')))
    await assertSucceeds(setDoc(doc(db, base, 'transactions', 'new'), income()))
  })
  it('e-posta doğrulama tek başına yetki değildir', async () =>
    await assertFails(
      getDoc(
        doc(client('admin', { email: 'different@example.test' }), base, 'transactions', 'existing'),
      ),
    ))
  it('doğrulanmamış e-posta reddedilir', async () =>
    await assertFails(
      getDoc(doc(client('admin', { email_verified: false }), base, 'transactions', 'existing')),
    ))
  it('Google dışındaki sağlayıcı reddedilir', async () =>
    await assertFails(
      getDoc(
        doc(
          client('admin', { firebase: { sign_in_provider: 'password' } }),
          base,
          'transactions',
          'existing',
        ),
      ),
    ))
  it('pasif yetki kaydı erişemez', async () => {
    await adminSeed('authorizedUsers/admin', {
      uid: 'admin',
      email: 'admin@example.test',
      active: false,
      role: 'ADMIN',
      studioId: studio,
    })
    await assertFails(getDoc(doc(client('admin'), base, 'transactions', 'existing')))
  })
  it('stüdyolar arası erişim reddi', async () => {
    const db = client('other')
    await assertFails(getDoc(doc(db, base, 'transactions', 'existing')))
    await assertFails(setDoc(doc(db, base, 'transactions', 'new'), income('other')))
  })
  it('bilinmeyen koleksiyonlar kapalı', async () =>
    await assertFails(setDoc(doc(client('admin'), base, 'anything', 'new'), { value: 'bad' })))
  it('UID sahibi kendi rolünü oluşturamaz', async () =>
    await assertFails(
      setDoc(doc(client('stranger'), 'authorizedUsers', 'stranger'), {
        role: 'ADMIN',
        active: true,
      }),
    ))
  it('ADMIN dahil yetki belgeleri değiştirilemez', async () => {
    for (const uid of ['viewer', 'admin'])
      await assertFails(
        updateDoc(doc(client(uid), 'authorizedUsers', uid), {
          role: 'ADMIN',
          studioId: 'studio-b',
        }),
      )
  })
  it('yetki belgesini silme reddi', async () =>
    await assertFails(deleteDoc(doc(client('admin'), 'authorizedUsers', 'viewer'))))
  it('ADMIN yalnızca kendi stüdyosunun üyelerini listeler', async () =>
    await assertSucceeds(
      getDocs(
        query(collection(client('admin'), 'authorizedUsers'), where('studioId', '==', studio)),
      ),
    ))
  it('VIEWER başka üyeleri listeleyemez', async () =>
    await assertFails(
      getDocs(
        query(collection(client('viewer'), 'authorizedUsers'), where('studioId', '==', studio)),
      ),
    ))
})
describe('Finansal belge bütünlüğü', () => {
  it.each([
    { amountMinor: -1 },
    { amountMinor: 1.5 },
    { currency: 'BTCX' },
    { tryMinor: 1 },
    { rateMicros: 2000000 },
    { cashInMinor: 10000 },
    { schemaVersion: 2 },
    { createdBy: 'other' },
    { title: 'x' },
    { unexpected: 'secret' },
    { status: 'settled', accountId: '', cashDate: '' },
  ])(
    'geçersiz belge reddi %j',
    async (patch) =>
      await assertFails(
        setDoc(doc(client('admin'), base, 'transactions', 'invalid'), income('admin', patch)),
      ),
  )
  it('immutable oluşturucu', async () =>
    await assertFails(
      updateDoc(doc(client('admin'), base, 'transactions', 'existing'), {
        createdBy: 'viewer',
        updatedAt: serverTimestamp(),
        updatedBy: 'admin',
      }),
    ))
  it('geçerli düzenleme ve iptal', async () => {
    const db = client('admin')
    await assertSucceeds(
      updateDoc(doc(db, base, 'transactions', 'existing'), {
        title: 'Güncellendi',
        updatedAt: serverTimestamp(),
        updatedBy: 'admin',
      }),
    )
    await assertSucceeds(
      updateDoc(doc(db, base, 'transactions', 'existing'), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
        updatedBy: 'admin',
      }),
    )
  })
  it('finansal kayıt fiziksel silinemez', async () =>
    await assertFails(deleteDoc(doc(client('admin'), base, 'transactions', 'existing'))))
  it('hesap para birimi eşleşmeli', async () =>
    await assertFails(
      setDoc(
        doc(client('admin'), base, 'transactions', 'usd'),
        income('admin', {
          currency: 'USD',
          rateMicros: 42000000,
          tryMinor: 420000,
          status: 'settled',
          accountId: 'a',
          cashDate: '2026-10-25',
          cashInMinor: 10000,
        }),
      ),
    ))
  it('açılıştan önce nakit hareketi reddi', async () =>
    await assertFails(
      setDoc(
        doc(client('admin'), base, 'transactions', 'early'),
        income('admin', {
          status: 'settled',
          accountId: 'a',
          cashDate: '2025-12-01',
          cashInMinor: 10000,
        }),
      ),
    ))
  it('açılış bakiyesi kilitli', async () =>
    await assertFails(
      updateDoc(doc(client('admin'), base, 'accounts', 'a'), {
        openingMinor: 10000,
        updatedAt: serverTimestamp(),
        updatedBy: 'admin',
      }),
    ))
  it('atomik olmayan transfer reddedilir', async () =>
    await assertFails(
      setDoc(
        doc(client('admin'), base, 'transactions', 'out'),
        income('admin', {
          kind: 'transfer_out',
          status: 'settled',
          accountId: 'a',
          cashDate: '2026-10-25',
          linkId: 'in',
          cashOutMinor: 10000,
        }),
      ),
    ))
  it('atomik transfer ve yeniden yazma reddi', async () => {
    const db = client('admin'),
      batch = writeBatch(db)
    batch.set(
      doc(db, base, 'transactions', 'out'),
      income('admin', {
        kind: 'transfer_out',
        status: 'settled',
        accountId: 'a',
        cashDate: '2026-10-25',
        linkId: 'in',
        cashOutMinor: 10000,
      }),
    )
    batch.set(
      doc(db, base, 'transactions', 'in'),
      income('admin', {
        kind: 'transfer_in',
        status: 'settled',
        accountId: 'b',
        cashDate: '2026-10-25',
        linkId: 'out',
        cashInMinor: 10000,
      }),
    )
    await assertSucceeds(batch.commit())
    await assertFails(
      updateDoc(doc(db, base, 'transactions', 'out'), {
        amountMinor: 20000,
        updatedAt: serverTimestamp(),
      }),
    )
  })
  it('audit değiştirilemez / silinemez', async () => {
    const db = client('admin'),
      ref = doc(db, base, 'auditLogs', 'one')
    await assertSucceeds(
      setDoc(ref, {
        entityType: 'transactions',
        entityId: 'existing',
        action: 'update',
        actorUid: 'admin',
        timestamp: serverTimestamp(),
        before: null,
        after: { title: 'Güncellendi' },
        schemaVersion: 1,
      }),
    )
    await assertFails(updateDoc(ref, { action: 'other' }))
    await assertFails(deleteDoc(ref))
  })
})
function goldPayment(db: ReturnType<typeof client>, key: string, quantity: number, total: number) {
  const batch = writeBatch(db)
  batch.set(doc(db, base, 'repayments', key), {
    obligationId: 'gold',
    quantityMicros: quantity,
    currency: 'Gram',
    amountMinor: 0,
    rateMicros: 5000000000,
    accountId: '',
    date: '2026-10-25',
    notes: '',
    agreement: '',
    transactionId: '',
    settlementAsset: 'gold',
    ...meta(),
  })
  batch.update(doc(db, base, 'obligations', 'gold'), {
    repaidMicros: total,
    lastRepaymentId: key,
    updatedAt: serverTimestamp(),
    updatedBy: 'admin',
  })
  return batch.commit()
}
describe('Loglar yalnızca yöneticiye açık', () => {
  const access = (uid: string, overrides: Record<string, unknown> = {}) => ({
    event: 'sign_in',
    uid,
    email: uid + '@example.test',
    displayName: 'Ad',
    at: serverTimestamp(),
    userAgent: 'test',
    schemaVersion: 1,
    ...overrides,
  })
  const denied = (uid: string, overrides: Record<string, unknown> = {}) => ({
    uid,
    email: uid + '@example.test',
    studioId: studio,
    lastAt: serverTimestamp(),
    userAgent: 'test',
    schemaVersion: 1,
    ...overrides,
  })
  it('audit kaydını VIEWER okuyamaz, ADMIN okur', async () => {
    await adminSeed(`${base}/auditLogs/one`, { action: 'create' })
    await assertFails(getDoc(doc(client('viewer'), base, 'auditLogs', 'one')))
    await assertFails(getDocs(collection(client('viewer'), base, 'auditLogs')))
    await assertSucceeds(getDoc(doc(client('admin'), base, 'auditLogs', 'one')))
  })
  it('audit e-postası gerçek oturumla aynı olmalı', async () => {
    const entry = (actorEmail: string) => ({
      entityType: 'transactions',
      entityId: 'existing',
      action: 'update',
      actorUid: 'admin',
      actorEmail,
      timestamp: serverTimestamp(),
      before: null,
      after: null,
      schemaVersion: 1,
    })
    const db = client('admin')
    await assertSucceeds(setDoc(doc(db, base, 'auditLogs', 'a'), entry('admin@example.test')))
    await assertFails(setDoc(doc(db, base, 'auditLogs', 'b'), entry('other@example.test')))
  })
  it('üye kendi oturum kaydını yazar, başkası adına yazamaz', async () => {
    const db = client('viewer')
    await assertSucceeds(setDoc(doc(db, base, 'accessLogs', 'a'), access('viewer')))
    await assertFails(setDoc(doc(db, base, 'accessLogs', 'b'), access('admin')))
    await assertFails(
      setDoc(doc(db, base, 'accessLogs', 'c'), access('viewer', { email: 'x@example.test' })),
    )
    await assertFails(setDoc(doc(db, base, 'accessLogs', 'd'), access('viewer', { extra: true })))
  })
  it('yetkisiz hesap stüdyo oturum kaydı yazamaz', async () =>
    await assertFails(setDoc(doc(client('stranger'), base, 'accessLogs', 'a'), access('stranger'))))
  it('oturum kaydını yalnızca ADMIN okur; kimse değiştiremez', async () => {
    await adminSeed(`${base}/accessLogs/one`, { event: 'sign_in', uid: 'viewer' })
    await assertFails(getDoc(doc(client('viewer'), base, 'accessLogs', 'one')))
    await assertSucceeds(getDoc(doc(client('admin'), base, 'accessLogs', 'one')))
    await assertFails(
      updateDoc(doc(client('admin'), base, 'accessLogs', 'one'), { event: 'sign_out' }),
    )
    await assertFails(deleteDoc(doc(client('admin'), base, 'accessLogs', 'one')))
  })
  it('yetkisiz deneme kendi belgesine yazılır, kendisi okuyamaz', async () => {
    const db = client('stranger')
    await assertSucceeds(setDoc(doc(db, 'accessDenied', 'stranger'), denied('stranger')))
    await assertFails(setDoc(doc(db, 'accessDenied', 'someone'), denied('someone')))
    await assertFails(
      setDoc(doc(db, 'accessDenied', 'stranger'), denied('stranger', { email: 'x@example.test' })),
    )
    await assertFails(setDoc(doc(db, 'accessDenied', 'stranger'), denied('stranger', { x: 1 })))
    await assertFails(getDoc(doc(db, 'accessDenied', 'stranger')))
  })
  it('yetkisiz denemeleri yalnızca kendi stüdyosunun ADMINi listeler', async () => {
    await adminSeed('accessDenied/stranger', { uid: 'stranger', studioId: studio })
    const list = (uid: string) =>
      getDocs(query(collection(client(uid), 'accessDenied'), where('studioId', '==', studio)))
    await assertSucceeds(list('admin'))
    await assertFails(list('viewer'))
    await assertFails(list('other'))
  })
  it('anonim kullanıcı yetkisiz deneme yazamaz', async () =>
    await assertFails(
      setDoc(doc(env.unauthenticatedContext().firestore(), 'accessDenied', 'x'), denied('x')),
    ))
})
describe('Borç ve idempotency', () => {
  it('aynı altın biriminde kısmi ve tam ödeme', async () => {
    const db = client('admin')
    await assertSucceeds(setDoc(doc(db, base, 'obligations', 'gold'), obligation()))
    await assertSucceeds(goldPayment(db, 'partial', 4000000, 4000000))
    await assertSucceeds(goldPayment(db, 'full', 6000000, 10000000))
    expect((await getDoc(doc(db, base, 'obligations', 'gold'))).data()?.repaidMicros).toBe(10000000)
  })
  it('aşırı ödeme reddi', async () => {
    const db = client('admin')
    await setDoc(doc(db, base, 'obligations', 'gold'), obligation())
    await assertFails(goldPayment(db, 'over', 11000000, 11000000))
  })
  it('bağlı ödeme olmadan anapara değiştirilemez', async () => {
    const db = client('admin')
    await setDoc(doc(db, base, 'obligations', 'gold'), obligation())
    await assertFails(
      updateDoc(doc(db, base, 'obligations', 'gold'), {
        repaidMicros: 1000000,
        lastRepaymentId: 'missing',
        updatedAt: serverTimestamp(),
        updatedBy: 'admin',
      }),
    )
  })
  it('aynı ödeme kimliği iki kez kullanılamaz', async () => {
    const db = client('admin')
    await setDoc(doc(db, base, 'obligations', 'gold'), obligation())
    await assertSucceeds(goldPayment(db, 'same', 1000000, 1000000))
    await assertFails(goldPayment(db, 'same', 1000000, 2000000))
  })
  it('tekrarlayan oluşum yalnızca bir kez oluşturulur', async () => {
    const db = client('admin'),
      t = {
        title: 'API',
        amountMinor: 1000,
        currency: 'TRY',
        rateMicros: 1000000,
        nextDate: '2026-10-01',
        frequency: 'monthly',
        intervalDays: 30,
        applicationId: '',
        categoryId: '',
        accountId: 'a',
        status: 'active',
        notes: '',
        ...meta(),
      }
    await assertSucceeds(setDoc(doc(db, base, 'recurringTemplates', 'api'), t))
    const batch = writeBatch(db)
    batch.set(doc(db, base, 'recurringOccurrences', 'api_2026-10-01'), {
      templateId: 'api',
      date: '2026-10-01',
      status: 'skipped',
      transactionId: '',
      ...meta(),
    })
    batch.update(doc(db, base, 'recurringTemplates', 'api'), {
      nextDate: '2026-11-01',
      updatedAt: serverTimestamp(),
      updatedBy: 'admin',
    })
    await assertSucceeds(batch.commit())
    await assertFails(
      setDoc(doc(db, base, 'recurringOccurrences', 'api_2026-10-01'), {
        templateId: 'api',
        date: '2026-10-01',
        status: 'skipped',
        transactionId: '',
        ...meta(),
      }),
    )
  })
})
