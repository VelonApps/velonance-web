import { useState } from 'react'
import { BarChart3, Download, Plus } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useBalances, useEntities, useObligations, useReference, useReport } from '../lib/data'
import { groupLabels } from '../lib/models'
import type { Campaign } from '../lib/models'
import {
  adMetrics,
  breakdown,
  changePercent,
  chartMonths,
  d,
  dateLabel,
  debtSummary,
  fromMinor,
  latestRates,
  money,
  number,
  previousRange,
  profitability,
  rateKey,
  remaining,
  today,
  totals,
  toMinor,
  valuation,
  valueQuantity,
} from '../lib/finance'
import { saveEntity } from '../lib/repository'
import { exportCSV, exportTable } from '../lib/backup'
import { EntityForm } from '../components/EntityForm'
import { CompareChart, ProfitChart } from '../components/Charts'
import {
  Badge,
  Button,
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
type BreakdownRow = ReturnType<typeof breakdown>[number]
function BreakdownTable({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <Panel title={title}>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Kalem</th>
              <th className="align-right">Tutar</th>
              <th className="align-right">Pay</th>
              <th className="align-right">Adet</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="align-right">{money(r.amount)}</td>
                <td className="align-right">%{number(r.share)}</td>
                <td className="align-right">{r.count}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4}>Bu dönemde kayıt yok.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
const changeText = (current: number, previous: number, fallback: string) => {
  const change = changePercent(current, previous)
  return change === null
    ? fallback
    : `Önceki döneme göre %${change > 0 ? '+' : ''}${number(change)}`
}
export default function Reports() {
  const { authorization } = useAuth(),
    ref = useReference(),
    period = usePeriod(),
    report = useReport(period.range.start, period.range.end),
    previous = previousRange(period.range),
    previousReport = useReport(previous.start, previous.end),
    obligations = useObligations(),
    balances = useBalances(ref.accounts),
    campaigns = useEntities<Campaign>('advertisingCampaigns'),
    [form, setForm] = useState<Campaign | 'new' | null>(null)
  const rows = report.data?.rows || [],
    stats = totals(rows),
    before = totals(previousReport.data?.rows || []),
    categoryName = (id: string) => ref.categories.find((c) => c.id === id)?.name || 'Kategorisiz',
    byGroup = breakdown(rows, 'expense', (r) => groupLabels[r.group]),
    byCategory = breakdown(rows, 'expense', (r) => categoryName(r.categoryId)),
    byVendor = breakdown(rows, 'expense', (r) => r.vendor.trim() || 'Belirtilmedi'),
    incomeByCategory = breakdown(rows, 'income', (r) => categoryName(r.categoryId)),
    rates = latestRates(ref.rates),
    cash = valuation(balances.data || [], rates),
    debts = debtSummary(obligations.data?.rows || [], rates),
    openDebts = (obligations.data?.rows || [])
      .filter((o) => remaining(o) > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    missingRates = [
      ...new Set([...cash.missing, ...debts.payable.missing, ...debts.receivable.missing]),
    ],
    monthly = chartMonths(rows),
    apps = ref.apps.map((a) => ({ app: a, ...profitability(a, rows) })),
    visibleCampaigns = (campaigns.data?.rows || []).filter(
      (c) => c.date >= period.range.start && c.endDate <= period.range.end,
    )
  if (report.error || ref.error || campaigns.error)
    return (
      <>
        <PageHeading
          title="Raporlar"
          description="Veriler alınamadığı için finansal toplamlar gösterilmiyor."
        />
        <PeriodFilter state={period} />
        <ErrorNotice error={report.error || ref.error || campaigns.error} />
      </>
    )
  return (
    <>
      <PageHeading
        title="Raporlar"
        description="Aylık ve yıllık performansı, uygulama kârlılığını ve reklam verimliliğini inceleyin."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => exportCSV(rows, ref)}
              disabled={!rows.length}
            >
              <Download size={16} /> İşlemleri CSV indir
            </Button>
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() =>
                exportTable(
                  `velonance-rapor-${period.range.start}-${period.range.end}.csv`,
                  ['Bölüm', 'Kalem', 'Tutar (TRY)', 'Pay %', 'Adet'],
                  [
                    ['Özet', 'Gelir', fromMinor(stats.income), '', ''],
                    ['Özet', 'Gider', fromMinor(stats.expense), '', ''],
                    ['Özet', 'Net kâr', fromMinor(stats.profit), '', ''],
                    ...monthly.map((m) => ['Aylık net kâr', m.month, fromMinor(m.profit), '', '']),
                    ...apps.map((a) => [
                      'Uygulama net kâr',
                      a.app.name,
                      fromMinor(a.profit),
                      '',
                      '',
                    ]),
                    ...(
                      [
                        ['Gider grubu', byGroup],
                        ['Gider kategorisi', byCategory],
                        ['Tedarikçi', byVendor],
                        ['Gelir kategorisi', incomeByCategory],
                      ] as [string, BreakdownRow[]][]
                    ).flatMap(([section, list]) =>
                      list.map((r) => [section, r.label, fromMinor(r.amount), r.share, r.count]),
                    ),
                  ],
                )
              }
            >
              <Download size={16} /> Rapor özetini CSV indir
            </Button>
            <Button onClick={() => window.print()}>
              <Download size={16} /> Yazdır / PDF
            </Button>
          </>
        }
      />
      <PeriodFilter state={period} />
      <ErrorNotice error={report.error || ref.error || campaigns.error} />
      <Truncated show={report.data?.more || ref.truncated || campaigns.data?.truncated} />
      {report.isPending || ref.loading || campaigns.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="stats-grid">
            <Stat
              label="Dönem geliri"
              value={money(stats.income)}
              detail={changeText(stats.income, before.income, 'Tahakkuk esaslı')}
              icon={<BarChart3 size={18} />}
            />
            <Stat
              label="Dönem gideri"
              value={money(stats.expense)}
              detail={changeText(stats.expense, before.expense, 'Anapara hareketleri hariç')}
              icon={<BarChart3 size={18} />}
            />
            <Stat
              label="Net kâr"
              value={money(stats.profit)}
              detail={stats.margin === null ? 'Gelir yok' : `%${number(stats.margin)} kâr marjı`}
              icon={<BarChart3 size={18} />}
              tone="highlight"
            />
            <Stat
              label="Reklam + AI"
              value={money(stats.advertising + stats.ai)}
              detail="Doğrudan kayıt grupları"
              icon={<BarChart3 size={18} />}
            />
          </div>
          <Panel
            title="Finansal durum"
            description="Bugünkü görünüm; dönem filtresinden etkilenmez. Son girilen döviz ve altın fiyatlarıyla TRY'ye çevrilir."
          >
            <dl className="settings-list">
              <div>
                <dt>Hesaplardaki nakit</dt>
                <dd>{money(cash.amount)}</dd>
              </div>
              <div>
                <dt>Açık alacaklar ({debts.receivable.count})</dt>
                <dd>{money(debts.receivable.current)}</dd>
              </div>
              <div>
                <dt>Açık borçlar ({debts.payable.count})</dt>
                <dd>{money(debts.payable.current)}</dd>
              </div>
              <div>
                <dt>Net pozisyon</dt>
                <dd>
                  <strong>
                    {money(
                      d(cash.amount)
                        .plus(debts.receivable.current)
                        .minus(debts.payable.current)
                        .toNumber(),
                    )}
                  </strong>
                </dd>
              </div>
              <div>
                <dt>Vadesi geçen</dt>
                <dd>
                  {debts.payable.overdue} borç · {debts.receivable.overdue} alacak
                </dd>
              </div>
            </dl>
            {missingRates.length > 0 && (
              <Notice>
                Fiyatı girilmediği için toplama katılmayan birimler: {missingRates.join(', ')}.
                Ayarlar → Döviz ve altın ekranından ekleyin.
              </Notice>
            )}
          </Panel>
          <div className="dashboard-grid equal">
            <Panel title="Aylık gelir / gider">
              <CompareChart data={monthly} />
            </Panel>
            <Panel title="Aylık net kâr">
              <ProfitChart data={monthly} />
            </Panel>
          </div>
          <Panel title="Aylık sonuçlar">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ay</th>
                    <th>Gelir</th>
                    <th>Gider</th>
                    <th>Net kâr</th>
                    <th>Marj</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m) => (
                    <tr key={m.month}>
                      <td>{m.month}</td>
                      <td>{money(m.income)}</td>
                      <td>{money(m.expense)}</td>
                      <td>{money(m.profit)}</td>
                      <td>{m.margin === null ? '—' : `%${number(m.margin)}`}</td>
                    </tr>
                  ))}
                  {!monthly.length && (
                    <tr>
                      <td colSpan={5}>Bu dönemde finansal kayıt yok.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="dashboard-grid equal">
            <BreakdownTable title="Gider grupları" rows={byGroup} />
            <BreakdownTable title="Gider kategorileri" rows={byCategory} />
            <BreakdownTable title="Tedarikçiler" rows={byVendor} />
            <BreakdownTable title="Gelir kategorileri" rows={incomeByCategory} />
          </div>
          <Panel title="Açık borç ve alacaklar" description="Vadesi en yakın olan önce gelir.">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Kayıt</th>
                    <th>Yön</th>
                    <th>Kalan</th>
                    <th>Güncel TRY</th>
                    <th>İlk kurla TRY</th>
                    <th>Vade</th>
                  </tr>
                </thead>
                <tbody>
                  {openDebts.map((o) => {
                    const left = remaining(o),
                      price = rates.get(rateKey(o.unit, o.asset))
                    return (
                      <tr key={o.id}>
                        <td>
                          <strong>{o.title}</strong>
                          <small>{o.counterparty}</small>
                        </td>
                        <td>{o.direction === 'payable' ? 'Borç' : 'Alacak'}</td>
                        <td>
                          {number(left / 1e6)} {o.unit}
                        </td>
                        <td>{price ? money(valueQuantity(left, price)) : 'Fiyat yok'}</td>
                        <td>{money(valueQuantity(left, o.originalRateMicros))}</td>
                        <td>
                          {dateLabel(o.dueDate)}{' '}
                          {o.dueDate < today() && <Badge tone="red">Geçti</Badge>}
                        </td>
                      </tr>
                    )
                  })}
                  {!openDebts.length && (
                    <tr>
                      <td colSpan={6}>Açık borç veya alacak yok.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel
            title="Uygulama karşılaştırması"
            description="Şirket genelindeki dağıtılmamış giderler uygulamalara otomatik yüklenmez."
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Uygulama</th>
                    <th>Gelir</th>
                    <th>Doğrudan gider</th>
                    <th>Katkı</th>
                    <th>Paylaşılan gider</th>
                    <th>Net kâr</th>
                    <th>Marj</th>
                    <th>Doğrudan reklam</th>
                  </tr>
                </thead>
                <tbody>
                  {apps
                    .sort((a, b) => b.profit - a.profit)
                    .map((a) => (
                      <tr key={a.app.id}>
                        <td>{a.app.name}</td>
                        <td>{money(a.income)}</td>
                        <td>{money(a.expense)}</td>
                        <td>{money(a.directContribution)}</td>
                        <td>{money(a.shared)}</td>
                        <td>{money(a.profit)}</td>
                        <td>{a.margin === null ? '—' : `%${number(a.margin)}`}</td>
                        <td>{money(a.advertising)}</td>
                      </tr>
                    ))}
                  {!apps.length && (
                    <tr>
                      <td colSpan={8}>Önce uygulama portföyünüzü ekleyin.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel
            title="Reklam verimliliği"
            description="Yalnızca elle girilen ve kaynağı belirtilen ilişkilendirme verileri."
            action={
              authorization?.role === 'ADMIN' && (
                <Button variant="secondary" onClick={() => setForm('new')}>
                  <Plus size={15} /> Kampanya ekle
                </Button>
              )
            }
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Kampanya / kaynak</th>
                    <th>Dönem</th>
                    <th>Harcama</th>
                    <th>CPI</th>
                    <th>CPC</th>
                    <th>CTR</th>
                    <th>ROAS</th>
                    {authorization?.role === 'ADMIN' && <th />}
                  </tr>
                </thead>
                <tbody>
                  {visibleCampaigns.map((c) => {
                    const m = adMetrics(c)
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                          <small>
                            {c.platform} · {c.source}
                          </small>
                        </td>
                        <td>
                          {dateLabel(c.date)}
                          <small>{dateLabel(c.endDate)}</small>
                        </td>
                        <td>{money(c.spendMinor, c.currency)}</td>
                        <td>{m.cpi === null ? '—' : money(m.cpi, c.currency)}</td>
                        <td>{m.cpc === null ? '—' : money(m.cpc, c.currency)}</td>
                        <td>{m.ctr === null ? '—' : `%${number(m.ctr)}`}</td>
                        <td>{m.roas === null ? '—' : `${number(m.roas)}×`}</td>
                        {authorization?.role === 'ADMIN' && (
                          <td>
                            <Button variant="ghost" onClick={() => setForm(c)}>
                              Düzenle
                            </Button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                  {!visibleCampaigns.length && (
                    <tr>
                      <td colSpan={8}>Seçili aralığın tamamına sığan kampanya verisi yok.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          <Notice>
            Kampanya harcaması analiz metadatasıdır; ayrıca gider defterine kaydedilmelidir. ROAS,
            yalnızca belirtilen kaynak ve dönemin ilişkilendirilmiş gelirini kullanır. Uygulamanın
            toplam geliriyle reklam ilişkilendirmesi yapılmaz. Borç değişimleri ve gerçek nakit
            akışı için ayrı modülleri kullanın.
          </Notice>
        </>
      )}
      {form && (
        <EntityForm
          title={form === 'new' ? 'Reklam kampanyası' : 'Kampanyayı düzenle'}
          onClose={() => setForm(null)}
          initial={
            form === 'new'
              ? {}
              : {
                  ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v)])),
                  spend: fromMinor(form.spendMinor, form.currency),
                  revenue: fromMinor(form.attributedRevenueMinor, form.currency),
                }
          }
          fields={[
            { name: 'name', label: 'Kampanya adı', required: true },
            { name: 'platform', label: 'Platform', required: true },
            {
              name: 'applicationId',
              label: 'Uygulama',
              options: [
                { value: '', label: 'Seçilmedi' },
                ...ref.apps.map((a) => ({ value: a.id, label: a.name })),
              ],
            },
            { name: 'currency', label: 'Para birimi', required: true, defaultValue: 'TRY' },
            { name: 'spend', label: 'Harcama', required: true },
            {
              name: 'revenue',
              label: 'İlişkilendirilmiş gelir',
              required: true,
              defaultValue: '0',
            },
            { name: 'impressions', label: 'Gösterim', defaultValue: '0', required: true },
            { name: 'clicks', label: 'Tıklama', defaultValue: '0', required: true },
            { name: 'installs', label: 'Yükleme', defaultValue: '0', required: true },
            {
              name: 'source',
              label: 'İlişkilendirme kaynağı',
              required: true,
              full: true,
              help: 'Örn. Apple Ads raporu; kampanya / kohort tanımı.',
            },
            { name: 'date', label: 'Dönem başlangıcı', type: 'date', required: true },
            { name: 'endDate', label: 'Dönem sonu', type: 'date', required: true },
          ]}
          onSave={(v) => {
            if (v.endDate < v.date) throw new Error('Bitiş başlangıçtan önce olamaz.')
            return saveEntity(
              'advertisingCampaigns',
              {
                name: v.name,
                platform: v.platform,
                applicationId: v.applicationId,
                currency: v.currency.toUpperCase(),
                spendMinor: toMinor(v.spend, v.currency.toUpperCase()),
                attributedRevenueMinor: toMinor(v.revenue, v.currency.toUpperCase()),
                impressions: Number(v.impressions),
                clicks: Number(v.clicks),
                installs: Number(v.installs),
                source: v.source,
                date: v.date,
                endDate: v.endDate,
              },
              form === 'new' ? undefined : form.id,
            )
          }}
        />
      )}
    </>
  )
}
