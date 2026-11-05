import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Download, Plus, Search } from 'lucide-react'
import { useAuth, friendlyError } from '../lib/auth'
import { useReference, useRefresh } from '../lib/data'
import { cancelLinkedTransaction, cancelTransaction, listTransactions } from '../lib/repository'
import { fromMinor, money, sum, toMinor } from '../lib/finance'
import type { Transaction } from '../lib/models'
import { exportCSV } from '../lib/backup'
import {
  Button,
  Empty,
  ErrorNotice,
  Loading,
  Notice,
  PageHeading,
  Panel,
  PeriodFilter,
  usePeriod,
  useToast,
} from '../components/ui'
import TransactionForm from '../components/TransactionForm'
import { kindLabels, TransactionTable } from '../components/TransactionTable'
export default function Transactions({ kind }: { kind?: 'income' | 'expense' }) {
  const { authorization } = useAuth(),
    period = usePeriod(),
    ref = useReference(),
    refresh = useRefresh(),
    { notify } = useToast(),
    [form, setForm] = useState<{ kind: 'income' | 'expense'; row?: Transaction } | null>(null),
    [filters, setFilters] = useState({
      search: '',
      currency: '',
      app: '',
      category: '',
      kind: '',
      min: '',
      max: '',
    })
  const history = useInfiniteQuery({
    queryKey: ['history', period.range.start, period.range.end],
    initialPageParam: undefined as
      Awaited<ReturnType<typeof listTransactions>>['cursor'] | undefined,
    queryFn: ({ pageParam }) => listTransactions(period.range.start, period.range.end, pageParam),
    getNextPageParam: (page) => (page.more ? page.cursor : undefined),
  })
  const all = history.data?.pages.flatMap((p) => p.rows) || [],
    rows = all.filter(
      (r) =>
        (!kind || r.kind === kind) &&
        (!filters.search ||
          (r.title + ' ' + r.notes + ' ' + r.vendor)
            .toLocaleLowerCase('tr')
            .includes(filters.search.toLocaleLowerCase('tr'))) &&
        (!filters.currency || r.currency === filters.currency) &&
        (!filters.app || r.applicationId === filters.app) &&
        (!filters.category || r.categoryId === filters.category) &&
        (!filters.kind || r.kind === filters.kind) &&
        (!filters.min || r.tryMinor >= safeMinor(filters.min)) &&
        (!filters.max || r.tryMinor <= safeMinor(filters.max)),
    )
  const title = kind === 'income' ? 'Gelirler' : kind === 'expense' ? 'Giderler' : 'İşlem geçmişi'
  return (
    <>
      <PageHeading
        title={title}
        description={
          kind === 'income'
            ? 'Kazandığınız gelir ile tahsil ettiğiniz nakdi ayrı ayrı izleyin.'
            : kind === 'expense'
              ? 'Stüdyonuzun her harcamasını doğru yere bağlayın.'
              : 'Finansal hareketlerinizi arayın, filtreleyin ve inceleyin.'
        }
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() => exportCSV(rows, ref)}
            >
              <Download size={16} /> CSV indir
            </Button>
            {authorization?.role === 'ADMIN' && (
              <Button onClick={() => setForm({ kind: kind || 'income' })}>
                <Plus size={17} />
                {kind === 'expense' ? 'Gider ekle' : 'Gelir ekle'}
              </Button>
            )}
          </>
        }
      />
      <>
        <PeriodFilter state={period} />
        <div className="filter-bar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="İşlem ara"
              placeholder="Başlık, tedarikçi veya not ara…"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          <select
            aria-label="Para birimi filtresi"
            value={filters.currency}
            onChange={(e) => setFilters({ ...filters, currency: e.target.value })}
          >
            <option value="">Tüm para birimleri</option>
            {[...new Set(['TRY', 'USD', 'EUR', 'GBP', ...all.map((r) => r.currency)])].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            aria-label="Uygulama filtresi"
            value={filters.app}
            onChange={(e) => setFilters({ ...filters, app: e.target.value })}
          >
            <option value="">Tüm uygulamalar</option>
            {ref.apps.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Kategori filtresi"
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          >
            <option value="">Tüm kategoriler</option>
            {ref.categories
              .filter((c) => !kind || c.kind === kind)
              .map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          {!kind && (
            <select
              aria-label="İşlem türü"
              value={filters.kind}
              onChange={(e) => setFilters({ ...filters, kind: e.target.value })}
            >
              <option value="">Tüm işlem türleri</option>
              {Object.entries(kindLabels).map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
          <input
            aria-label="En düşük TRY tutarı"
            placeholder="Min TRY"
            value={filters.min}
            onChange={(e) => setFilters({ ...filters, min: e.target.value })}
          />
          <input
            aria-label="En yüksek TRY tutarı"
            placeholder="Maks TRY"
            value={filters.max}
            onChange={(e) => setFilters({ ...filters, max: e.target.value })}
          />
        </div>
        <ErrorNotice error={history.error || ref.error} />
        {history.hasNextPage && (
          <Notice>
            Filtreler ve CSV şu ana kadar yüklenen {all.length} kayda uygulanır. Dönemin tamamını
            incelemek için diğer sayfaları yükleyin.
          </Notice>
        )}
        <div className="list-summary">
          <span>{rows.length} kayıt gösteriliyor</span>
          <span>
            İptal hariç tarihsel tutar:{' '}
            <strong>
              {money(sum(rows.filter((r) => r.status !== 'cancelled').map((r) => r.tryMinor)))}
            </strong>
          </span>
        </div>
        <Panel>
          {history.isPending ? (
            <Loading />
          ) : (
            <TransactionTable
              rows={rows}
              apps={ref.apps}
              categories={ref.categories}
              onEdit={
                authorization?.role === 'ADMIN'
                  ? (r) => setForm({ kind: r.kind as 'income' | 'expense', row: r })
                  : undefined
              }
              onCancelLinked={
                authorization?.role === 'ADMIN'
                  ? async (r) => {
                      if (
                        !confirm(
                          r.kind.startsWith('transfer')
                            ? 'Bu transfer iki hesapta da iptal edilsin mi? Kayıtlar korunur, bakiyeler geri döner.'
                            : 'Bu ödeme iptal edilsin mi? Nakit etkisi geri alınır; tekrarlayan takvim değişmez.',
                        )
                      )
                        return
                      try {
                        await cancelLinkedTransaction(r.id)
                        await refresh()
                        notify('İşlem iptal edildi.')
                      } catch (e) {
                        notify(friendlyError(e), 'error')
                      }
                    }
                  : undefined
              }
            />
          )}
          {history.hasNextPage && (
            <div className="load-more">
              <Button
                variant="secondary"
                disabled={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                {history.isFetchingNextPage ? 'Yükleniyor…' : 'Sonraki 50 kaydı yükle'}
              </Button>
            </div>
          )}
          {!rows.length && !history.isPending && all.length > 0 && (
            <Empty title="Filtrelerle eşleşen işlem yok." />
          )}
        </Panel>
      </>
      {form && (
        <>
          <TransactionForm
            kind={form.kind}
            initial={form.row}
            onClose={() => setForm(null)}
            onCancel={
              form.row && form.row.status !== 'cancelled'
                ? async () => {
                    if (
                      !confirm(
                        'Bu işlem iptal edilsin mi? İlgili gelir, gider ve nakit etkisi geri alınır; kayıt korunur.',
                      )
                    )
                      return
                    try {
                      await cancelTransaction(form.row!.id)
                      await refresh()
                      setForm(null)
                      notify('İşlem iptal edildi.')
                    } catch (e) {
                      notify(friendlyError(e), 'error')
                    }
                  }
                : undefined
            }
          />
        </>
      )}
    </>
  )
}
function safeMinor(v: string) {
  try {
    return toMinor(v)
  } catch {
    return Number(fromMinor(0))
  }
}
