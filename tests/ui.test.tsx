import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Protected from '../src/components/Protected'
import Login from '../src/pages/Login'
import TransactionForm from '../src/components/TransactionForm'
import { TransactionTable } from '../src/components/TransactionTable'
import { money } from '../src/lib/finance'
import type { Transaction } from '../src/lib/models'
import Transactions from '../src/pages/Transactions'
const mocks = vi.hoisted(() => ({
  auth: {
    authorization: null as unknown,
    loading: false,
    user: null,
    error: '',
    login: vi.fn(),
    logout: vi.fn(),
  },
  save: vi.fn().mockResolvedValue('id'),
  refresh: vi.fn().mockResolvedValue(undefined),
  history: [] as Transaction[],
}))
vi.mock('../src/lib/auth', () => ({
  useAuth: () => mocks.auth,
  friendlyError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))
vi.mock('../src/lib/firebase', () => ({ configured: false }))
vi.mock('../src/lib/data', () => ({
  useReference: () => ({
    apps: [],
    accounts: [],
    categories: [],
    rates: [],
    loading: false,
    error: null,
  }),
  useRefresh: () => mocks.refresh,
  useEntities: () => ({ data: { rows: [] } }),
}))
vi.mock('../src/lib/repository', () => ({
  saveTransaction: (...args: unknown[]) => mocks.save(...args),
  listTransactions: async () => ({ rows: mocks.history, more: false }),
  blankTransaction: () => ({
    kind: 'income',
    description: '',
    conversionDate: '2026-10-25',
    conversionMethod: 'manual',
    group: 'income',
    allocations: [],
    linkId: '',
    apple: null,
  }),
}))
function wrapped(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  mocks.save.mockClear()
  mocks.history = []
})
describe('Erişim ve arayüz', () => {
  it('yapılandırmasız kurulum ekranı ve finans verisi yok', () => {
    wrapped(<Login />)
    expect(screen.getByText('Çalışma alanınızı bağlayın')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Google ile Giriş Yap' })).not.toBeInTheDocument()
  })
  it('korumalı rota oturum olmadan girişe gider', () => {
    wrapped(
      <Routes>
        <Route path="/" element={<Protected />} />
        <Route path="/login" element={<p>Giriş ekranı</p>} />
      </Routes>,
    )
    expect(screen.getByText('Giriş ekranı')).toBeInTheDocument()
  })
  it('yetki yüklenirken finansal içerik açılmaz', () => {
    mocks.auth.loading = true
    wrapped(<Protected />)
    expect(screen.getByRole('status')).toHaveTextContent('Veriler yükleniyor')
    mocks.auth.loading = false
  })
  it('boş işlem tablosu açıklayıcıdır', () => {
    wrapped(<TransactionTable rows={[]} apps={[]} categories={[]} />)
    expect(screen.getByText('Henüz işlem kaydı bulunmuyor.')).toBeInTheDocument()
  })
  it('para Türkçe biçimde gösterilir', () => expect(money(123456, 'TRY')).toMatch(/1\.234,56/))
  it('boş gelir formu kaydedilemez', async () => {
    wrapped(<TransactionForm kind="income" onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'İşlemi kaydet' }))
    expect(
      await screen.findByText(
        'Başlık en az iki karakter olmalı. Örnek: App Store Ekim 2026 geliri',
      ),
    ).toBeInTheDocument()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('gelir formu gerçek kayıt servisine tarihsel dönüşüm gönderir', async () => {
    const close = vi.fn()
    wrapped(<TransactionForm kind="income" onClose={close} />)
    fireEvent.change(screen.getByLabelText(/Gelir başlığı/), {
      target: { value: 'Abonelik gelirleri' },
    })
    fireEvent.change(screen.getByLabelText(/Orijinal tutar/), { target: { value: '100' } })
    await userEvent.click(screen.getByRole('button', { name: 'İşlemi kaydet' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls.at(-1)?.[0]).toMatchObject({
      amountMinor: 10000,
      currency: 'TRY',
      tryMinor: 10000,
      status: 'pending',
      cashDate: '',
    })
    expect(close).toHaveBeenCalled()
  })
})

function existingRow(title: string, id: string): Transaction {
  return {
    id,
    title,
    kind: 'income',
    description: '',
    amountMinor: 10000,
    currency: 'TRY',
    rateMicros: 1000000,
    tryMinor: 10000,
    date: '2026-10-25',
    conversionDate: '2026-10-25',
    conversionMethod: 'manual',
    status: 'pending',
    cashDate: '',
    accountId: '',
    applicationId: '',
    categoryId: '',
    group: 'income',
    allocations: [],
    notes: '',
    vendor: '',
    invoice: '',
    attachmentName: '',
    expectedDate: '',
    linkId: '',
    apple: null,
    cashInMinor: 0,
    cashOutMinor: 0,
    createdAt: null,
    updatedAt: null,
    createdBy: 'admin',
    updatedBy: 'admin',
    schemaVersion: 1,
    deleted: false,
  }
}
describe('Düzenleme ve filtreler', () => {
  it('düzenlemede aynı belge kimliğini kullanır', async () => {
    wrapped(
      <TransactionForm
        kind="income"
        initial={existingRow('Önceki başlık', 'record-1')}
        onClose={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText(/Gelir başlığı/), { target: { value: 'Yeni başlık' } })
    await userEvent.click(screen.getByRole('button', { name: 'İşlemi kaydet' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0][0].title).toBe('Yeni başlık')
    expect(mocks.save.mock.calls[0][1]).toBe('record-1')
  })
  it('yüklenen işlem sayfasında başlık filtresi çalışır', async () => {
    mocks.history = [
      existingRow('Abonelik kazancı', 'one'),
      existingRow('Danışmanlık kazancı', 'two'),
    ]
    wrapped(<Transactions kind="income" />)
    expect(await screen.findByText('Abonelik kazancı')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('İşlem ara'), { target: { value: 'danışmanlık' } })
    expect(screen.queryByText('Abonelik kazancı')).not.toBeInTheDocument()
    expect(screen.getByText('Danışmanlık kazancı')).toBeInTheDocument()
  })
  it('Apple brüt modunda kullanıcıdan boş net tutar istenmez', async () => {
    wrapped(<TransactionForm kind="income" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Gelir başlığı/), {
      target: { value: 'Apple brüt gelir' },
    })
    fireEvent.change(screen.getByLabelText('Hesaplama yöntemi'), { target: { value: 'gross' } })
    fireEvent.change(screen.getByLabelText('Brüt müşteri satışları'), { target: { value: '100' } })
    await userEvent.click(screen.getByRole('button', { name: 'İşlemi kaydet' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ amountMinor: 8500, tryMinor: 8500 })
  })
})
