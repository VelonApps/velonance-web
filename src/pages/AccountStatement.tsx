import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Download, Wallet } from 'lucide-react'
import AuditHistory from '../components/AuditHistory'
import { kindLabels } from '../components/TransactionTable'
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
  usePeriod,
} from '../components/ui'
import { useAuth } from '../lib/auth'
import { exportTable } from '../lib/backup'
import { useReference } from '../lib/data'
import { dateLabel, fromMinor, money, statementRows, sum } from '../lib/finance'
import { accountStatement } from '../lib/repository'
export default function AccountStatement() {
  const { id } = useParams(),
    { authorization } = useAuth(),
    ref = useReference(),
    period = usePeriod('three'),
    account = ref.accounts.find((a) => a.id === id),
    { start, end } = period.range,
    data = useQuery({
      queryKey: ['statement', id, start, end],
      queryFn: () => accountStatement(account!, start, end),
      enabled: !!account,
    })
  if (ref.loading) return <Loading />
  if (!account)
    return (
      <Panel>
        <Empty title="Hesap bulunamadı." description="Hesaplar ekranından tekrar seçin." />
      </Panel>
    )
  const currency = account.currency,
    openedInRange = account.openingDate > start && account.openingDate <= end,
    opening = openedInRange ? account.openingMinor : data.data?.opening || 0,
    rows = statementRows(opening, data.data?.rows || []),
    incoming = sum(rows.map((r) => r.row.cashInMinor)),
    outgoing = sum(rows.map((r) => r.row.cashOutMinor)),
    closing = rows.at(-1)?.balance ?? opening
  return (
    <>
      <Link className="text-link back-link" to="/accounts">
        <ArrowLeft size={15} /> Hesaplara dön
      </Link>
      <PageHeading
        title={account.name}
        description={`Hesap ekstresi · ${currency} · Açılış tarihi ${dateLabel(account.openingDate)}`}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() =>
                exportTable(
                  'velonance-ekstre-' + account.name + '.csv',
                  [
                    'Tarih',
                    'İşlem',
                    'Tür',
                    'Durum',
                    'Giriş',
                    'Çıkış',
                    'Bakiye',
                    'Para birimi',
                    'Not',
                  ],
                  rows.map(({ row, balance }) => [
                    dateLabel(row.cashDate),
                    row.title,
                    kindLabels[row.kind],
                    row.status === 'cancelled' ? 'İptal' : 'Tamamlandı',
                    fromMinor(row.cashInMinor, currency),
                    fromMinor(row.cashOutMinor, currency),
                    fromMinor(balance, currency),
                    currency,
                    row.notes,
                  ]),
                )
              }
            >
              <Download size={16} /> CSV indir
            </Button>
            <Button onClick={() => window.print()}>
              <Download size={16} /> Yazdır / PDF
            </Button>
          </>
        }
      />
      <PeriodFilter state={period} />
      <ErrorNotice error={data.error} />
      {data.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="stats-grid">
            <Stat
              label="Dönem başı"
              value={money(opening, currency)}
              detail={openedInRange ? 'Hesap bu dönemde açıldı' : dateLabel(start)}
              icon={<Wallet size={18} />}
            />
            <Stat
              label="Toplam giriş"
              value={money(incoming, currency)}
              detail="Tamamlanan hareketler"
              icon={<ArrowDownLeft size={18} />}
            />
            <Stat
              label="Toplam çıkış"
              value={money(outgoing, currency)}
              detail="Tamamlanan hareketler"
              icon={<ArrowUpRight size={18} />}
            />
            <Stat
              label="Dönem sonu"
              value={money(closing, currency)}
              detail={dateLabel(end)}
              icon={<Wallet size={18} />}
              tone="highlight"
            />
          </div>
          <Panel title="Hesap hareketleri">
            {!rows.length ? (
              <Empty
                title="Bu dönemde hareket yok."
                description="Başka bir tarih aralığı seçebilirsiniz."
              />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>İşlem</th>
                      <th className="align-right">Giriş</th>
                      <th className="align-right">Çıkış</th>
                      <th className="align-right">Bakiye</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ row, balance }) => (
                      <tr key={row.id}>
                        <td>{dateLabel(row.cashDate)}</td>
                        <td>
                          <strong>{row.title}</strong>
                          <small>
                            {kindLabels[row.kind]}
                            {row.notes ? ' · ' + row.notes : ''}
                          </small>
                          {row.status === 'cancelled' && <Badge>İptal</Badge>}
                        </td>
                        <td className="align-right">
                          {row.cashInMinor ? money(row.cashInMinor, currency) : '—'}
                        </td>
                        <td className="align-right">
                          {row.cashOutMinor ? money(row.cashOutMinor, currency) : '—'}
                        </td>
                        <td className="align-right">
                          <strong>{money(balance, currency)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          {authorization?.role === 'ADMIN' && (
            <AuditHistory entityId={account.id} title="Hesap kaydındaki değişiklikler" />
          )}
        </>
      )}
    </>
  )
}
