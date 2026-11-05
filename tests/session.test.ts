import { describe, expect, it } from 'vitest'
import { sessionExpired } from '../src/lib/auth'
describe('5 günlük oturum', () => {
  const now = Date.parse('2026-11-06T12:00:00Z')
  it('5 günden kısa oturum açık kalır', () =>
    expect(sessionExpired('2026-11-02T12:00:00Z', now)).toBe(false))
  it('5 gün dolunca kapanır', () => expect(sessionExpired('2026-11-01T12:00:00Z', now)).toBe(true))
  it('giriş zamanı bilinmiyorsa kapanır', () => expect(sessionExpired('', now)).toBe(true))
})
