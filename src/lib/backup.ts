import { z } from 'zod'
import { doc, getDoc, getDocs, limit, orderBy, query, startAfter } from 'firebase/firestore'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { auth, studioId } from './firebase'
import { dateLabel, fromMinor } from './finance'
import { schemas } from './models'
import type { CollectionName, Transaction, TransactionInput } from './models'
import { root, saveEntity, saveTransaction } from './repository'
export function csvCell(value: unknown) {
  const s = String(value ?? '')
  return '"' + (/^[\s]*[=+\-@\t\r\n]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
}
export type CsvNames = {
  apps?: { id: string; name: string }[]
  categories?: { id: string; name: string }[]
  accounts?: { id: string; name: string }[]
}
const nameOf = (list: { id: string; name: string }[] | undefined, id: string) =>
  list?.find((v) => v.id === id)?.name || id
export function tableCsv(headers: string[], rows: unknown[][]) {
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
export function csvContent(rows: Transaction[], names: CsvNames = {}) {
  return (
    '\uFEFF' +
    [
      [
        'ID',
        'Tür',
        'Başlık',
        'Tahakkuk tarihi',
        'Ödeme tarihi',
        'Durum',
        'Orijinal tutar',
        'Para birimi',
        'Tarihsel TRY',
        'Uygulama',
        'Kategori',
        'Hesap',
        'Tedarikçi',
        'Fatura',
        'Not',
      ],
      ...rows.map((r) => [
        r.id,
        r.kind,
        r.title,
        dateLabel(r.date),
        dateLabel(r.cashDate),
        r.status,
        fromMinor(r.amountMinor, r.currency),
        r.currency,
        fromMinor(r.tryMinor),
        nameOf(names.apps, r.applicationId),
        nameOf(names.categories, r.categoryId),
        nameOf(names.accounts, r.accountId),
        r.vendor,
        r.invoice,
        r.notes,
      ]),
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n')
  )
}
export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function exportCSV(rows: Transaction[], names: CsvNames = {}) {
  if (!auth?.currentUser) throw new Error('Oturum gerekli.')
  download('velonance-islemler.csv', csvContent(rows, names), 'text/csv;charset=utf-8')
}
export function exportTable(filename: string, headers: string[], rows: unknown[][]) {
  if (!auth?.currentUser) throw new Error('Oturum gerekli.')
  download(filename, tableCsv(headers, rows), 'text/csv;charset=utf-8')
}
export const backupCollections = [
  'applications',
  'accounts',
  'categories',
  'exchangeRates',
  'obligations',
  'repayments',
  'recurringTemplates',
  'recurringOccurrences',
  'advertisingCampaigns',
  'transactions',
  'settings',
] as const
export const adminBackupCollections = ['auditLogs', 'accessLogs'] as const
export async function exportBackup(includeLogs = false) {
  const collections: Record<string, unknown[]> = {}
  for (const name of [...backupCollections, ...(includeLogs ? adminBackupCollections : [])]) {
    const rows: unknown[] = []
    let cursor: QueryDocumentSnapshot | undefined
    for (;;) {
      const result = await getDocs(
        query(root(name), orderBy('__name__'), ...(cursor ? [startAfter(cursor)] : []), limit(250)),
      )
      rows.push(...result.docs.map((s) => ({ ...s.data(), id: s.id })))
      if (result.size < 250) break
      cursor = result.docs.at(-1)
    }
    collections[name] = rows
  }
  const result = { schemaVersion: 1, studioId, exportedAt: new Date().toISOString(), collections }
  download(
    'velonance-yedek-' + new Date().toISOString().slice(0, 10) + '.json',
    JSON.stringify(result, null, 2),
    'application/json',
  )
}
const backupSchema = z.object({
  schemaVersion: z.literal(1),
  studioId: z.string(),
  exportedAt: z.string(),
  collections: z.record(z.string(), z.array(z.record(z.string(), z.unknown())).max(5000)),
})
export type ImportRow = {
  collection: string
  id: string
  data: Record<string, unknown>
  status: 'ready' | 'duplicate' | 'invalid' | 'unsupported'
  message: string
}
export function validateBackup(text: string, expectedStudio: string) {
  const parsed = backupSchema.parse(JSON.parse(text))
  if (parsed.studioId !== expectedStudio)
    throw new Error(
      'Bu yedek farklı stüdyoya ait. Stüdyo kimliğini elle değiştirerek içe aktarmayın.',
    )
  let count = 0
  const seen = new Set<string>()
  const rows: ImportRow[] = []
  for (const [name, records] of Object.entries(parsed.collections)) {
    for (const raw of records) {
      if (++count > 10000) throw new Error('Dosyada en fazla 10.000 kayıt olabilir.')
      const id = typeof raw.id === 'string' ? raw.id : '',
        row: ImportRow = { collection: name, id, data: raw, status: 'ready', message: '' },
        key = name + '/' + id
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
        row.status = 'invalid'
        row.message = 'Geçersiz belge kimliği.'
      } else if (seen.has(key)) {
        row.status = 'duplicate'
        row.message = 'Dosyada yinelenen kimlik.'
      } else if (
        ![
          'applications',
          'accounts',
          'categories',
          'exchangeRates',
          'recurringTemplates',
          'advertisingCampaigns',
          'transactions',
          'settings',
        ].includes(name)
      ) {
        row.status = 'unsupported'
        row.message =
          'Bağlı finansal/audit kayıtlarının geri yüklenmesi güvenli sunucu işlemi gerektirir.'
      } else {
        const schema = schemas[name as keyof typeof schemas],
          result = schema.safeParse(raw)
        if (!result.success) {
          row.status = 'invalid'
          row.message = result.error.issues
            .map((i) => i.path.join('.') + ': ' + i.message)
            .join('; ')
        } else if (raw.deleted === true) {
          row.status = 'unsupported'
          row.message = 'Silinmiş kayıtlar içe alınmaz.'
        } else if (
          name === 'transactions' &&
          (!['income', 'expense'].includes(String(raw.kind)) || raw.linkId !== '')
        ) {
          row.status = 'unsupported'
          row.message = 'Yalnızca bağımsız gelir/gider aktarılır.'
        } else {
          row.data = result.data
        }
      }
      seen.add(key)
      rows.push(row)
    }
  }
  return rows
}
export async function previewImport(file: File) {
  if (file.size > 5 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.json'))
    throw new Error('En fazla 5 MB boyutunda JSON dosyası seçin.')
  const rows = validateBackup(await file.text(), studioId)
  for (const row of rows.filter((r) => r.status === 'ready')) {
    const existing = await getDoc(doc(root(row.collection), row.id))
    if (existing.exists()) {
      row.status = 'duplicate'
      row.message = 'Bu kimlik zaten mevcut; üzerine yazılmaz.'
    }
  }
  return rows
}
export async function importRows(
  rows: ImportRow[],
  progress: (done: number, total: number) => void,
) {
  const order = [
      'applications',
      'accounts',
      'categories',
      'exchangeRates',
      'advertisingCampaigns',
      'settings',
      'recurringTemplates',
      'transactions',
    ],
    ready = rows
      .filter((r) => r.status === 'ready')
      .sort((a, b) => order.indexOf(a.collection) - order.indexOf(b.collection)),
    results: { id: string; error: string }[] = []
  let done = 0
  for (const row of ready) {
    try {
      if ((await getDoc(doc(root(row.collection), row.id))).exists())
        throw new Error('Kayıt zaten mevcut; atlandı.')
      if (row.collection === 'transactions')
        await saveTransaction(row.data as TransactionInput, row.id, true)
      else
        await saveEntity(
          row.collection as Exclude<
            CollectionName,
            'transactions' | 'repayments' | 'recurringOccurrences' | 'obligations'
          >,
          row.data,
          row.id,
          true,
        )
    } catch (e) {
      results.push({ id: row.id, error: e instanceof Error ? e.message : 'Aktarım başarısız.' })
    }
    progress(++done, ready.length)
  }
  return results
}
