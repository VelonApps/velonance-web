import { describe, expect, it } from 'vitest'
import { auditChanges, auditTitle, browserLabel } from '../src/lib/audit'
describe('Değişiklik kaydı biçimi', () => {
  it('yalnızca değişen alanları gösterir, tutarı para birimiyle yazar', () => {
    const changes = auditChanges({
      before: { title: 'A', amountMinor: 1000, currency: 'USD', notes: 'x', updatedBy: 'u1' },
      after: { title: 'A', amountMinor: 2050, currency: 'USD', notes: '', updatedBy: 'u2' },
    })
    expect(changes.map((c) => c.label)).toEqual(['Tutar', 'Not'])
    expect(changes[0].after).toContain('20,50')
    expect(changes[1].after).toBe('—')
  })
  it('oluşturmada boş alanları atlar', () => {
    const changes = auditChanges({ before: null, after: { title: 'A', notes: '', linkId: '' } })
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ label: 'Başlık', before: '—', after: 'A' })
  })
  it('kısmi kayıtta dokunulmayan alanları iddia etmez', () => {
    const changes = auditChanges({
      before: { title: 'A', status: 'settled' },
      after: { status: 'cancelled' },
    })
    expect(changes.map((c) => c.field)).toEqual(['status'])
  })
  it('iç içe kaydı açar; para birimi olmayan birimde çökmez', () => {
    const changes = auditChanges({
      before: { repaidMicros: 0 },
      after: { repaidMicros: 1500000, payment: { amountMinor: 0, currency: 'Gram' } },
    })
    expect(changes.find((c) => c.field === 'repaidMicros')?.after).toBe('1,5')
    expect(changes.find((c) => c.field === 'payment.amountMinor')?.after).toBe('0')
  })
  it('başlık ve tarayıcı etiketi', () => {
    expect(auditTitle({ before: { name: 'Hesap' }, after: { archived: true } })).toBe('Hesap')
    expect(
      browserLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18 Safari/605.1.15'),
    ).toBe('Safari · macOS')
  })
})
