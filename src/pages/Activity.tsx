import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import AuditHistory from '../components/AuditHistory'
import { browserLabel, timeLabel } from '../lib/audit'
import { useAuth } from '../lib/auth'
import { exportTable } from '../lib/backup'
import { listAccessDenied, listAccessLogs } from '../lib/repository'
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Loading,
  Notice,
  PageHeading,
  Panel,
} from '../components/ui'
function Sessions() {
  const data = useInfiniteQuery({
    queryKey: ['access-logs'],
    initialPageParam: undefined as QueryDocumentSnapshot | undefined,
    queryFn: ({ pageParam }) => listAccessLogs(pageParam),
    getNextPageParam: (page) => (page.more ? page.cursor : undefined),
  })
  const rows = data.data?.pages.flatMap((p) => p.rows) || []
  return (
    <>
      <ErrorNotice error={data.error} />
      <Panel
        title="Oturum geçmişi"
        description="Yetkili hesapların giriş ve çıkışları. IP adresi tutulmaz; sunucusuz yapıda tarayıcı bunu güvenilir biçimde bilemez."
        action={
          <Button
            variant="secondary"
            disabled={!rows.length}
            onClick={() =>
              exportTable(
                'velonance-oturumlar.csv',
                ['Zaman', 'Olay', 'E-posta', 'Ad', 'Tarayıcı'],
                rows.map((r) => [
                  timeLabel(r.at),
                  r.event === 'sign_in' ? 'Giriş' : 'Çıkış',
                  r.email,
                  r.displayName,
                  r.userAgent,
                ]),
              )
            }
          >
            <Download size={15} /> CSV indir
          </Button>
        }
      >
        {data.isPending ? (
          <Loading />
        ) : !rows.length ? (
          <Empty title="Henüz oturum kaydı yok." description="İlk girişten sonra burada görünür." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Zaman</th>
                  <th>Olay</th>
                  <th>Hesap</th>
                  <th>Cihaz</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{timeLabel(r.at)}</td>
                    <td>
                      <Badge tone={r.event === 'sign_in' ? 'green' : 'neutral'}>
                        {r.event === 'sign_in' ? 'Giriş' : 'Çıkış'}
                      </Badge>
                    </td>
                    <td>
                      {r.email}
                      <small>{r.displayName}</small>
                    </td>
                    <td>{browserLabel(r.userAgent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.hasNextPage && (
          <div className="load-more">
            <Button
              variant="secondary"
              disabled={data.isFetchingNextPage}
              onClick={() => void data.fetchNextPage()}
            >
              Sonraki 50 kaydı yükle
            </Button>
          </div>
        )}
      </Panel>
    </>
  )
}
function Denied() {
  const data = useQuery({ queryKey: ['access-denied'], queryFn: listAccessDenied })
  return (
    <>
      <ErrorNotice error={data.error} />
      <Panel
        title="Yetkisiz giriş denemeleri"
        description="Google ile giriş yapan ama yetkisi olmayan hesaplar. Hesap başına son deneme tutulur. Bu hesaplar hiçbir finansal veriye erişemez."
      >
        {data.isPending ? (
          <Loading />
        ) : !data.data?.length ? (
          <Empty title="Yetkisiz deneme yok." description="Bu iyi bir haber." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Son deneme</th>
                  <th>Hesap</th>
                  <th>Cihaz</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((r) => (
                  <tr key={r.id}>
                    <td>{timeLabel(r.lastAt)}</td>
                    <td>
                      {r.email}
                      <small>UID: {r.uid}</small>
                    </td>
                    <td>{browserLabel(r.userAgent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
export default function Activity() {
  const { authorization } = useAuth(),
    [tab, setTab] = useState('changes')
  return (
    <>
      <PageHeading
        title="Kayıtlar"
        description="Kim, ne zaman, neyi değiştirdi? Giriş çıkışları ve yetkisiz denemeleri buradan izleyin."
      />
      {authorization?.role !== 'ADMIN' ? (
        <Notice>Kayıtları yalnızca yöneticiler görüntüleyebilir.</Notice>
      ) : (
        <>
          <div className="tabs">
            {[
              ['changes', 'Değişiklikler'],
              ['sessions', 'Oturum geçmişi'],
              ['denied', 'Yetkisiz denemeler'],
            ].map(([v, l]) => (
              <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
                {l}
              </button>
            ))}
          </div>
          {tab === 'changes' ? <AuditHistory /> : tab === 'sessions' ? <Sessions /> : <Denied />}
        </>
      )}
    </>
  )
}
