import { ZodError } from 'zod'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { useQueryClient } from '@tanstack/react-query'
import { auth, authReady, db, googleProvider, studioId } from './firebase'
import { recordAccess, recordDenied } from './repository'
export type Authorization = {
  uid: string
  email: string
  role: 'ADMIN' | 'VIEWER'
  active: boolean
  studioId: string
}
type AuthState = {
  user: User | null
  authorization: Authorization | null
  loading: boolean
  error: string
  login: () => Promise<void>
  logout: () => Promise<void>
}
const Context = createContext<AuthState | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [authorization, setAuthorization] = useState<Authorization | null>(null),
    [loading, setLoading] = useState(!!auth),
    [error, setError] = useState('')
  const cache = useQueryClient(),
    logged = useRef('')
  useEffect(() => {
    if (!auth) return
    let offRole = () => {}
    const off = onAuthStateChanged(auth, (u) => {
      offRole()
      cache.clear()
      setUser(u)
      setAuthorization(null)
      setError('')
      logged.current = ''
      if (!u || !db) {
        setLoading(false)
        return
      }
      setLoading(true)
      offRole = onSnapshot(
        doc(db, 'authorizedUsers', u.uid),
        (snap) => {
          const role = snap.data() as Authorization | undefined
          const allowed =
            role &&
            role.active &&
            role.uid === u.uid &&
            role.email === u.email &&
            u.emailVerified &&
            role.studioId === studioId &&
            ['ADMIN', 'VIEWER'].includes(role.role)
          setAuthorization(allowed ? role : null)
          const state = u.uid + ':' + String(!!allowed)
          if (logged.current !== state) {
            logged.current = state
            void (allowed ? recordAccess('sign_in') : recordDenied())
          }
          if (!allowed) {
            cache.clear()
            setError(
              'Bu Google hesabının stüdyoya erişim yetkisi yok. Yönetici UID kaydını kontrol etmelidir.',
            )
          }
          setLoading(false)
        },
        () => {
          cache.clear()
          setAuthorization(null)
          setError(
            'Erişim yetkisi doğrulanamadı. Yönetici kaydını ve Firestore kurallarını kontrol edin.',
          )
          setLoading(false)
        },
      )
    })
    return () => {
      off()
      offRole()
    }
  }, [cache])
  async function login() {
    if (!auth) return
    setError('')
    try {
      await authReady
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      setError(friendlyError(e))
    }
  }
  async function logout() {
    if (!auth) return
    if (authorization) await recordAccess('sign_out')
    await signOut(auth)
    cache.clear()
    setAuthorization(null)
  }
  return (
    <Context.Provider value={{ user, authorization, loading, error, login, logout }}>
      {children}
    </Context.Provider>
  )
}
export function useAuth() {
  const state = useContext(Context)
  if (!state) throw new Error('AuthProvider gerekli.')
  return state
}
export function friendlyError(error: unknown) {
  if (error instanceof ZodError)
    return error.issues.map((i) => i.path.join('.') + ': ' + i.message).join(' · ')
  const code = (error as { code?: string })?.code
  return code === 'permission-denied'
    ? 'İşlem için yetkiniz yok veya güvenlik kuralları kaydı reddetti.'
    : code === 'auth/popup-blocked'
      ? 'Tarayıcı giriş penceresini engelledi. Açılır pencerelere izin verin.'
      : code === 'auth/popup-closed-by-user'
        ? 'Giriş penceresi kapatıldı.'
        : code === 'auth/unauthorized-domain'
          ? 'Bu alan adı Firebase Authentication yetkili alan adlarına eklenmeli.'
          : code === 'unavailable'
            ? 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'
            : error instanceof Error
              ? error.message
              : 'İşlem tamamlanamadı.'
}
