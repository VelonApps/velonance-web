import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Coins, Plus } from 'lucide-react'
import { getDocs, query, where } from 'firebase/firestore'
import { useQuery } from '@tanstack/react-query'
import { friendlyError, useAuth } from '../lib/auth'
import { useObligations, useReference, useRefresh, useRates } from '../lib/data'
import {
  cancelObligation,
  createObligation,
  repay,
  reverseRepayment,
  root,
  updateObligationDetails,
} from '../lib/repository'
import {
  d,
  dateLabel,
  rateKey,
  money,
  number,
  parseAmount,
  remaining,
  toMicros,
  toMinor,
  today,
  valueQuantity,
} from '../lib/finance'
import { currencyOptions, unitOptions } from '../lib/models'
import type { Obligation, Repayment } from '../lib/models'
import { EntityForm, useRateSync } from '../components/EntityForm'
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Loading,
  Modal,
  Notice,
  PageHeading,
  Panel,
  Truncated,
  useToast,
} from '../components/ui'
export default function Obligations() {
  const { authorization } = useAuth(),
    obligations = useObligations(),
    ref = useReference(),
    liveRates = useRates(),
    rates = liveRates.rates,
    [filter, setFilter] = useState('all'),
    [form, setForm] = useState<'payable' | 'receivable' | Obligation | null>(null),
    [view, setView] = useState<Obligation | null>(null),
    [edit, setEdit] = useState<Obligation | null>(null),
    syncDebt = useRateSync({ quantity: 'quantity', rate: 'originalRate', total: 'tryTotal' }),
    syncPayment = useRateSync({ quantity: 'amount', rate: 'rate', total: 'tryTotal' }),
    refresh = useRefresh(),
    { notify } = useToast(),
    [key, setKey] = useState(() => crypto.randomUUID())
  const rows = (obligations.data?.rows || []).filter(
      (o) => filter === 'all' || o.direction === filter,
    ),
    open = (v: typeof form) => {
      setKey(crypto.randomUUID())
      setForm(v)
    }
  async function cancel(o: Obligation) {
    if (
      !confirm(
        'Bu kayıt iptal edilsin mi? Varsa başlangıç nakit hareketi de geri alınır; değişiklik kayıtlarda kalır.',
      )
    )
      return
    try {
      await cancelObligation(o.id)
      await refresh()
      notify('Kayıt iptal edildi.')
    } catch (e) {
      notify(friendlyError(e), 'error')
    }
  }
  return (
    <>
      <PageHeading
        title="Borçlar ve alacaklar"
        description="Anapara, altın ve geri ödemeler. Her yükümlülüğü kendi biriminde koruyun."
        actions={
          authorization?.role === 'ADMIN' && (
            <>
              <Button variant="secondary" onClick={() => open('receivable')}>
                <ArrowDownLeft size={16} /> Alacak ekle
              </Button>
              <Button onClick={() => open('payable')}>
                <Plus size={17} /> Borç ekle
              </Button>
            </>
          )
        }
      />
      <div className="tabs">
        {[
          ['all', 'Tümü'],
          ['payable', 'Borçlar'],
          ['receivable', 'Alacaklar'],
        ].map(([v, l]) => (
          <button className={filter === v ? 'active' : ''} key={v} onClick={() => setFilter(v)}>
            {l}
          </button>
        ))}
      </div>
      <ErrorNotice error={obligations.error || ref.error} />
      <Truncated show={obligations.data?.truncated || ref.truncated} />
      <Notice>
        Alınan borç gelir, ödenen anapara faaliyet gideri değildir. Altının fiyat değişimi nakit
        gider oluşturmaz. Faiz oranı yalnızca sözleşme bilgisidir; gerçekleşen faizi ayrıca
        gider/gelir kaydedin.
      </Notice>
      {obligations.isPending ? (
        <Loading />
      ) : !rows.length ? (
        <Panel>
          <Empty
            title="Açık bir yükümlülüğünüz görünmüyor."
            description="Para veya altın cinsinden borç ve alacaklarınızı ekleyin."
          />
        </Panel>
      ) : (
        <div className="obligation-grid">
          {rows.map((o) => {
            const left = remaining(o),
              current = rates.get(rateKey(o.unit, o.asset)),
              status =
                left === 0
                  ? 'Kapandı'
                  : o.dueDate < today()
                    ? 'Vadesi geçti'
                    : o.repaidMicros > 0
                      ? 'Kısmen ödendi'
                      : 'Açık'
            return (
              <Panel key={o.id}>
                <div className="obligation-top">
                  <span className="account-icon">
                    {o.asset === 'gold' ? (
                      <Coins size={21} />
                    ) : o.direction === 'payable' ? (
                      <ArrowUpRight size={21} />
                    ) : (
                      <ArrowDownLeft size={21} />
                    )}
                  </span>
                  <Badge tone={left === 0 ? 'green' : o.dueDate < today() ? 'red' : 'amber'}>
                    {status}
                  </Badge>
                </div>
                <span className="eyebrow">
                  {o.direction === 'payable' ? 'BORÇ' : 'ALACAK'} · {o.counterparty}
                </span>
                <h2>{o.title}</h2>
                <strong className="obligation-amount">
                  {number(d(left).div(1e6).toNumber())}
                  <small> {o.unit}</small>
                </strong>
                <div className="obligation-values">
                  <span>
                    İlk toplam değer
                    <strong>{money(valueQuantity(o.quantityMicros, o.originalRateMicros))}</strong>
                  </span>
                  <span>
                    Kalanın tarihsel değeri
                    <strong>{money(valueQuantity(left, o.originalRateMicros))}</strong>
                  </span>
                  <span>
                    Güncel kalan tahmini
                    <strong>
                      {current ? money(valueQuantity(left, current)) : 'Fiyat girilmedi'}
                    </strong>
                  </span>
                  <span>
                    Ödenen miktar
                    <strong>
                      {number(o.repaidMicros / 1e6)} {o.unit}
                    </strong>
                  </span>
                  <span>
                    Vade<strong>{dateLabel(o.dueDate)}</strong>
                  </span>
                </div>
                <div className="card-actions">
                  <Button variant="secondary" onClick={() => setView(o)}>
                    Ödeme geçmişi
                  </Button>
                  {authorization?.role === 'ADMIN' && left > 0 && (
                    <Button onClick={() => open(o)}>Ödeme kaydet</Button>
                  )}
                  {authorization?.role === 'ADMIN' && (
                    <Button variant="secondary" onClick={() => setEdit(o)}>
                      Düzenle
                    </Button>
                  )}
                  {authorization?.role === 'ADMIN' && o.repaidMicros === 0 && (
                    <Button variant="ghost" onClick={() => void cancel(o)}>
                      İptal et
                    </Button>
                  )}
                </div>
              </Panel>
            )
          })}
        </div>
      )}
      {typeof form === 'string' && (
        <EntityForm
          key={key}
          title={form === 'payable' ? 'Yeni borç' : 'Yeni alacak'}
          onClose={() => setForm(null)}
          onFieldChange={syncDebt}
          fields={[
            {
              name: 'title',
              label: 'Başlık',
              required: true,
              full: true,
              example:
                form === 'payable' ? 'Ahmet’ten alınan dolar borcu' : 'Mehmet’e verilen avans',
              help: 'Bu borcu/alacağı listede tanıyacağın kısa bir ad.',
            },
            {
              name: 'counterparty',
              label: 'Karşı taraf',
              required: true,
              example: 'Ahmet Yılmaz',
              help:
                form === 'payable'
                  ? 'Parayı veya altını KİMDEN aldın? Kişi ya da kurum adı yaz (örn. Ahmet Yılmaz, Garanti Bankası).'
                  : 'Parayı veya altını KİME verdin? Kişi ya da kurum adı yaz.',
            },
            {
              name: 'unit',
              label: 'Para birimi / altın',
              required: true,
              defaultValue: 'TRY',
              options: unitOptions(ref.rates),
              help: 'Ne aldın ya da verdin? Para birimi veya altın türünü seç. Altın borçları gram/çeyrek gibi kendi biriminde takip edilir; listede olmayan altın türü için önce Ayarlar → Döviz ve altın ekranından fiyatını ekle.',
            },
            {
              name: 'quantity',
              label: 'Orijinal miktar',
              required: true,
              numeric: true,
              example: '1000',
              help: 'Seçtiğin birimden ne kadar? Örn. 1000 dolar için 1000, 10 gram altın için 10. Binlik ayıracı (nokta) kullanma.',
            },
            {
              name: 'originalRate',
              label: '1 birimin ilk TRY değeri',
              required: true,
              defaultValue: '1',
              numeric: true,
              example: '42,35',
              help: 'Borç alındığı gün 1 birim kaç TL idi? Örn. 1 USD = 42,35. TRY için 1 kalır. Kuru bilmiyorsan yandaki toplam TL alanını doldur, kur kendiliğinden hesaplanır.',
            },
            {
              name: 'tryTotal',
              label: 'Toplam TL karşılığı',
              numeric: true,
              example: '4235',
              help: 'Bu borcun alındığı günkü toplam TL değeri. Miktarı ve kuru girersen kendiliğinden dolar; toplamı yazarsan 1 birimin TL değeri hesaplanır.',
            },
            {
              name: 'date',
              label: 'Başlangıç tarihi',
              type: 'date',
              required: true,
              defaultValue: today(),
            },
            {
              name: 'dueDate',
              label: 'Vade tarihi',
              type: 'date',
              required: true,
              defaultValue: today(),
              help: 'Ödenmesi gereken son gün. Bu tarih geçince kart “Vadesi geçti” olarak işaretlenir.',
            },
            {
              name: 'cash',
              label: 'Başlangıç nakit hareketi',
              options: [
                { value: 'no', label: 'Nakit hareketi yok / önceki dönem' },
                { value: 'yes', label: 'Anapara hesaba girdi / hesaptan çıktı' },
              ],
              help: 'Para bir hesabına girdiyse (borç) veya hesabından çıktıysa (alacak) “Anapara hesaba girdi” seç ve hesabı seç. Elden altın ya da eski tarihli bir borçsa “Nakit hareketi yok” bırak.',
            },
            {
              name: 'accountId',
              label: 'Başlangıç hesabı',
              options: [
                { value: '', label: 'Seçilmedi' },
                ...ref.accounts
                  .filter((a) => !a.archived)
                  .map((a) => ({ value: a.id, label: a.name + ' · ' + a.currency })),
              ],
            },
            {
              name: 'interest',
              label: 'Sözleşme faizi (%)',
              defaultValue: '0',
              numeric: true,
              example: '0',
              help: 'Sadece bilgi amaçlı; otomatik faiz hesaplanmaz. Faizsizse 0.',
            },
            {
              name: 'terms',
              label: 'Ödeme koşulları',
              type: 'textarea',
              full: true,
              example: '3 ayda eşit taksit, her ayın 15’i',
            },
            { name: 'notes', label: 'Not', type: 'textarea', full: true },
          ]}
          onSave={(v) => {
            const asset = v.unit.startsWith('gold:') ? 'gold' : 'currency',
              unit = asset === 'gold' ? v.unit.slice(5) : v.unit,
              rate = unit === 'TRY' ? 1000000 : toMicros(v.originalRate)
            return createObligation(
              {
                direction: form,
                counterparty: v.counterparty,
                title: v.title,
                asset,
                unit,
                quantityMicros: toMicros(v.quantity),
                originalRateMicros: rate,
                date: v.date,
                dueDate: v.dueDate,
                notes: v.notes,
                terms: v.terms,
                interestBps: parseAmount(v.interest || '0')
                  .times(100)
                  .toNumber(),
              },
              v.cash === 'yes'
                ? {
                    accountId: v.accountId,
                    currency: unit,
                    amountMinor: toMinor(v.quantity, unit),
                    rateMicros: rate,
                  }
                : null,
              key,
            )
          }}
        />
      )}
      {form && typeof form !== 'string' && (
        <EntityForm
          key={key}
          title="Anapara ödemesi kaydet"
          onClose={() => setForm(null)}
          onFieldChange={syncPayment}
          fields={[
            {
              name: 'quantity',
              label: `Kapatılan ${form.unit} miktarı`,
              required: true,
              numeric: true,
              example: '250',
              help: `Kalan: ${number(remaining(form) / 1e6)} ${form.unit}`,
            },
            {
              name: 'mode',
              label: 'Ödeme yöntemi',
              options: [
                { value: 'cash', label: 'Finansal hesaptan para ödemesi' },
                ...(form.asset === 'gold'
                  ? [{ value: 'gold', label: 'Özgün altın biriminde ayni teslim' }]
                  : []),
              ],
            },
            {
              name: 'currency',
              label: 'Gerçek ödeme para birimi',
              defaultValue: form.asset === 'currency' ? form.unit : 'TRY',
              options: currencyOptions(ref.accounts.map((a) => a.currency)),
              help: 'Ödemeyi hangi para biriminde yaptın? Altını elden teslim ettiysen bu alan dikkate alınmaz.',
            },
            {
              name: 'amount',
              label: 'Gerçek nakit tutarı',
              defaultValue: '0',
              numeric: true,
              example: '250',
              help: 'Hesaptan gerçekten çıkan/giren para. Aynı birimde ödüyorsan kapatılan miktarla aynı olur.',
            },
            {
              name: 'rate',
              label: 'Gerçek ödemenin TRY kuru',
              defaultValue: '1',
              numeric: true,
              example: '42,35',
              help: 'Ödeme günü 1 birim kaç TL idi? TRY için 1 kalır. Bilmiyorsan aşağıya toplam TL tutarını yaz.',
            },
            {
              name: 'tryTotal',
              label: 'Ödemenin toplam TL karşılığı',
              numeric: true,
              example: '10.587,50',
              help: 'Nakit tutarı ile kuru girersen kendiliğinden dolar; toplam TL’yi yazarsan kur hesaplanır.',
            },
            {
              name: 'accountId',
              label: 'Ödeme hesabı',
              options: [
                { value: '', label: 'Ayni teslim / seçilmedi' },
                ...ref.accounts
                  .filter((a) => !a.archived)
                  .map((a) => ({ value: a.id, label: a.name + ' · ' + a.currency })),
              ],
            },
            {
              name: 'date',
              label: 'Ödeme tarihi',
              type: 'date',
              required: true,
              defaultValue: today(),
            },
            {
              name: 'agreement',
              label: 'Farklı birimle kapatma mutabakatı',
              type: 'textarea',
              full: true,
              help: 'Örn. 2 gram altının 12.000 TRY ile kapatılması karşılıklı kabul edildi.',
            },
            { name: 'notes', label: 'Not', type: 'textarea', full: true },
          ]}
          onSave={(v) =>
            repay({
              obligationId: form.id,
              quantityMicros: toMicros(v.quantity),
              currency: v.mode === 'gold' ? form.unit : v.currency.toUpperCase(),
              amountMinor: v.mode === 'gold' ? 0 : toMinor(v.amount, v.currency.toUpperCase()),
              rateMicros:
                v.mode === 'gold'
                  ? form.originalRateMicros
                  : v.currency.toUpperCase() === 'TRY'
                    ? 1000000
                    : toMicros(v.rate),
              accountId: v.mode === 'gold' ? '' : v.accountId,
              date: v.date,
              notes: v.notes,
              agreement: v.agreement,
              key,
              inKind: v.mode === 'gold',
            })
          }
        >
          <Notice>
            Ayni altın teslimi nakit akışı oluşturmaz. Farklı para birimiyle ödemede kapatılan özgün
            miktarı ve mutabakatı açıkça belirtin.
          </Notice>
        </EntityForm>
      )}
      {edit && (
        <EntityForm
          title="Kaydı düzenle"
          onClose={() => setEdit(null)}
          initial={{
            title: edit.title,
            counterparty: edit.counterparty,
            dueDate: edit.dueDate,
            interest: String(edit.interestBps / 100),
            terms: edit.terms,
            notes: edit.notes,
          }}
          fields={[
            { name: 'title', label: 'Başlık', required: true, full: true },
            { name: 'counterparty', label: 'Karşı taraf', required: true },
            { name: 'dueDate', label: 'Vade tarihi', type: 'date', required: true },
            { name: 'interest', label: 'Sözleşme faizi (%)', defaultValue: '0' },
            { name: 'terms', label: 'Ödeme koşulları', type: 'textarea', full: true },
            { name: 'notes', label: 'Not', type: 'textarea', full: true },
          ]}
          onSave={(v) =>
            updateObligationDetails(edit.id, {
              title: v.title,
              counterparty: v.counterparty,
              dueDate: v.dueDate,
              notes: v.notes,
              terms: v.terms,
              interestBps: parseAmount(v.interest || '0')
                .times(100)
                .toNumber(),
            })
          }
        >
          <Notice>
            Miktar, kur ve tarih değiştirilemez. Bu alanlarda hata varsa kaydı iptal edip doğrusunu
            girin.
          </Notice>
        </EntityForm>
      )}
      {view && (
        <RepaymentHistory
          obligation={view}
          canReverse={authorization?.role === 'ADMIN'}
          onClose={() => setView(null)}
        />
      )}
    </>
  )
}
function RepaymentHistory({
  obligation,
  canReverse,
  onClose,
}: {
  obligation: Obligation
  canReverse: boolean
  onClose: () => void
}) {
  const refresh = useRefresh(),
    { notify } = useToast()
  async function reverse(p: Repayment) {
    if (
      !confirm(
        'Bu ödeme geri alınsın mı? Kalan borç artar, varsa nakit hareketi iptal edilir; kayıt silinmez.',
      )
    )
      return
    try {
      await reverseRepayment(obligation.id, p.id)
      await refresh()
      notify('Ödeme geri alındı.')
      onClose()
    } catch (e) {
      notify(friendlyError(e), 'error')
    }
  }
  const data = useQuery({
    queryKey: ['entities', 'repayments', obligation.id],
    queryFn: async () => {
      const result = await getDocs(
        query(root('repayments'), where('obligationId', '==', obligation.id)),
      )
      return result.docs.map((s) => ({ ...s.data(), id: s.id }) as Repayment)
    },
  })
  return (
    <Modal title={obligation.title + ' · ödeme geçmişi'} onClose={onClose}>
      <p>
        {obligation.counterparty} · {obligation.terms || 'Ödeme koşulu belirtilmedi.'}
      </p>
      <ErrorNotice error={data.error} />
      {data.isPending ? (
        <Loading />
      ) : !data.data?.length ? (
        <Empty title="Henüz ödeme kaydedilmedi." />
      ) : (
        <div className="payment-list">
          {data.data
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((p) => (
              <div key={p.id}>
                <strong>
                  {number(p.quantityMicros / 1e6)} {obligation.unit}
                </strong>
                <span>
                  {p.settlementAsset === 'gold'
                    ? 'Ayni altın teslimi'
                    : money(p.amountMinor, p.currency)}{' '}
                  · {dateLabel(p.date)}
                </span>
                <small>{p.agreement || p.notes}</small>
                {p.deleted ? (
                  <Badge>Geri alındı</Badge>
                ) : (
                  canReverse && (
                    <Button variant="ghost" onClick={() => void reverse(p)}>
                      Geri al
                    </Button>
                  )
                )}
              </div>
            ))}
        </div>
      )}
    </Modal>
  )
}
