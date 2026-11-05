import { useState } from 'react'
import { CalendarClock, Pencil, Plus } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useRecurring, useReference } from '../lib/data'
import { d, dateLabel, fromMinor, money, toMicros, toMinor, today } from '../lib/finance'
import type { Recurring } from '../lib/models'
import { currencyOptions } from '../lib/models'
import { saveEntity, settleOccurrence } from '../lib/repository'
import { EntityForm } from '../components/EntityForm'
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Loading,
  Notice,
  PageHeading,
  Panel,
  Truncated,
} from '../components/ui'
const frequency = {
  weekly: 'Haftalık',
  monthly: 'Aylık',
  quarterly: 'Üç aylık',
  yearly: 'Yıllık',
  custom: 'Özel aralık',
}
export default function RecurringPage() {
  const { authorization } = useAuth(),
    ref = useReference(),
    data = useRecurring(),
    [form, setForm] = useState<Recurring | 'new' | null>(null),
    [occurrence, setOccurrence] = useState<Recurring | null>(null)
  return (
    <>
      <PageHeading
        title="Tekrarlayan işlemler"
        description="Abonelikleri ve düzenli giderleri bir takvimde yönetin."
        actions={
          authorization?.role === 'ADMIN' && (
            <Button onClick={() => setForm('new')}>
              <Plus size={17} /> Takvim ekle
            </Button>
          )
        }
      />
      <Notice>
        Şablon bir gider veya ödeme değildir. “Gerçekleştir” ile oluşum başına tek gider ve nakit
        hareketi kaydedilir. Atlamak gider üretmez. Aylık takvim kısa aylarda son güne uyarlanır;
        sonraki tarih bu günden ilerler.
      </Notice>
      <ErrorNotice error={data.error || ref.error} />
      <Truncated show={data.data?.truncated || ref.truncated} />
      {data.isPending ? (
        <Loading />
      ) : !data.data?.rows.length ? (
        <Panel>
          <Empty
            title="Düzenli giderlerinize yer açın."
            description="API abonelikleri, lisanslar ve diğer periyodik ödemeleri planlayın."
          />
        </Panel>
      ) : (
        <Panel>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ödeme</th>
                  <th>Sıklık</th>
                  <th>Sonraki tarih</th>
                  <th>Durum</th>
                  <th>Tutar</th>
                  {authorization?.role === 'ADMIN' && <th>İşlem</th>}
                </tr>
              </thead>
              <tbody>
                {data.data.rows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="transaction-name">
                        <span className="transaction-icon">
                          <CalendarClock size={18} />
                        </span>
                        <strong>{t.title}</strong>
                      </div>
                    </td>
                    <td>
                      {frequency[t.frequency]}
                      {t.frequency === 'custom' ? ` · ${t.intervalDays} gün` : ''}
                    </td>
                    <td>{dateLabel(t.nextDate)}</td>
                    <td>
                      <Badge tone={t.status === 'active' ? 'green' : 'neutral'}>
                        {t.status === 'active'
                          ? 'Etkin'
                          : t.status === 'paused'
                            ? 'Duraklatıldı'
                            : 'İptal'}
                      </Badge>
                    </td>
                    <td>{money(t.amountMinor, t.currency)}</td>
                    {authorization?.role === 'ADMIN' && (
                      <td>
                        <div className="inline-actions">
                          <Button
                            variant="ghost"
                            aria-label={t.title + ' düzenle'}
                            onClick={() => setForm(t)}
                          >
                            <Pencil size={16} />
                          </Button>
                          {t.status === 'active' && (
                            <Button variant="secondary" onClick={() => setOccurrence(t)}>
                              Gerçekleştir
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {form && (
        <EntityForm
          title={form === 'new' ? 'Yeni tekrarlayan gider' : 'Takvimi düzenle'}
          onClose={() => setForm(null)}
          initial={
            form === 'new'
              ? {}
              : {
                  ...Object.fromEntries(
                    Object.entries(form).filter(([, v]) => typeof v === 'string'),
                  ),
                  amount: fromMinor(form.amountMinor, form.currency),
                  rate: d(form.rateMicros).div(1e6).toString(),
                  intervalDays: String(form.intervalDays),
                }
          }
          fields={[
            {
              name: 'title',
              label: 'Başlık',
              required: true,
              full: true,
              example: 'ChatGPT Plus aboneliği',
              help: 'Düzenli tekrarlayan masrafın adı: abonelik, sunucu, lisans gibi.',
            },
            {
              name: 'amount',
              label: 'Tutar',
              required: true,
              numeric: true,
              example: '20',
              help: 'Her dönem ödenen tutar, seçtiğin para biriminde.',
            },
            {
              name: 'currency',
              label: 'Para birimi',
              required: true,
              defaultValue: 'TRY',
              options: currencyOptions(ref.accounts.map((a) => a.currency)),
            },
            {
              name: 'rate',
              label: 'Tahmini TRY kuru',
              required: true,
              defaultValue: '1',
              numeric: true,
              example: '42,35',
              help: 'Planlama için yaklaşık kur. Gerçek ödemeyi kaydederken o günün kurunu ayrıca girersin.',
            },
            {
              name: 'frequency',
              label: 'Tekrar sıklığı',
              options: Object.entries(frequency).map(([value, label]) => ({ value, label })),
            },
            {
              name: 'intervalDays',
              label: 'Özel tekrar aralığı (gün)',
              defaultValue: '30',
              numeric: true,
              example: '14',
              help: 'Sadece sıklık “Özel” seçiliyse kullanılır: kaç günde bir tekrarlanacak.',
            },
            {
              name: 'nextDate',
              label: 'Sonraki oluşum tarihi',
              type: 'date',
              required: true,
              help: 'Bir sonraki ödemenin beklendiği gün.',
              defaultValue: today(),
            },
            {
              name: 'accountId',
              label: 'Ödeme hesabı',
              options: [
                { value: '', label: 'Seçilmedi' },
                ...ref.accounts
                  .filter((a) => !a.archived)
                  .map((a) => ({ value: a.id, label: a.name + ' · ' + a.currency })),
              ],
            },
            {
              name: 'applicationId',
              label: 'Uygulama',
              options: [
                { value: '', label: 'Şirket geneli' },
                ...ref.apps.map((a) => ({ value: a.id, label: a.name })),
              ],
            },
            {
              name: 'categoryId',
              label: 'Gider kategorisi',
              options: [
                { value: '', label: 'Seçilmedi' },
                ...ref.categories
                  .filter((c) => !c.deleted && c.kind === 'expense')
                  .map((a) => ({ value: a.id, label: a.name })),
              ],
            },
            {
              name: 'status',
              label: 'Durum',
              options: [
                { value: 'active', label: 'Etkin' },
                { value: 'paused', label: 'Duraklatıldı' },
                { value: 'cancelled', label: 'İptal' },
              ],
            },
            { name: 'notes', label: 'Notlar', type: 'textarea', full: true },
          ]}
          onSave={(v) =>
            saveEntity(
              'recurringTemplates',
              {
                title: v.title,
                amountMinor: toMinor(v.amount, v.currency.toUpperCase()),
                currency: v.currency.toUpperCase(),
                rateMicros: v.currency.toUpperCase() === 'TRY' ? 1000000 : toMicros(v.rate),
                nextDate: v.nextDate,
                frequency: v.frequency,
                intervalDays: Number(v.intervalDays),
                applicationId: v.applicationId,
                categoryId: v.categoryId,
                accountId: v.accountId,
                status: v.status,
                notes: v.notes,
              },
              form === 'new' ? undefined : form.id,
            )
          }
        />
      )}
      {occurrence && (
        <EntityForm
          title={occurrence.title + ' · ' + dateLabel(occurrence.nextDate)}
          onClose={() => setOccurrence(null)}
          fields={[
            {
              name: 'action',
              label: 'Oluşum işlemi',
              options: [
                { value: 'paid', label: 'Gerçek gider ve ödeme oluştur' },
                { value: 'skipped', label: 'Bu oluşumu atla' },
              ],
            },
            {
              name: 'paymentDate',
              label: 'Gerçek ödeme tarihi',
              type: 'date',
              defaultValue: today(),
              required: true,
            },
            {
              name: 'rate',
              label: 'Ödeme günündeki TRY kuru',
              numeric: true,
              example: '42,35',
              help: 'Ödemenin yapıldığı gün 1 birim kaç TL idi. TRY için 1.',
              defaultValue: d(occurrence.rateMicros).div(1e6).toString(),
              required: true,
            },
          ]}
          onSave={(v) => {
            if (v.action === 'paid' && occurrence.nextDate > today())
              throw new Error(
                'Gelecekteki tahakkuku bugünden gerçekleşmiş gider olarak kaydetmeyin.',
              )
            return settleOccurrence(
              occurrence,
              occurrence.nextDate,
              v.action as 'paid' | 'skipped',
              occurrence.currency === 'TRY' ? 1000000 : toMicros(v.rate),
              v.paymentDate,
            )
          }}
        >
          <Notice>
            Ödeme hesabı ve kategori şablondan alınır. Kaydetmeden önce doğru olduklarını kontrol
            edin. Aynı oluşum yeniden gider oluşturamaz.
          </Notice>
        </EntityForm>
      )}
    </>
  )
}
