import { describe, expect, it } from 'vitest'
import { parseFrankfurter, parseTruncgil } from '../src/lib/liveRates'
describe('Canlı kur okuma', () => {
  it('Truncgil alış-satış ortalamasını alır, altını eşler', () => {
    const live = parseTruncgil({
      Update_Date: '2026-11-06 01:45:03',
      USD: { Alış: '50,0750', Satış: '50,1697' },
      'gram-altin': { Alış: '6.587,08', Satış: '6.587,92' },
      EUR: { Alış: 'bozuk', Satış: '1' },
    })
    expect(live.rows).toEqual([
      { unit: 'USD', asset: 'currency', priceMicros: 50122350 },
      { unit: 'Gram', asset: 'gold', priceMicros: 6587500000 },
    ])
  })
  it('boş listede hata verir', () => expect(() => parseTruncgil({})).toThrow())
  it('Frankfurter TRY tabanını ters çevirir', () =>
    expect(parseFrankfurter({ date: '2026-11-05', rates: { USD: 0.02, EUR: 0 } }).rows).toEqual([
      { unit: 'USD', asset: 'currency', priceMicros: 50000000 },
    ]))
})
