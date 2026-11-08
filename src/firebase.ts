import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? '',
}

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
)

export function getFirebaseServices() {
  if (!firebaseConfigured) {
    throw new Error('Firebase не настроен. Создай файл .env.local по примеру .env.example и добавь данные своего проекта Firebase.')
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  return {
    auth: getAuth(app),
    db: getFirestore(app),
  }
}
