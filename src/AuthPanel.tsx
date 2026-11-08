import { useState, type FormEvent } from 'react'
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { KeyRound, Mail, PackagePlus } from 'lucide-react'
import { getFirebaseServices } from './firebase'

function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''

  switch (code) {
    case 'auth/email-already-in-use': return 'Этот адрес уже зарегистрирован. Попробуй войти.'
    case 'auth/invalid-email': return 'Проверь правильность адреса электронной почты.'
    case 'auth/weak-password': return 'Пароль слишком простой. Используй не менее 6 символов.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Неверный адрес электронной почты или пароль.'
    case 'auth/operation-not-allowed': return 'В Firebase Console не включён вход по Email/Password.'
    case 'auth/too-many-requests': return 'Слишком много попыток. Попробуй немного позже.'
    case 'auth/network-request-failed': return 'Нет соединения с Firebase. Проверь интернет.'
    case 'auth/unauthorized-domain': return 'Этот домен не добавлен в список разрешённых доменов Firebase Authentication.'
    default: return error instanceof Error ? error.message : 'Не удалось выполнить вход. Попробуй ещё раз.'
  }
}

type Mode = 'login' | 'register' | 'reset'

export default function AuthPanel() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)

    try {
      const { auth } = getFirebaseServices()
      const normalizedEmail = email.trim()

      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, normalizedEmail)
        setMessage('Письмо для сброса пароля отправлено. Проверь почту.')
      } else if (mode === 'register') {
        if (password.length < 6) throw new Error('Пароль должен содержать не менее 6 символов.')
        await createUserWithEmailAndPassword(auth, normalizedEmail, password)
      } else {
        await signInWithEmailAndPassword(auth, normalizedEmail, password)
      }
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-shell">
    <section className="auth-card">
      <div className="auth-brand-icon"><PackagePlus size={26}/></div>
      <div className="auth-eyebrow">ЛИЧНЫЙ КАЛЬКУЛЯТОР</div>
      <h1>Мои посылки</h1>
      <p className="auth-intro">Войди в аккаунт, чтобы сохранять посылки и открывать их с любого устройства.</p>

      <div className="auth-tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setMessage('') }} type="button">Вход</button>
        <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setMessage('') }} type="button">Регистрация</button>
      </div>

      <form onSubmit={submit} className="auth-form">
        <label className="field">
          <span>Электронная почта</span>
          <div className="auth-input-wrap"><Mail size={17}/><input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" /></div>
        </label>
        {mode !== 'reset' && <label className="field">
          <span>Пароль</span>
          <div className="auth-input-wrap"><KeyRound size={17}/><input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={event => setPassword(event.target.value)} placeholder="Не менее 6 символов" /></div>
        </label>}
        {error && <div className="auth-alert error">{error}</div>}
        {message && <div className="auth-alert success">{message}</div>}
        <button className="button button-primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'Подожди…' : mode === 'register' ? 'Создать аккаунт' : mode === 'reset' ? 'Отправить письмо' : 'Войти'}
        </button>
      </form>

      {mode === 'login' && <button className="auth-link" type="button" onClick={() => { setMode('reset'); setError(''); setMessage('') }}>Забыли пароль?</button>}
      {mode === 'reset' && <button className="auth-link" type="button" onClick={() => { setMode('login'); setError(''); setMessage('') }}>Вернуться ко входу</button>}
      {mode === 'register' && <p className="auth-footnote">Используй один и тот же email и пароль на компьютере и телефоне.</p>}
    </section>
  </main>
}
