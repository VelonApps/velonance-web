import { useQuery, useQueryClient } from '@tanstack/react-query'
import { balances, listEntities, listTransactions, REPORT_LIMIT } from './repository'
import { latestRates } from './finance'
import { fetchLiveRates, liveRateMap } from './liveRates'
import type {
  Account,
  Application,
  Category,
  CollectionName,
  Entity,
  Obligation,
  Rate,
  Recurring,
} from './models'
export function useEntities<T extends Entity>(name: CollectionName) {
  return useQuery({
    queryKey: ['entities', name],
    queryFn: () => listEntities<T>(name),
    staleTime: 60_000,
  })
}
export function useReference() {
  const apps = useEntities<Application>('applications'),
    accounts = useEntities<Account>('accounts'),
    categories = useEntities<Category>('categories'),
    rates = useEntities<Rate>('exchangeRates')
  return {
    apps: apps.data?.rows || [],
    accounts: accounts.data?.rows || [],
    categories: categories.data?.rows || [],
    rates: rates.data?.rows || [],
    loading: [apps, accounts, categories, rates].some((q) => q.isPending),
    error: [apps, accounts, categories, rates].find((q) => q.error)?.error,
    truncated: [apps, accounts, categories, rates].some((q) => q.data?.truncated),
  }
}
export function useLiveRates() {
  return useQuery({
    queryKey: ['live-rates'],
    queryFn: fetchLiveRates,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  })
}
// Kaydedilmiş son fiyatlar + varsa canlı fiyatlar (canlı olan daha günceldir, üstüne yazar).
export function useRates() {
  const ref = useReference(),
    live = useLiveRates()
  return {
    rates: new Map([...latestRates(ref.rates), ...liveRateMap(live.data)]),
    live: live.data,
    liveError: live.error,
  }
}
export function useReport(start: string, end: string, field: 'date' | 'cashDate' = 'date') {
  return useQuery({
    queryKey: ['report', start, end, field],
    queryFn: () => listTransactions(start, end, undefined, field, REPORT_LIMIT),
    staleTime: 30_000,
  })
}
export function useBalances(accounts: Account[]) {
  return useQuery({
    queryKey: ['balances', accounts.map((a) => a.id + String(a.updatedAt))],
    queryFn: () => balances(accounts),
    enabled: accounts.length > 0,
    staleTime: 30_000,
  })
}
export function useRefresh() {
  const q = useQueryClient()
  return async () => {
    await Promise.all([
      q.invalidateQueries({ queryKey: ['entities'] }),
      q.invalidateQueries({ queryKey: ['report'] }),
      q.invalidateQueries({ queryKey: ['history'] }),
      q.invalidateQueries({ queryKey: ['balances'] }),
      q.invalidateQueries({ queryKey: ['period-balances'] }),
      q.invalidateQueries({ queryKey: ['audit'] }),
      q.invalidateQueries({ queryKey: ['statement'] }),
      q.invalidateQueries({ queryKey: ['forecast'] }),
    ])
  }
}
export function useObligations() {
  return useEntities<Obligation>('obligations')
}
export function useRecurring() {
  return useEntities<Recurring>('recurringTemplates')
}
