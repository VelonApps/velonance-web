import { ArrowDownLeft, ArrowUpRight, Ban, MoreHorizontal } from 'lucide-react'
import type { Application, Category, Transaction } from '../lib/models'
import { dateLabel, money } from '../lib/finance'
import { Badge, Button, Empty } from './ui'
export const kindLabels: Record<Transaction['kind'], string> = {
  income: 'Gelir',
  expense: 'Gider',
  transfer_in: 'Transfer girişi',
  transfer_out: 'Transfer çıkışı',
  debt_draw: 'Alınan anapara',
  debt_lend: 'Verilen anapara',
  debt_repay: 'Borç geri ödemesi',
  debt_collect: 'Alacak tahsilatı',
}
export function TransactionTable({
  rows,
  apps,
  categories,
  onEdit,
  onCancelLinked,
}: {
  rows: Transaction[]
  apps: Application[]
  categories: Category[]
  onEdit?: (row: Transaction) => void
  onCancelLinked?: (row: Transaction) => void
}) {
  return !rows.length ? (
    <Empty
      title="Henüz işlem kaydı bulunmuyor."
      description="Gerçek kayıtlar eklendiğinde işlem geçmişiniz burada görünecek."
    />
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>İşlem</th>
            <th>Uygulama / kategori</th>
            <th>Tarih</th>
            <th>Durum</th>
            <th className="align-right">Tutar</th>
            {onEdit && (
              <th>
                <span className="sr-only">İşlemler</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <div className="transaction-name">
                  <span
                    className={
                      'transaction-icon ' +
                      (['income', 'transfer_in', 'debt_draw', 'debt_collect'].includes(r.kind)
                        ? 'positive'
                        : 'negative')
                    }
                  >
                    {['income', 'transfer_in', 'debt_draw', 'debt_collect'].includes(r.kind) ? (
                      <ArrowDownLeft size={18} />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </span>
                  <div>
                    <strong>{r.title}</strong>
                    <small>{kindLabels[r.kind]}</small>
                  </div>
                </div>
              </td>
              <td>
                <strong className="table-app">
                  {apps.find((a) => a.id === r.applicationId)?.name || 'Stüdyo geneli'}
                </strong>
                <small>{categories.find((c) => c.id === r.categoryId)?.name || '—'}</small>
              </td>
              <td>
                {dateLabel(r.date)}
                <small>{r.cashDate ? 'Ödeme: ' + dateLabel(r.cashDate) : 'Tahakkuk tarihi'}</small>
              </td>
              <td>
                <Badge
                  tone={
                    r.status === 'settled' ? 'green' : r.status === 'pending' ? 'amber' : 'neutral'
                  }
                >
                  {r.status === 'settled'
                    ? 'Tamamlandı'
                    : r.status === 'pending'
                      ? 'Bekleniyor'
                      : 'İptal'}
                </Badge>
              </td>
              <td className="align-right">
                <strong className={r.kind === 'income' ? 'positive-text' : ''}>
                  {money(r.amountMinor, r.currency)}
                </strong>
                {r.currency !== 'TRY' && <small>{money(r.tryMinor)} · tarihsel</small>}
              </td>
              {onEdit && (
                <td>
                  {['income', 'expense'].includes(r.kind) && !r.linkId && (
                    <Button
                      variant="ghost"
                      aria-label={r.title + ' kaydını düzenle'}
                      onClick={() => onEdit(r)}
                    >
                      <MoreHorizontal size={18} />
                    </Button>
                  )}
                  {onCancelLinked &&
                    r.linkId &&
                    r.status === 'settled' &&
                    !r.kind.startsWith('debt') && (
                      <Button
                        variant="ghost"
                        aria-label={r.title + ' kaydını iptal et'}
                        title="İptal et"
                        onClick={() => onCancelLinked(r)}
                      >
                        <Ban size={16} />
                      </Button>
                    )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
