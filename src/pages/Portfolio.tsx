import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Blocks, Pencil, Plus } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useReference, useReport } from '../lib/data'
import type { Application } from '../lib/models'
import { saveEntity } from '../lib/repository'
import { chartMonths, money, number, profitability } from '../lib/finance'
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Loading,
  PageHeading,
  Panel,
  PeriodFilter,
  Stat,
  Truncated,
  usePeriod,
} from '../components/ui'
import { EntityForm } from '../components/EntityForm'
import { CompareChart, ProfitChart } from '../components/Charts'
import { TransactionTable } from '../components/TransactionTable'
const labels: Record<string, string> = {
  development: 'Geliştirme',
  testing: 'Test',
  live: 'Yayında',
  paused: 'Duraklatıldı',
  archived: 'Arşivlendi',
}
export default function Portfolio() {
  const { id } = useParams(),
    { authorization } = useAuth(),
    ref = useReference(),
    period = usePeriod(),
    report = useReport(period.range.start, period.range.end),
    [form, setForm] = useState<Application | 'new' | null>(null)
  const selected = ref.apps.find((a) => a.id === id),
    rows = report.data?.rows || [],
    stats = selected ? profitability(selected, rows) : null
  if (ref.error || report.error)
    return (
      <>
        <PageHeading
          title="Uygulamalar"
          description="Veriler alınamadığı için finansal toplamlar gösterilmiyor."
        />
        <PeriodFilter state={period} />
        <ErrorNotice error={ref.error || report.error} />
      </>
    )
  return (
    <>
      {id && (
        <Link className="text-link back-link" to="/applications">
          <ArrowLeft size={15} /> Uygulamalara dön
        </Link>
      )}
      <PageHeading
        title={selected?.name || 'Uygulamalar'}
        description={
          selected
            ? 'Uygulamanızın gelir, doğrudan gider ve paylaşılan maliyetlerini inceleyin.'
            : 'Her uygulamanın hikâyesini, rakamlarıyla birlikte görün.'
        }
        actions={
          authorization?.role === 'ADMIN' && (
            <Button onClick={() => setForm(selected || 'new')}>
              <Plus size={17} />
              {selected ? 'Uygulamayı düzenle' : 'Uygulama ekle'}
            </Button>
          )
        }
      />
      <PeriodFilter state={period} />
      <ErrorNotice error={ref.error || report.error} />
      <Truncated show={ref.truncated || report.data?.more} />
      {ref.loading || report.isPending ? (
        <Loading />
      ) : id && !selected ? (
        <Empty title="Uygulama bulunamadı." />
      ) : selected && stats ? (
        <>
          <div className="stats-grid">
            <Stat
              label="Gelir"
              value={money(stats.income)}
              detail="Tahakkuk eden gelir"
              icon={<ArrowUpRight size={17} />}
            />
            <Stat
              label="Doğrudan gider"
              value={money(stats.expense)}
              detail="Uygulamaya bağlı işlemler"
              icon={<ArrowUpRight size={17} />}
            />
            <Stat
              label="Paylaşılan gider"
              value={money(stats.shared)}
              detail="Tanımlanmış dağılımdaki pay"
              icon={<Blocks size={17} />}
            />
            <Stat
              label="Net kâr"
              value={money(stats.profit)}
              detail={
                stats.margin === null ? 'Marj hesaplanamıyor' : `Marj %${number(stats.margin)}`
              }
              icon={<ArrowUpRight size={17} />}
              tone="highlight"
            />
          </div>
          <div className="secondary-stats">
            <div>
              Doğrudan katkı<strong>{money(stats.directContribution)}</strong>
            </div>
            <div>
              Doğrudan reklam<strong>{money(stats.advertising)}</strong>
            </div>
            <div>
              Doğrudan AI / API<strong>{money(stats.ai)}</strong>
            </div>
            <div>
              Altyapı
              <strong>
                {money(
                  rows
                    .filter(
                      (r) =>
                        r.applicationId === id &&
                        r.kind === 'expense' &&
                        r.group === 'infrastructure' &&
                        r.status !== 'cancelled',
                    )
                    .reduce((s, r) => s + r.tryMinor, 0),
                )}
              </strong>
            </div>
          </div>
          <div className="dashboard-grid equal">
            <Panel title="Doğrudan gelir / gider">
              <CompareChart data={chartMonths(rows.filter((r) => r.applicationId === id))} />
            </Panel>
            <Panel title="Doğrudan katkı trendi">
              <ProfitChart data={chartMonths(rows.filter((r) => r.applicationId === id))} />
            </Panel>
          </div>
          <Panel title="İlgili işlemler">
            <TransactionTable
              rows={rows.filter(
                (r) => r.applicationId === id || r.allocations.some((a) => a.applicationId === id),
              )}
              apps={ref.apps}
              categories={ref.categories}
            />
          </Panel>
        </>
      ) : !ref.apps.length ? (
        <Panel>
          <Empty
            title="Portföyünüzü oluşturun."
            description="Uygulamalarınızı ekleyin; gelirleri, reklam maliyetlerini ve gerçek kârlılığı izleyin."
          />
        </Panel>
      ) : (
        <div className="portfolio-grid">
          {ref.apps.map((a, i) => {
            const s = profitability(a, rows)
            return (
              <Panel key={a.id}>
                <div className="portfolio-top">
                  <span className={'app-icon large app-color-' + (i % 5)}>
                    {a.name.slice(0, 1)}
                  </span>
                  <Badge tone={a.status === 'live' ? 'green' : 'neutral'}>{labels[a.status]}</Badge>
                  {authorization?.role === 'ADMIN' && (
                    <Button
                      variant="ghost"
                      aria-label={a.name + ' düzenle'}
                      onClick={() => setForm(a)}
                    >
                      <Pencil size={15} />
                    </Button>
                  )}
                </div>
                <Link className="portfolio-title" to={'/applications/' + a.id}>
                  <h2>{a.name}</h2>
                  <ArrowUpRight size={18} />
                </Link>
                <p>
                  {a.platform} · {a.bundleId || 'Bundle ID eklenmedi'}
                </p>
                <div className="portfolio-numbers">
                  <span>
                    Gelir<strong>{money(s.income)}</strong>
                  </span>
                  <span>
                    Net kâr<strong>{money(s.profit)}</strong>
                  </span>
                </div>
                <div className="portfolio-margin">
                  Doğrudan katkı {money(s.directContribution)}
                  <span>{s.margin === null ? '—' : `%${number(s.margin)} marj`}</span>
                </div>
              </Panel>
            )
          })}
        </div>
      )}
      {form && (
        <EntityForm
          title={form === 'new' ? 'Yeni uygulama' : 'Uygulamayı düzenle'}
          onClose={() => setForm(null)}
          initial={
            form === 'new'
              ? {}
              : Object.fromEntries(Object.entries(form).filter(([, v]) => typeof v === 'string'))
          }
          fields={[
            {
              name: 'name',
              label: 'Uygulama adı',
              required: true,
              full: true,
              example: 'NexaRoom',
            },
            {
              name: 'platform',
              label: 'Platform',
              options: ['iOS', 'Android', 'Both'].map((v) => ({
                value: v,
                label: v === 'Both' ? 'iOS ve Android' : v,
              })),
            },
            {
              name: 'status',
              label: 'Durum',
              options: Object.entries(labels).map(([value, label]) => ({ value, label })),
            },
            {
              name: 'bundleId',
              label: 'Bundle identifier',
              example: 'com.velonapps.nexaroom',
              help: 'Xcode’daki uygulama kimliği. İsteğe bağlı.',
            },
            {
              name: 'url',
              label: 'App Store / Play Store URL',
              type: 'url',
              example: 'https://apps.apple.com/app/id123456789',
            },
            { name: 'launchDate', label: 'Yayın tarihi', type: 'date' },
            {
              name: 'icon',
              label: 'İkon referansı',
              example: '🛋️',
              help: 'Kartta görünecek kısa bir emoji veya harf. Görsel yüklenmez.',
            },
            { name: 'description', label: 'Açıklama', type: 'textarea', full: true },
          ]}
          onSave={(v) => saveEntity('applications', v, form === 'new' ? undefined : form.id)}
        />
      )}
    </>
  )
}
