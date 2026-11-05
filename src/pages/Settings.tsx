import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Pencil, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useAuth, friendlyError } from '../lib/auth'
import { useEntities, useReference, useRefresh } from '../lib/data'
import { defaultCategories, groupLabels } from '../lib/models'
import type { Category, Rate, Settings } from '../lib/models'
import { d, dateLabel, number, toMicros, today } from '../lib/finance'
import { getAuthorizationUsers, saveEntity, softDelete } from '../lib/repository'
import { exportBackup, importRows, previewImport } from '../lib/backup'
import type { ImportRow } from '../lib/backup'
import { EntityForm } from '../components/EntityForm'
import { ThemeButton } from '../components/Layout'
import {
  Badge,
  Button,
  ErrorNotice,
  Loading,
  Modal,
  Notice,
  PageHeading,
  Panel,
  Truncated,
  useToast,
} from '../components/ui'
export default function SettingsPage() {
  const { authorization, user } = useAuth(),
    ref = useReference(),
    general = useEntities<Settings>('settings'),
    refresh = useRefresh(),
    { notify } = useToast(),
    [tab, setTab] = useState('general'),
    [form, setForm] = useState<'general' | 'category' | 'rate' | Category | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [preview, setPreview] = useState<ImportRow[] | null>(null),
    [importResult, setImportResult] = useState<string[]>([]),
    [progress, setProgress] = useState(''),
    [confirmed, setConfirmed] = useState(false)
  const access = useQuery({
      queryKey: ['authorization-list'],
      queryFn: getAuthorizationUsers,
      enabled: tab === 'access' && authorization?.role === 'ADMIN',
    }),
    settings = general.data?.rows.find((s) => s.id === 'general'),
    admin = authorization?.role === 'ADMIN'
  async function operation(fn: () => Promise<unknown>, message: string) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await refresh()
      notify(message)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  async function seedCategories() {
    for (const [name, kind, group] of defaultCategories) {
      const key = 'default-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      await saveEntity('categories', { name, kind, group, parentId: '' }, key, true)
    }
  }
  async function remove(name: 'categories' | 'exchangeRates', id: string) {
    if (!confirm('Bu kayıt arşivlensin mi? Geçmiş finansal kayıtlar korunur.')) return
    await operation(() => softDelete(name, id), 'Kayıt arşivlendi.')
  }
  return (
    <>
      <PageHeading
        title="Ayarlar"
        description="Çalışma alanınızı, değerleme kurlarını ve veri yönetimini düzenleyin."
      />
      <div className="tabs">
        {[
          ['general', 'Genel'],
          ['categories', 'Kategoriler'],
          ['rates', 'Döviz ve altın'],
          ['access', 'Erişim'],
          ['data', 'Veri yönetimi'],
        ].map(([v, l]) => (
          <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
            {l}
          </button>
        ))}
      </div>
      <ErrorNotice error={error || ref.error || general.error} />
      <Truncated show={ref.truncated || general.data?.truncated} />
      {tab === 'general' && (
        <Panel
          title="Çalışma alanı"
          action={
            admin && (
              <Button variant="secondary" onClick={() => setForm('general')}>
                <Pencil size={15} /> Düzenle
              </Button>
            )
          }
        >
          <dl className="settings-list">
            <div>
              <dt>Şirket adı</dt>
              <dd>{settings?.name || 'Velon Apps'}</dd>
            </div>
            <div>
              <dt>Raporlama para birimi</dt>
              <dd>TRY</dd>
            </div>
            <div>
              <dt>Saat dilimi</dt>
              <dd>Europe/Istanbul</dd>
            </div>
            <div>
              <dt>Tarih ve sayı biçimi</dt>
              <dd>tr-TR · 25 Eki 2026 · 1.234,56</dd>
            </div>
            <div>
              <dt>Görünüm</dt>
              <dd>
                <ThemeButton /> Sistem / açık / koyu
              </dd>
            </div>
          </dl>
          <Notice>
            İlk sürümde raporlama TRY, dil Türkçe ve saat dilimi İstanbul olarak sabittir. Tema
            tercihi dışında finansal kayıtlar tarayıcı depolamasına yazılmaz.
          </Notice>
        </Panel>
      )}
      {tab === 'categories' && (
        <Panel
          title="Gelir ve gider kategorileri"
          action={
            admin && (
              <>
                <Button
                  variant="secondary"
                  disabled={busy || ref.categories.length > 0}
                  onClick={() => void operation(seedCategories, 'Varsayılan kategoriler eklendi.')}
                >
                  Varsayılanları ekle
                </Button>
                <Button onClick={() => setForm('category')}>
                  <Plus size={15} /> Kategori ekle
                </Button>
              </>
            )
          }
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>Tür</th>
                  <th>Grup</th>
                  <th>Üst kategori</th>
                  {admin && <th />}
                </tr>
              </thead>
              <tbody>
                {ref.categories
                  .filter((c) => !c.deleted)
                  .map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.kind === 'income' ? 'Gelir' : 'Gider'}</td>
                      <td>{groupLabels[c.group]}</td>
                      <td>{ref.categories.find((p) => p.id === c.parentId)?.name || '—'}</td>
                      {admin && (
                        <td>
                          <div className="inline-actions">
                            <Button
                              variant="ghost"
                              aria-label={c.name + ' düzenle'}
                              onClick={() => setForm(c)}
                            >
                              <Pencil size={15} />
                            </Button>
                            <Button
                              variant="ghost"
                              aria-label={c.name + ' arşivle'}
                              onClick={() => void remove('categories', c.id)}
                            >
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                {!ref.categories.length && (
                  <tr>
                    <td colSpan={5}>
                      Henüz kategori yok. Varsayılan listeyi ekleyebilir veya özel kategori
                      oluşturabilirsiniz.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {tab === 'rates' && (
        <Panel
          title="Manuel değerleme geçmişi"
          description="Her yeni fiyat ayrı kayıt oluşturur. İşlemlerdeki tarihsel kur değişmez. En son tarihli kayıt güncel tahmindir."
          action={
            admin && (
              <Button onClick={() => setForm('rate')}>
                <Plus size={15} /> Fiyat / kur ekle
              </Button>
            )
          }
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Varlık</th>
                  <th>Birim</th>
                  <th>Birim fiyatı (TRY)</th>
                  <th>Değerleme tarihi</th>
                  {admin && <th />}
                </tr>
              </thead>
              <tbody>
                {[...ref.rates]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((r: Rate) => (
                    <tr key={r.id}>
                      <td>
                        <Badge>{r.asset === 'gold' ? 'Altın' : 'Döviz'}</Badge>
                      </td>
                      <td>{r.unit}</td>
                      <td>{number(d(r.priceMicros).div(1e6).toNumber())}</td>
                      <td>{dateLabel(r.date)}</td>
                      {admin && (
                        <td>
                          <Button
                            variant="ghost"
                            aria-label={r.unit + ' fiyatını arşivle'}
                            onClick={() => void remove('exchangeRates', r.id)}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                {!ref.rates.length && (
                  <tr>
                    <td colSpan={5}>Kur verisi yok. TRY için 1 değeri otomatik kullanılır.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {tab === 'access' && (
        <Panel
          title="Yetkili erişim"
          description="Yetki belgeleri tarayıcıdan değiştirilemez. Yönetim, Firebase Console veya güvenli Admin SDK ile yapılır."
        >
          <Notice>
            <ShieldCheck size={15} /> Oturum: {user?.email} · UID: {user?.uid} · Rol:{' '}
            {authorization?.role}
          </Notice>
          {admin ? (
            <>
              <ErrorNotice error={access.error} />
              {access.isPending ? (
                <Loading />
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>E-posta</th>
                        <th>Rol</th>
                        <th>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {access.data?.map((a) => (
                        <tr key={a.uid}>
                          <td>{a.email}</td>
                          <td>{a.role}</td>
                          <td>{a.active ? 'Etkin' : 'Kapalı'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p>Diğer kullanıcıların yetki kayıtlarını yalnızca yönetici görüntüleyebilir.</p>
          )}
        </Panel>
      )}
      {tab === 'data' && (
        <>
          <Panel
            title="Dışa aktarma ve yedekleme"
            description="Yedek tüm stüdyo koleksiyonlarını sayfalayarak okur. İndirilen dosya hassas finansal bilgi içerir."
          >
            <div className="data-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void operation(() => exportBackup(admin), 'JSON yedeği indirildi.')}
              >
                <Download size={17} /> Tam JSON yedeği indir
              </Button>
              <Button variant="secondary" onClick={() => window.print()}>
                Bu sayfayı yazdır
              </Button>
            </div>
            <Notice>
              JSON dışa aktarma tam arşivdir. Tarayıcıdan geri aktarım; referans kayıtları ve
              bağımsız gelir/giderlerle sınırlıdır. Borç, ödeme, transfer, oluşum ve audit
              geçmişinin tam geri yüklemesi güvenilir sunucu / yönetici işlemi gerektirir. Dosyayı
              şifreli, erişimi kısıtlı bir yerde saklayın.
            </Notice>
          </Panel>
          {admin && (
            <Panel
              title="Güvenli JSON içe aktarma"
              description="En fazla 5 MB / 10.000 kayıt. Önizleme → yinelenen kimlik kontrolü → açık onay → sıralı aktarım."
            >
              <label className="upload-control">
                <Upload size={19} />
                <span>{busy ? 'Dosya inceleniyor…' : 'Bir Velonance JSON yedeği seçin'}</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setError(null)
                    setBusy(true)
                    setImportResult([])
                    setConfirmed(false)
                    try {
                      setPreview(await previewImport(file))
                    } catch (err) {
                      setError(err)
                    } finally {
                      setBusy(false)
                      e.target.value = ''
                    }
                  }}
                />
              </label>
              {importResult.length > 0 && (
                <ul className="import-errors">
                  {importResult.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </>
      )}
      {form && (
        <EntityForm
          title={
            form === 'general'
              ? 'Genel ayarlar'
              : form === 'rate'
                ? 'Yeni manuel değerleme'
                : form === 'category'
                  ? 'Yeni kategori'
                  : 'Kategoriyi düzenle'
          }
          onClose={() => setForm(null)}
          initial={
            form === 'general'
              ? { name: settings?.name || 'Velon Apps' }
              : typeof form === 'object'
                ? { name: form.name, kind: form.kind, group: form.group, parentId: form.parentId }
                : {}
          }
          fields={
            form === 'general'
              ? [{ name: 'name', label: 'Şirket görünen adı', required: true, full: true }]
              : form === 'rate'
                ? [
                    {
                      name: 'asset',
                      label: 'Varlık',
                      options: [
                        { value: 'currency', label: 'Döviz' },
                        { value: 'gold', label: 'Altın' },
                      ],
                    },
                    {
                      name: 'unit',
                      label: 'Birim adı / kodu',
                      required: true,
                      help: 'Dövizde USD/EUR/GBP; altında Gram, Çeyrek, Yarım, Tam veya özel ad. Borçtaki birimle birebir eşleşmeli.',
                    },
                    { name: 'price', label: '1 birim için TRY fiyatı', required: true },
                    {
                      name: 'date',
                      label: 'Değerleme tarihi',
                      type: 'date',
                      required: true,
                      defaultValue: today(),
                    },
                  ]
                : [
                    { name: 'name', label: 'Kategori adı', required: true, full: true },
                    {
                      name: 'kind',
                      label: 'İşlem türü',
                      options: [
                        { value: 'income', label: 'Gelir' },
                        { value: 'expense', label: 'Gider' },
                      ],
                    },
                    {
                      name: 'group',
                      label: 'Raporlama grubu',
                      options: Object.entries(groupLabels).map(([value, label]) => ({
                        value,
                        label,
                      })),
                    },
                    {
                      name: 'parentId',
                      label: 'Üst kategori',
                      options: [
                        { value: '', label: 'Ana kategori' },
                        ...ref.categories
                          .filter(
                            (c) => !c.deleted && (typeof form !== 'object' || c.id !== form.id),
                          )
                          .map((c) => ({ value: c.id, label: c.name })),
                      ],
                    },
                  ]
          }
          onSave={(v) =>
            form === 'general'
              ? saveEntity(
                  'settings',
                  { name: v.name, currency: 'TRY', timezone: 'Europe/Istanbul', locale: 'tr-TR' },
                  'general',
                )
              : form === 'rate'
                ? saveEntity('exchangeRates', {
                    unit: v.asset === 'currency' ? v.unit.toUpperCase() : v.unit,
                    priceMicros: toMicros(v.price),
                    date: v.date,
                    asset: v.asset,
                  })
                : saveEntity(
                    'categories',
                    {
                      ...v,
                      group:
                        v.kind === 'income' ? 'income' : v.group === 'income' ? 'other' : v.group,
                    },
                    typeof form === 'object' ? form.id : undefined,
                  )
          }
        />
      )}
      {preview && (
        <Modal
          title="İçe aktarma önizlemesi"
          onClose={() => {
            if (!busy) setPreview(null)
          }}
          wide
        >
          <Notice>
            {preview.filter((r) => r.status === 'ready').length} hazır ·{' '}
            {preview.filter((r) => r.status === 'duplicate').length} yinelenen ·{' '}
            {preview.filter((r) => r.status === 'invalid').length} geçersiz ·{' '}
            {preview.filter((r) => r.status === 'unsupported').length} desteklenmeyen. Var olan
            kayıtların üzerine yazılmaz. İşlem kayıt bazında uygulanır; tamamı tek atomik işlem
            değildir.
          </Notice>
          <div className="import-preview table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Koleksiyon / ID</th>
                  <th>Durum</th>
                  <th>Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 200).map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.collection}
                      <small>{r.id}</small>
                    </td>
                    <td>
                      <Badge tone={r.status === 'ready' ? 'green' : 'amber'}>{r.status}</Badge>
                    </td>
                    <td>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 200 && (
            <p>İlk 200 satır gösteriliyor; aktarım tüm hazır kayıtlara uygulanır.</p>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            Önizlemeyi inceledim; hazır kayıtların bu stüdyoya eklenmesini onaylıyorum.
          </label>
          <p role="status">{progress}</p>
          <div className="form-actions">
            <Button variant="secondary" disabled={busy} onClick={() => setPreview(null)}>
              Vazgeç
            </Button>
            <Button
              disabled={!confirmed || busy || !preview.some((r) => r.status === 'ready')}
              onClick={async () => {
                setBusy(true)
                try {
                  const results = await importRows(preview, (done, total) =>
                    setProgress(`${done} / ${total} işlendi`),
                  )
                  setImportResult(
                    results.length
                      ? results.map((r) => r.id + ': ' + r.error)
                      : ['Hazır kayıtların tamamı aktarıldı.'],
                  )
                  await refresh()
                  setPreview(null)
                  notify(
                    results.length
                      ? 'Aktarım tamamlandı; hata listesini inceleyin.'
                      : 'Aktarım tamamlandı.',
                  )
                } catch (e) {
                  notify(friendlyError(e), 'error')
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Aktarılıyor…' : 'Hazır kayıtları içe aktar'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
