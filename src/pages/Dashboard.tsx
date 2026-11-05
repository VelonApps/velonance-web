import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Blocks,
  ChartNoAxesCombined,
  Coins,
  Download,
  Plus,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  useBalances,
  useObligations,
  useRecurring,
  useReference,
  useReport,
  useRates,
} from '../lib/data'
import {
  chartMonths,
  dateLabel,
  rateKey,
  money,
  number,
  profitability,
  remaining,
  sum,
  totals,
  valuation,
  valueQuantity,
} from '../lib/finance'
import {
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
import { CompareChart, DistributionChart, AppChart, ProfitChart } from '../components/Charts'
import { TransactionTable } from '../components/TransactionTable'
import TransactionForm from '../components/TransactionForm'
export default function Dashboard() {
  const { authorization, user } = useAuth(),
    period = usePeriod(),
    ref = useReference(),
    report = useReport(period.range.start, period.range.end),
    debts = useObligations(),
    recurring = useRecurring(),
    balance = useBalances(ref.accounts),
    [form, setForm] = useState<'income' | 'expense' | null>(null)
  const rows = report.data?.rows || [],
    stats = totals(rows),
    liveRates = useRates(),
    rates = liveRates.rates,
    cash = valuation(balance.data || [], rates),
    obligations = debts.data?.rows || [],
    payable = obligations.filter((o) => o.direction === 'payable'),
    receivable = obligations.filter((o) => o.direction === 'receivable')
  const debtValue = (list: typeof obligations) =>
      sum(
        list
          .filter((o) => rates.has(rateKey(o.unit, o.asset)))
          .map((o) => valueQuantity(remaining(o), rates.get(rateKey(o.unit, o.asset))!)),
      ),
    missing = obligations.filter((o) => remaining(o) > 0 && !rates.has(rateKey(o.unit, o.asset)))
  const expenseGroups = new Map<string, number>()
  rows
    .filter((r) => r.kind === 'expense' && r.status !== 'cancelled')
    .forEach((r) => {
      const name = ref.categories.find((c) => c.id === r.categoryId)?.name || 'Diğer'
      expenseGroups.set(name, sum([expenseGroups.get(name) || 0, r.tryMinor]))
    })
  if (ref.error || report.error || balance.error || debts.error || recurring.error)
    return (
      <>
        <PageHeading
          title="Genel bakış"
          description="Veriler alınamadığı için finansal toplamlar gösterilmiyor."
        />
        <PeriodFilter state={period} />
        <ErrorNotice
          error={ref.error || report.error || balance.error || debts.error || recurring.error}
        />
      </>
    )
  return (
    <>
      <PageHeading
        eyebrow="FİNANSAL KONTROL MERKEZİNİZ"
        title="Büyük resmi görün."
        description={`Merhaba ${user?.displayName?.split(' ')[0] || 'stüdyo'}. İşte stüdyonuzun finansal görünümü.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Download size={15} /> Rapor al
            </Button>
            {authorization?.role === 'ADMIN' && (
              <Button onClick={() => setForm('income')}>
                <Plus size={17} /> İşlem ekle
              </Button>
            )}
          </>
        }
      />
      <div className="overview-banner">
        <div>
          <span className="banner-dot" /> STÜDYONUZ, TEK BİR YERDE
        </div>
        <p>Bir sonraki büyük fikriniz için, rakamlarınız net olsun.</p>
        <span className="banner-symbol">↗</span>
      </div>
      <div className="section-toolbar">
        <h2>
          Finansal özet <span className="tiny-badge">TRY</span>
        </h2>
        <PeriodFilter state={period} />
      </div>
      <ErrorNotice
        error={ref.error || report.error || balance.error || debts.error || recurring.error}
      />
      <Truncated
        show={
          report.data?.more || ref.truncated || debts.data?.truncated || recurring.data?.truncated
        }
      />
      {ref.loading ||
      report.isPending ||
      debts.isPending ||
      recurring.isPending ||
      (ref.accounts.length > 0 && balance.isPending) ? (
        <Loading />
      ) : (
        <>
          <div className="stats-grid">
            <Stat
              label="Toplam gelir"
              value={money(stats.income)}
              detail="Dönem içinde tahakkuk eden"
              icon={<ArrowDownLeft size={18} />}
            />
            <Stat
              label="Toplam gider"
              value={money(stats.expense)}
              detail="Dönem içinde tahakkuk eden"
              icon={<ArrowUpRight size={18} />}
            />
            <Stat
              label="Net kâr"
              value={money(stats.profit)}
              detail={
                stats.margin === null
                  ? 'Kâr marjı: gelir bulunmuyor'
                  : `Kâr marjı %${number(stats.margin)}`
              }
              icon={<ChartNoAxesCombined size={18} />}
              tone="highlight"
            />
            <Stat
              label="Kullanılabilir nakit"
              value={
                balance.isPending && ref.accounts.length ? 'Hesaplanıyor…' : money(cash.amount)
              }
              detail="Güncel manuel kurlarla değerleme"
              icon={<Wallet size={18} />}
            />
          </div>
          {(cash.missing.length > 0 || missing.length > 0) && (
            <Notice>
              Kur eksik: {[...new Set([...cash.missing, ...missing.map((o) => o.unit)])].join(', ')}
              . Bu varlıklar güncel toplamların dışında; Ayarlar’dan fiyat ekleyin.
            </Notice>
          )}
          <div className="secondary-stats">
            <div>
              <span className="mini-icon">
                <Banknote size={17} />
              </span>
              <span>
                Ödenmemiş borç<strong>{money(debtValue(payable))}</strong>
              </span>
            </div>
            <div>
              <span className="mini-icon">
                <Coins size={17} />
              </span>
              <span>
                Bekleyen alacak<strong>{money(debtValue(receivable))}</strong>
              </span>
            </div>
            <div>
              <span className="mini-icon">
                <ArrowUpRight size={17} />
              </span>
              <span>
                Reklam harcamaları<strong>{money(stats.advertising)}</strong>
              </span>
            </div>
            <div>
              <span className="mini-icon">
                <Sparkles size={17} />
              </span>
              <span>
                AI ve API giderleri<strong>{money(stats.ai)}</strong>
              </span>
            </div>
          </div>
          <div className="dashboard-grid">
            <Panel
              title="Gelir ve gider"
              description="Tahakkuk esasına göre aylık karşılaştırma"
              action={
                <div className="legend">
                  <span>
                    <i /> Gelir
                  </span>
                  <span>
                    <i /> Gider
                  </span>
                </div>
              }
            >
              <CompareChart data={chartMonths(rows)} />
            </Panel>
            <Panel title="Gider dağılımı" description="Her harcamanın yerini bilin.">
              <DistributionChart
                data={[...expenseGroups].map(([name, value]) => ({ name, value }))}
              />
            </Panel>
          </div>
          <div className="dashboard-grid equal">
            <Panel
              title="Uygulamalarınız"
              description="Portföyünüzün dönem performansı"
              action={
                <Link className="text-link" to="/applications">
                  Tümünü gör <ArrowRight size={14} />
                </Link>
              }
            >
              {!ref.apps.length ? (
                <div className="portfolio-empty">
                  <span className="empty-icon">
                    <Blocks size={23} />
                  </span>
                  <h3>Büyük fikirler burada büyür.</h3>
                  <p>Uygulamalarınızı ekleyin, finansal performanslarını izleyin.</p>
                  <Link className="text-link" to="/applications">
                    Portföyü oluştur <ArrowRight size={15} />
                  </Link>
                </div>
              ) : (
                <div className="app-mini-list">
                  {ref.apps
                    .filter((a) => a.status !== 'archived')
                    .slice(0, 5)
                    .map((a, i) => {
                      const result = profitability(a, rows)
                      return (
                        <Link key={a.id} to={'/applications/' + a.id}>
                          <span className={'app-icon app-color-' + (i % 5)}>
                            {a.name.slice(0, 1)}
                          </span>
                          <div>
                            <strong>{a.name}</strong>
                            <small>{a.platform}</small>
                          </div>
                          <span>
                            {money(result.income)}
                            <small>Net: {money(result.profit)}</small>
                          </span>
                        </Link>
                      )
                    })}
                </div>
              )}
            </Panel>
            <Panel
              title="Yaklaşan ödemeler"
              description="Planlanmış yükümlülükler; henüz nakit hareketi değil."
              action={
                <Link className="text-link" to="/cash-flow">
                  Nakit akışı <ArrowRight size={14} />
                </Link>
              }
            >
              <div className="upcoming-list">
                {[
                  ...obligations
                    .filter((o) => remaining(o) > 0)
                    .map((o) => ({
                      id: o.id,
                      title: o.title,
                      date: o.dueDate,
                      label: `${number(remaining(o) / 1e6)} ${o.unit}`,
                      type: o.direction === 'payable' ? 'Borç' : 'Alacak',
                    })),
                  ...(recurring.data?.rows || [])
                    .filter((t) => t.status === 'active')
                    .map((t) => ({
                      id: t.id,
                      title: t.title,
                      date: t.nextDate,
                      label: money(t.amountMinor, t.currency),
                      type: 'Tekrarlayan',
                    })),
                ]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .slice(0, 5)
                  .map((o) => (
                    <div key={o.id}>
                      <span className="date-tile">
                        {o.date.slice(8)}
                        <small>{o.date.slice(5, 7)}</small>
                      </span>
                      <div>
                        <strong>{o.title}</strong>
                        <small>
                          {o.type} · {dateLabel(o.date)}
                        </small>
                      </div>
                      <strong>{o.label}</strong>
                    </div>
                  ))}
                {!obligations.some((o) => remaining(o) > 0) &&
                  !recurring.data?.rows.some((t) => t.status === 'active') && (
                    <div className="calm-state">
                      <span>✓</span>
                      <h3>Takviminiz şu an sakin.</h3>
                      <p>Yaklaşan borçlarınız ve tekrarlayan ödemeleriniz burada görünecek.</p>
                    </div>
                  )}
              </div>
            </Panel>
          </div>
          <Panel
            title="Son işlemler"
            description="Stüdyonuzdaki son finansal hareketler"
            action={
              <Link className="text-link" to="/history">
                Tüm işlemler <ArrowRight size={14} />
              </Link>
            }
          >
            <TransactionTable rows={rows.slice(0, 5)} apps={ref.apps} categories={ref.categories} />
          </Panel>
          {rows.length > 0 && (
            <div className="dashboard-grid equal">
              <Panel title="Net kâr trendi">
                <ProfitChart data={chartMonths(rows)} />
              </Panel>
              <Panel title="Uygulama gelirleri">
                <AppChart
                  data={ref.apps
                    .map((a) => ({ name: a.name, value: profitability(a, rows).income }))
                    .filter((a) => a.value > 0)}
                />
              </Panel>
            </div>
          )}
        </>
      )}
      {form && <TransactionForm kind={form} onClose={() => setForm(null)} />}
    </>
  )
}
