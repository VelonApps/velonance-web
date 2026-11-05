import { initializeApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  connectAuthEmulator,
  inMemoryPersistence,
  setPersistence,
} from 'firebase/auth'
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import type { Firestore } from 'firebase/firestore'
const runtime = import.meta.hot?.data.firebaseRuntime as
  { db: Firestore | null; authReady: Promise<void> } | undefined
const env = import.meta.env
export const configured = !!(
  env.VITE_FIREBASE_API_KEY &&
  env.VITE_FIREBASE_AUTH_DOMAIN &&
  env.VITE_FIREBASE_PROJECT_ID &&
  env.VITE_FIREBASE_APP_ID &&
  env.VITE_STUDIO_ID
)
export const studioId = env.VITE_STUDIO_ID || ''
const app = configured
  ? initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    })
  : null
export const auth = app ? getAuth(app) : null
export const db =
  runtime?.db ?? (app ? initializeFirestore(app, { localCache: memoryLocalCache() }) : null)
export const authReady =
  runtime?.authReady ?? (auth ? setPersistence(auth, inMemoryPersistence) : Promise.resolve())
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
if (!runtime && app && env.VITE_RECAPTCHA_SITE_KEY)
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  })
if (!runtime && auth && db && env.DEV && env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

if (import.meta.hot) import.meta.hot.data.firebaseRuntime = { db, authReady }
