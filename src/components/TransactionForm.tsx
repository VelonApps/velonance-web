import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { blankTransaction, saveTransaction } from '../lib/repository'
import {
  appleProceeds,
  convert,
  d,
  fromMinor,
  money,
  toMicros,
  toMinor,
  today,
} from '../lib/finance'
import { useReference, useRefresh } from '../lib/data'
import { currencies } from '../lib/models'
import type { Transaction } from '../lib/models'
import { Button, ErrorNotice, Fields, Modal, Notice, useToast } from './ui'
import type { FieldDef } from './ui'
const schema = z.object({
  title: z.string().min(2, 'En az iki karakter girin.'),
  description: z.string(),
  amount: z.string(),
  currency: z.string(),
  rate: z.string().min(1),
  date: z.string().min(1),
  status: z.string(),
  cashDate: z.string(),
  accountId: z.string(),
  applicationId: z.string(),
  categoryId: z.string(),
  notes: z.string(),
  vendor: z.string(),
  invoice: z.string(),
  attachmentName: z.string(),
  expectedDate: z.string(),
  appleMode: z.string(),
  gross: z.string(),
  commission: z.string(),
  refund: z.string(),
  adjustment: z.string(),
  period: z.string(),
})
type Values = z.infer<typeof schema>
export default function TransactionForm({
  kind,
  initial,
  onClose,
  onCancel,
}: {
  kind: 'income' | 'expense'
  initial?: Transaction
  onClose: () => void
  onCancel?: () => Promise<void>
}) {
  const [recordId] = useState(() => initial?.id || crypto.randomUUID())
  const ref = useReference(),
    refresh = useRefresh(),
    { notify } = useToast(),
    [error, setError] = useState<unknown>(null),
    [allocations, setAllocations] = useState<{ applicationId: string; percent: string }[]>(
      initial?.allocations.map((a) => ({
        applicationId: a.applicationId,
        percent: d(a.basisPoints).div(100).toString(),
      })) || [],
    )
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title || '',
      description: initial?.description || '',
      amount: initial ? fromMinor(initial.amountMinor, initial.currency) : '',
      currency: initial?.currency || 'TRY',
      rate: initial ? d(initial.rateMicros).div(1e6).toString() : '1',
      date: initial?.date || today(),
      status: initial?.status || 'pending',
      cashDate: initial?.cashDate || today(),
      accountId: initial?.accountId || '',
      applicationId: initial?.applicationId || '',
      categoryId: initial?.categoryId || '',
      notes: initial?.notes || '',
      vendor: initial?.vendor || '',
      invoice: initial?.invoice || '',
      attachmentName: initial?.attachmentName || '',
      expectedDate: initial?.expectedDate || '',
      appleMode: initial?.apple?.mode || 'none',
      gross: initial?.apple ? fromMinor(initial.apple.grossMinor, initial.currency) : '0',
      commission: initial?.apple ? d(initial.apple.commissionBps).div(100).toString() : '15',
      refund: initial?.apple ? fromMinor(initial.apple.refundMinor, initial.currency) : '0',
      adjustment: initial?.apple ? fromMinor(initial.apple.adjustmentMinor, initial.currency) : '0',
      period: initial?.apple?.period || today().slice(0, 7),
    },
  })
  const values = form.watch(),
    opt = (items: { id: string; name: string }[]) => [
      { value: '', label: 'Seçilmedi' },
      ...items.map((i) => ({ value: i.id, label: i.name })),
    ]
  let preview = '—',
    netPreview = '—'
  try {
    let amount = toMinor(values.amount || '0', values.currency)
    if (values.appleMode === 'gross')
      amount = appleProceeds(
        'gross',
        toMinor(values.gross, values.currency),
        d(values.commission || 0)
          .times(100)
          .toNumber(),
        toMinor(values.refund, values.currency),
        toMinor(values.adjustment, values.currency),
        amount,
      )
    netPreview = money(amount, values.currency)
    preview = money(
      convert(
        amount,
        values.currency,
        values.currency === 'TRY' ? 1000000 : toMicros(values.rate || '0'),
      ),
    )
  } catch {
    /* Input may be incomplete. */
  }
  const fields: FieldDef[] = [
    {
      name: 'title',
      label: kind === 'income' ? 'Gelir başlığı' : 'Gider başlığı',
      required: true,
      full: true,
    },
    {
      name: 'amount',
      label: values.appleMode === 'gross' ? 'Net tutar aşağıda hesaplanır' : 'Orijinal tutar',
      required: values.appleMode !== 'gross',
      disabled: values.appleMode === 'gross',
    },
    {
      name: 'currency',
      label: 'Para birimi',
      options: [
        ...new Set<string>([
          ...currencies,
          ...ref.accounts.map((a) => a.currency),
          values.currency,
        ]),
      ].map((c) => ({ value: c, label: c })),
    },
    {
      name: 'rate',
      label: '1 birim = kaç TRY?',
      help: 'İşleme ait tarihsel kur; güncel fiyatlardan bağımsız.',
      disabled: values.currency === 'TRY',
    },
    { name: 'date', label: 'Tahakkuk tarihi', type: 'date', required: true },
    {
      name: 'categoryId',
      label: 'Kategori',
      options: opt(ref.categories.filter((c) => !c.deleted && c.kind === kind)),
    },
    {
      name: 'applicationId',
      label: 'İlgili uygulama',
      options: opt(ref.apps.filter((a) => a.status !== 'archived')),
    },
    {
      name: 'status',
      label: 'Ödeme durumu',
      options: [
        { value: 'pending', label: kind === 'income' ? 'Tahsilat bekleniyor' : 'Ödeme bekleniyor' },
        { value: 'settled', label: kind === 'income' ? 'Tahsil edildi' : 'Ödendi' },
        { value: 'cancelled', label: 'İptal edildi' },
      ],
    },
    { name: 'expectedDate', label: 'Beklenen ödeme tarihi', type: 'date' },
    ...(values.status === 'settled'
      ? [
          {
            name: 'accountId',
            label: 'Ödeme hesabı',
            required: true,
            options: opt(ref.accounts.filter((a) => a.currency === values.currency && !a.archived)),
          },
          { name: 'cashDate', label: 'Gerçek ödeme tarihi', type: 'date', required: true },
        ]
      : []),
    { name: 'vendor', label: kind === 'income' ? 'Ödeyen / kaynak' : 'Tedarikçi' },
    { name: 'invoice', label: 'Fatura / rapor referansı' },
    { name: 'description', label: 'Açıklama', type: 'textarea', full: true },
    { name: 'notes', label: 'Notlar', type: 'textarea', full: true },
    {
      name: 'attachmentName',
      label: 'Ek belge referansı',
      help: 'Yalnızca metadata saklanır; dosya yüklenmez.',
      full: true,
    },
  ]
  return (
    <Modal
      title={
        initial ? 'İşlemi düzenle' : kind === 'income' ? 'Yeni gelir kaydı' : 'Yeni gider kaydı'
      }
      onClose={onClose}
      wide
    >
      <form
        onSubmit={form.handleSubmit(async (v) => {
          setError(null)
          try {
            let amountMinor = toMinor(v.amount || '0', v.currency)
            const rateMicros = v.currency === 'TRY' ? 1000000 : toMicros(v.rate)
            const apple =
              v.appleMode === 'none' || kind !== 'income'
                ? null
                : {
                    mode: v.appleMode as 'gross' | 'net',
                    grossMinor: toMinor(v.gross, v.currency),
                    commissionBps: d(v.commission).times(100).toNumber(),
                    refundMinor: toMinor(v.refund, v.currency),
                    adjustmentMinor: toMinor(v.adjustment, v.currency),
                    netMinor: amountMinor,
                    period: v.period,
                  }
            if (apple) {
              amountMinor = appleProceeds(
                apple.mode,
                apple.grossMinor,
                apple.commissionBps,
                apple.refundMinor,
                apple.adjustmentMinor,
                amountMinor,
              )
              apple.netMinor = amountMinor
            }
            const category = ref.categories.find((c) => c.id === v.categoryId)
            await saveTransaction(
              {
                ...blankTransaction(kind),
                title: v.title,
                description: v.description,
                amountMinor,
                currency: v.currency,
                rateMicros,
                tryMinor: convert(amountMinor, v.currency, rateMicros),
                date: v.date,
                conversionDate: initial?.conversionDate || v.date,
                status: v.status as 'pending' | 'settled' | 'cancelled',
                cashDate: v.status === 'settled' ? v.cashDate : '',
                accountId: v.status === 'settled' ? v.accountId : '',
                applicationId: v.applicationId,
                categoryId: v.categoryId,
                group: category?.group || (kind === 'income' ? 'income' : 'other'),
                notes: v.notes,
                vendor: v.vendor,
                invoice: v.invoice,
                attachmentName: v.attachmentName,
                expectedDate: v.expectedDate,
                allocations: allocations.map((a) => ({
                  applicationId: a.applicationId,
                  basisPoints: d(a.percent).times(100).toNumber(),
                })),
                apple,
              },
              recordId,
            )
            await refresh()
            notify('İşlem kaydedildi.')
            onClose()
          } catch (e) {
            setError(e)
          }
        })}
      >
        <Fields
          fields={fields}
          register={(n) => form.register(n as keyof Values)}
          errors={form.formState.errors}
        />
        {kind === 'income' && (
          <div className="form-section">
            <h3>Apple gelir ayrıntıları</h3>
            <Fields
              fields={[
                {
                  name: 'appleMode',
                  label: 'Hesaplama yöntemi',
                  options: [
                    { value: 'none', label: 'Standart gelir' },
                    { value: 'gross', label: 'Brüt satıştan net hesapla' },
                    { value: 'net', label: 'Apple net proceeds doğrudan gir' },
                  ],
                },
                ...(values.appleMode !== 'none'
                  ? [
                      { name: 'period', label: 'Apple rapor dönemi', type: 'month' },
                      { name: 'gross', label: 'Brüt müşteri satışları' },
                      { name: 'commission', label: 'Komisyon (%)' },
                      { name: 'refund', label: 'İadeler' },
                      { name: 'adjustment', label: 'Vergi / net düzeltme (+/−)' },
                    ]
                  : []),
              ]}
              register={(n) => form.register(n as keyof Values)}
            />
            {values.appleMode !== 'none' && (
              <Notice>
                Hesaplanan net tutar: {netPreview}. Net proceeds modunda tutar yeniden komisyona
                tabi tutulmaz. Brüt modda komisyon satıştan düşülür; iadeler ve net düzeltmeler
                ayrıca uygulanır. Gerçek banka tahsilatı ödeme tarihiyle ayrılır.
              </Notice>
            )}
          </div>
        )}
        {kind === 'expense' && (
          <div className="form-section">
            <h3>Paylaşılan gider dağılımı</h3>
            <p className="muted">
              Dağılım yoksa gider şirket geneline aittir. En fazla 5 uygulama; toplam %100.
            </p>
            {allocations.map((a, i) => (
              <div className="allocation" key={i}>
                <select
                  aria-label={'Dağılım uygulaması ' + (i + 1)}
                  value={a.applicationId}
                  onChange={(e) =>
                    setAllocations(
                      allocations.map((v, j) =>
                        i === j ? { ...v, applicationId: e.target.value } : v,
                      ),
                    )
                  }
                >
                  {opt(ref.apps).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={'Dağılım yüzdesi ' + (i + 1)}
                  value={a.percent}
                  onChange={(e) =>
                    setAllocations(
                      allocations.map((v, j) => (i === j ? { ...v, percent: e.target.value } : v)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Dağılımı kaldır"
                  onClick={() => setAllocations(allocations.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
            {allocations.length < 5 && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAllocations([...allocations, { applicationId: '', percent: '' }])}
              >
                <Plus size={15} /> Dağılım ekle
              </Button>
            )}
          </div>
        )}
        <div className="conversion-preview">
          <span>Tarihsel TRY karşılığı</span>
          <strong>{preview}</strong>
        </div>
        <ErrorNotice error={ref.error || error} />
        <div className="form-actions">
          {onCancel && (
            <Button
              type="button"
              variant="danger"
              disabled={form.formState.isSubmitting}
              onClick={() => void onCancel()}
            >
              İşlemi iptal et
            </Button>
          )}
          <Button variant="secondary" type="button" onClick={onClose}>
            Vazgeç
          </Button>
          <Button disabled={form.formState.isSubmitting || ref.loading}>
            {form.formState.isSubmitting ? 'Kaydediliyor…' : 'İşlemi kaydet'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
