import { describe, expect, it } from 'vitest'
import { csvCell, validateBackup } from '../src/lib/backup'
const backup = (collections: unknown, studioId = 's') =>
  JSON.stringify({ schemaVersion: 1, studioId, exportedAt: '2026-10-25', collections })
const app = {
  id: 'app1',
  name: 'NexaRoom',
  platform: 'iOS',
  bundleId: '',
  url: '',
  launchDate: '',
  status: 'live',
  description: '',
  icon: '',
}
describe('Güvenli veri aktarımı', () => {
  it.each([
    '=HYPERLINK("https://evil.test")',
    '+SUM(1,1)',
    '-2+3',
    '@SUM(1,1)',
    '  =1+1',
    '\tformula',
  ])('CSV formülü etkisiz: %s', (v) => expect(csvCell(v)).toMatch(/^"'/))
  it('tırnakları çiftler', () => expect(csvCell('a"b')).toBe('"a""b"'))
  it('geçersiz JSON reddedilir', () => expect(() => validateBackup('{}', 's')).toThrow())
  it('stüdyolar arası aktarım reddedilir', () =>
    expect(() => validateBackup(backup({ applications: [app] }, 'other'), 's')).toThrow())
  it('geçerli referans kaydı önizlenir', () =>
    expect(validateBackup(backup({ applications: [app] }), 's')[0].status).toBe('ready'))
  it('dosya içi yinelenen ID', () =>
    expect(validateBackup(backup({ applications: [app, app] }), 's')[1].status).toBe('duplicate'))
  it('geçersiz yol kimliği', () =>
    expect(
      validateBackup(backup({ applications: [{ ...app, id: '../other' }] }), 's')[0].status,
    ).toBe('invalid'))
  it('bağlı geri yükleme güvenli biçimde reddedilir', () =>
    expect(validateBackup(backup({ repayments: [{ id: 'payment1' }] }), 's')[0].status).toBe(
      'unsupported',
    ))
  it('bilinmeyen alanlar şema tarafından atılır', () => {
    const row = validateBackup(backup({ applications: [{ ...app, role: 'ADMIN' }] }), 's')[0]
    expect(row.data).not.toHaveProperty('role')
  })
})
