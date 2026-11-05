import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { expectedPayments, periodAccountBalances } from '../lib/repository'
import { ArrowDownLeft, ArrowUpRight, ChartNoAxesCombined, Wallet } from 'lucide-react'
import { format, startOfWeek, addDays } from 'date-fns'
import { useBalances, useObligations, useRecurring, useReference, useReport } from '../lib/data'
import {
  cashTotals,
  d,
  dateLabel,
  dueOccurrences,
  latestRates,
  rateKey,
  money,
  remaining,
  sum,
  today,
  valuation,
  valueQuantity,
  convert,
} from '../lib/finance'
import { FlowChart } from '../components/Charts'
import {
  Badge,
  ErrorNotice,
  Loading,
  Notice,
  PageHeading,
  Panel,
  PeriodFilter,
  Stat,
  Truncated,
  usePeriod,
} from '../components/ui'
export default function CashFlow() {
  const period = usePeriod(),
    ref = useReference(),
    cash = useReport(period.range.start, period.range.end, 'cashDate'),
    futureEnd = format(addDays(new Date(today() + 'T12:00:00'), 90), 'yyyy-MM-dd'),
    pending = useQuery({
      queryKey: ['forecast', futureEnd],
      queryFn: () => expectedPayments(futureEnd),
    }),
    debts = useObligations(),
    recurring = useRecurring(),
    balances = useBalances(ref.accounts),
    rates = latestRates(ref.rates),
    [group, setGroup] = useState('monthly')
  const periodBalances = useQuery({
    queryKey: [
      'period-balances',
      period.range.start,
      period.range.end,
      ref.accounts.map((a) => a.id),
    ],
    queryFn: () => periodAccountBalances(ref.accounts, period.range.start, period.range.end),
    enabled: !ref.loading,
  })
  const rows = cash.data?.rows || [],
    stats = cashTotals(rows),
    now = valuation(balances.data || [], rates)
  const groups = new Map<string, typeof rows>()
  rows.forEach((r) => {
    if (r.kind.startsWith('transfer')) return
    const label =
      group === 'monthly'
        ? r.cashDate.slice(0, 7)
        : group === 'weekly'
          ? format(
              startOfWeek(new Date(r.cashDate + 'T12:00:00'), { weekStartsOn: 1 }),
              'yyyy-MM-dd',
            )
          : r.cashDate
    groups.set(label, [...(groups.get(label) || []), r])
  })
  const chart = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, entries]) => ({ label, ...cashTotals(entries) }))
  const scheduled = [
      ...(pending.data || [])
        .filter((r) => r.status === 'pending' && r.expectedDate && r.expectedDate <= futureEnd)
        .map((r) => ({
          id: r.id,
          date: r.expectedDate,
          title: r.title,
          label: 'Bekleyen işlem',
          incoming: r.kind === 'income' ? r.tryMinor : 0,
          outgoing: r.kind === 'expense' ? r.tryMinor : 0,
          known: true,
        })),
      ...(debts.data?.rows || [])
        .filter((o) => remaining(o) > 0 && o.dueDate <= futureEnd)
        .map((o) => ({
          id: o.id,
          date: o.dueDate,
          title: o.title,
          label: 'Anapara tahmini',
          incoming:
            o.direction === 'receivable' && rates.has(rateKey(o.unit, o.asset))
              ? valueQuantity(remaining(o), rates.get(rateKey(o.unit, o.asset))!)
              : 0,
          outgoing:
            o.direction === 'payable' && rates.has(rateKey(o.unit, o.asset))
              ? valueQuantity(remaining(o), rates.get(rateKey(o.unit, o.asset))!)
              : 0,
          known: rates.has(rateKey(o.unit, o.asset)),
        })),
      ...(recurring.data?.rows || []).flatMap((t) =>
        dueOccurrences(t, futureEnd).map((date) => ({
          id: t.id + date,
          date,
          title: t.title,
          label: 'Tekrarlayan plan',
          incoming: 0,
          outgoing: convert(t.amountMinor, t.currency, rates.get(t.currency) || t.rateMicros),
          known: true,
        })),
      ),
    ].sort((a, b) => a.date.localeCompare(b.date)),
    forecast = d(now.amount)
      .plus(sum(scheduled.map((s) => s.incoming)))
      .minus(sum(scheduled.map((s) => s.outgoing)))
      .toNumber()
  if (
    cash.error ||
    periodBalances.error ||
    pending.error ||
    ref.error ||
    debts.error ||
    recurring.error ||
    balances.error
  )
    return (
      <>
        <PageHeading
          title="Nakit akışı"
          description="Veriler alınamadığı için finansal toplamlar gösterilmiyor."
        />
        <PeriodFilter state={period} />
        <ErrorNotice
          error={
            cash.error ||
            periodBalances.error ||
            pending.error ||
            ref.error ||
            debts.error ||
            recurring.error ||
            balances.error
          }
        />
      </>
    )
  return (
    <>
      <PageHeading
        title="Nakit akışı"
        description="Kârlılığın yanında, paranın gerçekten ne zaman hareket ettiğini görün."
      />
      <PeriodFilter state={period} />
      <ErrorNotice
        error={
          cash.error ||
          periodBalances.error ||
          pending.error ||
          ref.error ||
          debts.error ||
          recurring.error ||
          balances.error
        }
      />
      <Truncated
        show={
          cash.data?.more || ref.truncated || debts.data?.truncated || recurring.data?.truncated
        }
      />
      {cash.isPending ||
      ref.loading ||
      pending.isPending ||
      debts.isPending ||
      recurring.isPending ||
      periodBalances.isPending ||
      (ref.accounts.length > 0 && balances.isPending) ? (
        <Loading />
      ) : (
        <>
          <div className="stats-grid">
            <Stat
              label="Gerçek nakit girişi"
              value={money(stats.incoming)}
              detail="Anapara dahil, iç transfer hariç"
              icon={<ArrowDownLeft size={18} />}
            />
            <Stat
              label="Gerçek nakit çıkışı"
              value={money(stats.outgoing)}
              detail="Anapara dahil, iç transfer hariç"
              icon={<ArrowUpRight size={18} />}
            />
            <Stat
              label="Net nakit akışı"
              value={money(stats.net)}
              detail="Tarihsel işlem kurlarıyla"
              icon={<ChartNoAxesCombined size={18} />}
              tone="highlight"
            />
            <Stat
              label="Bugünkü nakit değeri"
              value={money(now.amount)}
              detail="Güncel manuel kurlarla"
              icon={<Wallet size={18} />}
            />
          </div>
          <Panel
            title="Dönem açılış ve kapanış bakiyeleri"
            description="Her hesabın kendi para biriminde; kur değerlemeleri karıştırılmaz."
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Hesap</th>
                    <th>Para birimi</th>
                    <th>Açılış bakiyesi</th>
                    <th>Kapanış bakiyesi</th>
                  </tr>
                </thead>
                <tbody>
                  {periodBalances.data?.map((a) => (
                    <tr key={a.accountId}>
                      <td>{a.name}</td>
                      <td>{a.currency}</td>
                      <td>{money(a.opening, a.currency)}</td>
                      <td>{money(a.closing, a.currency)}</td>
                    </tr>
                  ))}
                  {!ref.accounts.length && (
                    <tr>
                      <td colSpan={4}>Henüz hesap eklenmedi.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          {now.missing.length > 0 && (
            <Notice>
              Güncel TRY toplamında kur bulunmayan hesaplar hariç: {now.missing.join(', ')}.
            </Notice>
          )}
          <Panel
            title="Gerçekleşen nakit hareketleri"
            action={
              <select
                aria-label="Nakit akışı gruplaması"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                <option value="daily">Günlük</option>
                <option value="weekly">Haftalık</option>
                <option value="monthly">Aylık</option>
              </select>
            }
          >
            <FlowChart data={chart} />
          </Panel>
          <div className="forecast-banner">
            <div>
              <Badge tone="amber">TAHMİN · 90 GÜN</Badge>
              <h2>Planlarınızın nakde yansıması</h2>
              <p>Mevcut bakiye + beklenen girişler − planlanan çıkışlar</p>
            </div>
            <strong>{money(forecast)}</strong>
          </div>
          <Notice>
            Tahmin garanti değildir. Gecikmiş açık kayıtlar da dahildir. Borç vadesinde kalan
            anaparanın tamamının ödeneceği varsayılır; altın nakde çevrilecek varsayılır. Aynı
            yükümlülüğü hem bekleyen işlem hem borç olarak girmeyin. Bilinmeyen altın/döviz
            fiyatları toplamdan çıkarılır. Geçmiş işlem kuru bekleyen ödemelerde yalnızca tahmin
            olarak kullanılır.
          </Notice>
          <Panel title="Beklenen ödemeler ve tahsilatlar">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Başlık</th>
                    <th>Kaynak</th>
                    <th>Giriş tahmini</th>
                    <th>Çıkış tahmini</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduled.map((s) => (
                    <tr key={s.id}>
                      <td>{dateLabel(s.date)}</td>
                      <td>{s.title}</td>
                      <td>
                        <Badge>{s.label}</Badge>
                      </td>
                      <td>{s.known ? money(s.incoming) : 'Kur eksik'}</td>
                      <td>{s.known ? money(s.outgoing) : 'Kur eksik'}</td>
                    </tr>
                  ))}
                  {!scheduled.length && (
                    <tr>
                      <td colSpan={5}>Önümüzdeki 90 gün için planlanmış ödeme yok.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </>
  )
}
