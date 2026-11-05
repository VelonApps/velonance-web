import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, Landmark, Pencil, Plus, Wallet } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useBalances, useReference } from '../lib/data'
import { currencies, currencyOptions } from '../lib/models'
import type { Account } from '../lib/models'
import { fromMinor, money, toMicros, toMinor, today } from '../lib/finance'
import { saveEntity, transfer } from '../lib/repository'
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
const types: Record<string, string> = {
  bank: 'Banka hesabı',
  cash: 'Nakit kasa',
  apple: 'Apple bakiye hesabı',
  other: 'Diğer',
}
export default function Accounts() {
  const { authorization } = useAuth(),
    ref = useReference(),
    balances = useBalances(ref.accounts),
    [form, setForm] = useState<Account | 'new' | 'transfer' | null>(null),
    [transferKey, setTransferKey] = useState(() => crypto.randomUUID())
  return (
    <>
      <PageHeading
        title="Hesaplar"
        description="Nakit bakiyenizin kaynağı, her zaman işlem defteriniz."
        actions={
          authorization?.role === 'ADMIN' && (
            <>
              <Button
                variant="secondary"
                disabled={ref.accounts.length < 2}
                onClick={() => {
                  setTransferKey(crypto.randomUUID())
                  setForm('transfer')
                }}
              >
                <ArrowLeftRight size={17} /> Transfer yap
              </Button>
              <Button onClick={() => setForm('new')}>
                <Plus size={17} /> Hesap ekle
              </Button>
            </>
          )
        }
      />
      <ErrorNotice error={ref.error || balances.error} />
      <Truncated show={ref.truncated} />
      <Notice>
        Bakiyeler açılış bakiyesi ve tamamlanmış nakit hareketlerinin toplamıdır. Bekleyen
        gelir/gider bakiyeyi değiştirmez. Açılış bilgileri kayıt sonrası kilitlenir.
      </Notice>
      {ref.loading || balances.isFetching ? (
        <Loading />
      ) : !ref.accounts.length ? (
        <Panel>
          <Empty
            title="İlk finansal hesabınızı ekleyin."
            description="TRY, USD ve diğer para birimlerindeki hesaplarınızı ayrı ayrı takip edin."
          />
        </Panel>
      ) : (
        <div className="account-grid">
          {(balances.data || []).map((a) => (
            <Panel key={a.id}>
              <div className="account-top">
                <span className="account-icon">
                  {a.type === 'bank' ? <Landmark size={22} /> : <Wallet size={22} />}
                </span>
                <Badge>{a.currency}</Badge>
                {authorization?.role === 'ADMIN' && (
                  <Button
                    variant="ghost"
                    aria-label={a.name + ' düzenle'}
                    onClick={() => setForm(a)}
                  >
                    <Pencil size={16} />
                  </Button>
                )}
              </div>
              <h2>{a.name}</h2>
              <p>
                {types[a.type]} {a.archived ? '· Arşivlendi' : ''}
              </p>
              <strong className="account-balance">{money(a.balance, a.currency)}</strong>
              <span className="muted">
                Açılış: {money(a.openingMinor, a.currency)} · {a.openingDate}
              </span>
              <Link className="statement-link" to={'/accounts/' + a.id}>
                Hesap geçmişi ve ekstre →
              </Link>
            </Panel>
          ))}
        </div>
      )}
      {form && form !== 'transfer' && (
        <EntityForm
          title={form === 'new' ? 'Yeni hesap' : 'Hesabı düzenle'}
          onClose={() => setForm(null)}
          initial={
            form === 'new'
              ? {}
              : {
                  name: form.name,
                  currency: form.currency,
                  type: form.type,
                  opening: fromMinor(form.openingMinor, form.currency),
                  openingDate: form.openingDate,
                  notes: form.notes,
                  archived: String(form.archived),
                }
          }
          fields={[
            {
              name: 'name',
              label: 'Hesap adı',
              required: true,
              full: true,
              example: 'Garanti TL vadesiz',
              help: 'Paranın durduğu yer: banka hesabı, kasa, Apple’dan bekleyen bakiye gibi. Her para birimi için ayrı hesap aç.',
            },
            {
              name: 'currency',
              label: 'Para birimi',
              required: true,
              options: currencyOptions(form === 'new' ? [] : [form.currency]),
              help: 'Bu hesapta hangi para duruyor? Kayıttan sonra değiştirilemez; farklı para birimi için ayrı hesap aç.',
              defaultValue: 'TRY',
              disabled: form !== 'new',
            },
            {
              name: 'type',
              label: 'Hesap türü',
              options: Object.entries(types).map(([value, label]) => ({ value, label })),
            },
            {
              name: 'opening',
              label: 'Açılış bakiyesi',
              required: true,
              numeric: true,
              example: '15000',
              help: 'Takibe başladığın gün hesapta ne kadar para vardı? Kayıttan sonra değiştirilemez.',
              defaultValue: '0',
              disabled: form !== 'new',
            },
            {
              name: 'openingDate',
              label: 'Açılış tarihi',
              type: 'date',
              required: true,
              help: 'Açılış bakiyesinin geçerli olduğu gün. Bu tarihten önceye hareket girilemez.',
              defaultValue: today(),
              disabled: form !== 'new',
            },
            {
              name: 'archived',
              label: 'Durum',
              options: [
                { value: 'false', label: 'Etkin' },
                { value: 'true', label: 'Arşivlendi' },
              ],
            },
            { name: 'notes', label: 'Not', type: 'textarea', full: true },
          ]}
          onSave={(v) =>
            saveEntity(
              'accounts',
              {
                name: v.name,
                currency: v.currency.toUpperCase(),
                type: v.type,
                openingMinor: toMinor(v.opening, v.currency.toUpperCase()),
                openingDate: v.openingDate,
                notes: v.notes,
                archived: v.archived === 'true',
              },
              form === 'new' ? undefined : form.id,
            )
          }
        />
      )}
      {form === 'transfer' && (
        <EntityForm
          key={transferKey}
          title="Hesaplar arası transfer"
          onClose={() => setForm(null)}
          fields={[
            {
              name: 'from',
              label: 'Kaynak hesap',
              required: true,
              options: ref.accounts
                .filter((a) => !a.archived)
                .map((a) => ({ value: a.id, label: a.name + ' · ' + a.currency })),
            },
            {
              name: 'to',
              label: 'Hedef hesap',
              required: true,
              options: ref.accounts
                .filter((a) => !a.archived)
                .map((a) => ({ value: a.id, label: a.name + ' · ' + a.currency })),
            },
            {
              name: 'amount',
              label: 'Çıkış tutarı (kaynak para birimi)',
              required: true,
              numeric: true,
              example: '4235',
              help: 'Kaynak hesaptan çıkan tutar, o hesabın para biriminde.',
            },
            {
              name: 'received',
              label: 'Giriş tutarı (hedef para birimi)',
              required: true,
              numeric: true,
              example: '100',
              help: 'Hedef hesaba geçen tutar. Aynı para biriminde çıkışla aynı olmalı; döviz bozdurmada bankanın verdiği tutarı yaz.',
            },
            {
              name: 'rate',
              label: 'Kaynak → TRY tarihsel kur',
              required: true,
              defaultValue: '1',
              numeric: true,
              example: '1',
              help: 'Kaynak hesabın para birimi için 1 birim kaç TL. TRY hesapta 1.',
            },
            {
              name: 'receivedRate',
              label: 'Hedef → TRY tarihsel kur',
              required: true,
              defaultValue: '1',
              numeric: true,
              example: '42,35',
              help: 'Hedef hesabın para birimi için 1 birim kaç TL. TRY hesapta 1.',
            },
            {
              name: 'date',
              label: 'Transfer tarihi',
              type: 'date',
              required: true,
              defaultValue: today(),
            },
            { name: 'notes', label: 'Not', type: 'textarea', full: true },
          ]}
          onSave={(v) => {
            const source = ref.accounts.find((a) => a.id === v.from),
              target = ref.accounts.find((a) => a.id === v.to)
            if (!source || !target) throw new Error('Hesap seçin.')
            return transfer({
              from: v.from,
              to: v.to,
              amountMinor: toMinor(v.amount, source.currency),
              receivedMinor: toMinor(v.received, target.currency),
              rateMicros: source.currency === 'TRY' ? 1000000 : toMicros(v.rate),
              receivedRateMicros: target.currency === 'TRY' ? 1000000 : toMicros(v.receivedRate),
              date: v.date,
              notes: v.notes,
              key: transferKey,
            })
          }}
        >
          <Notice>
            Transfer kâr veya zarar üretmez. Banka masrafını ayrı gider olarak girin. Farklı para
            birimlerinde gerçek çıkış ve giriş tutarlarını, kendi tarihsel kurlarıyla kaydedin.{' '}
            {currencies.join(', ')} ve ek ISO kodları desteklenir.
          </Notice>
        </EntityForm>
      )}
    </>
  )
}
