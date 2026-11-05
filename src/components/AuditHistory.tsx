import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { actionLabels, auditChanges, auditTitle, entityLabels, timeLabel } from '../lib/audit'
import { exportTable } from '../lib/backup'
import { getAuthorizationUsers, listAudit } from '../lib/repository'
import { Button, Empty, ErrorNotice, Loading, Notice, Panel, PeriodFilter, usePeriod } from './ui'
export default function AuditHistory({ entityId, title }: { entityId?: string; title?: string }) {
  const period = usePeriod('year'),
    [filters, setFilters] = useState({ entityType: '', action: '', actorUid: '' }),
    users = useQuery({ queryKey: ['authorization-list'], queryFn: getAuthorizationUsers }),
    scope = entityId
      ? { entityId }
      : { ...filters, start: period.range.start, end: period.range.end }
  const data = useInfiniteQuery({
    queryKey: ['audit', scope],
    initialPageParam: undefined as QueryDocumentSnapshot | undefined,
    queryFn: ({ pageParam }) => listAudit(scope, pageParam),
    getNextPageParam: (page) => (page.more ? page.cursor : undefined),
  })
  const rows = data.data?.pages.flatMap((p) => p.rows) || [],
    actor = (uid: string, email?: string) =>
      email || users.data?.find((u) => u.uid === uid)?.email || uid
  return (
    <>
      {!entityId && (
        <>
          <Notice>
            Kayıtlar yalnızca yöneticilere görünür; değiştirilemez ve silinemez. Uygulama her
            değişikliği işlemle birlikte kaydeder. Sunucu tarafı olmadığı için, doğrudan
            veritabanına yazan bir yönetici kayıt bırakmayabilir.
          </Notice>
          <PeriodFilter state={period} />
          <div className="filter-bar">
            <select
              aria-label="Kayıt türü filtresi"
              value={filters.entityType}
              onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
            >
              <option value="">Tüm kayıt türleri</option>
              {Object.entries(entityLabels).map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
            <select
              aria-label="Eylem filtresi"
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            >
              <option value="">Tüm eylemler</option>
              {Object.entries(actionLabels).map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
            <select
              aria-label="Kullanıcı filtresi"
              value={filters.actorUid}
              onChange={(e) => setFilters({ ...filters, actorUid: e.target.value })}
            >
              <option value="">Tüm kullanıcılar</option>
              {users.data?.map((u) => (
                <option value={u.uid} key={u.uid}>
                  {u.email}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      <ErrorNotice error={data.error} />
      <Panel
        title={title || 'Değişiklikler'}
        action={
          <Button
            variant="secondary"
            disabled={!rows.length}
            onClick={() =>
              exportTable(
                'velonance-degisiklikler.csv',
                [
                  'Zaman',
                  'Kullanıcı',
                  'Eylem',
                  'Kayıt türü',
                  'Kayıt',
                  'Kimlik',
                  'Alan',
                  'Önce',
                  'Sonra',
                ],
                rows.flatMap((r) => {
                  const base = [
                    timeLabel(r.timestamp),
                    actor(r.actorUid, r.actorEmail),
                    actionLabels[r.action] || r.action,
                    entityLabels[r.entityType] || r.entityType,
                    auditTitle(r),
                    r.entityId,
                  ]
                  const changes = auditChanges(r)
                  return changes.length
                    ? changes.map((c) => [...base, c.label, c.before, c.after])
                    : [[...base, '', '', '']]
                }),
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
          <Empty
            title="Değişiklik kaydı yok."
            description="Bu seçimle eşleşen bir değişiklik bulunmuyor."
          />
        ) : (
          <div className="audit-list">
            {rows.map((row) => {
              const changes = auditChanges(row)
              return (
                <details key={row.id}>
                  <summary>
                    <strong>
                      {actionLabels[row.action] || row.action} ·{' '}
                      {entityLabels[row.entityType] || row.entityType}
                    </strong>
                    <span>{auditTitle(row) || row.entityId}</span>
                    <small>
                      {actor(row.actorUid, row.actorEmail)} · {timeLabel(row.timestamp)}
                    </small>
                  </summary>
                  {changes.length > 0 ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Alan</th>
                            <th>Önce</th>
                            <th>Sonra</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changes.map((c) => (
                            <tr key={c.field}>
                              <td>{c.label}</td>
                              <td>{c.before}</td>
                              <td>{c.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="muted">Alan değişikliği kaydedilmedi.</p>
                  )}
                  <small className="muted">Kayıt kimliği: {row.entityId}</small>
                </details>
              )
            })}
          </div>
        )}
        {data.hasNextPage && (
          <div className="load-more">
            <Button
              variant="secondary"
              disabled={data.isFetchingNextPage}
              onClick={() => void data.fetchNextPage()}
            >
              Sonraki 50 değişikliği yükle
            </Button>
          </div>
        )}
      </Panel>
    </>
  )
}
