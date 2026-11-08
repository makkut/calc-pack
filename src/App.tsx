import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { Archive, Box, Cloud, CloudOff, LogOut, PackagePlus, Plus, Trash2, Pencil, Save, X, Scale, Euro } from 'lucide-react'
import AuthPanel from './AuthPanel'
import { deleteCloudShipment, importLocalShipments, saveCloudShipment, watchShipments } from './cloud'
import { firebaseConfigured, getFirebaseServices } from './firebase'
import { getShipments as getLocalShipments, type Item, type Shipment } from './db'

const uid = () => crypto.randomUUID()
const integer = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n)
const euros = (cents: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const weightKg = (grams: number) => `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(grams / 1000)} кг`
const weightGrams = (grams: number) => `${integer(grams)} г`
const migrationKey = (userId: string) => `parcel-calculator-local-import-v1:${userId}`

function MoneyValue({ cents }: { cents: number }) {
  return <span className="money-value"><span>{integer(cents)} ct</span><small className="sub-value">{euros(cents)}</small></span>
}

function friendlyCloudError(error: Error): string {
  const code = (error as Error & { code?: string }).code ?? ''
  if (code.includes('permission-denied')) return 'Нет доступа к базе данных. Проверь правила Firestore из файла firestore.rules.'
  if (code.includes('unavailable') || code.includes('network')) return 'Нет соединения с Firebase. Проверь интернет и попробуй ещё раз.'
  if (code.includes('not-found')) return 'База Firestore ещё не создана в Firebase Console.'
  return error.message || 'Не удалось обратиться к облачной базе данных.'
}

function FirebaseSetup() {
  return <main className="auth-shell">
    <section className="auth-card setup-card">
      <div className="auth-brand-icon"><PackagePlus size={26}/></div>
      <div className="auth-eyebrow">ПОСЛЕДНИЙ ШАГ НАСТРОЙКИ</div>
      <h1>Подключи Firebase</h1>
      <p className="auth-intro">Код авторизации и облачного хранения уже добавлен. Осталось подключить конфигурацию своего бесплатного проекта Firebase.</p>
      <ol className="setup-steps">
        <li>Создай проект на <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">Firebase Console</a>.</li>
        <li>Добавь Web-приложение (значок <b>&lt;/&gt;</b>) и скопируй конфигурацию.</li>
        <li>Включи <b>Authentication → Sign-in method → Email/Password</b>.</li>
        <li>Создай базу <b>Firestore Database</b> в режиме Production.</li>
        <li>Скопируй файл <b>.env.example</b> в <b>.env.local</b> и заполни значения:</li>
      </ol>
      <pre className="env-example">VITE_FIREBASE_API_KEY=твой_api_key{'\n'}VITE_FIREBASE_AUTH_DOMAIN=твой_домен.firebaseapp.com{'\n'}VITE_FIREBASE_PROJECT_ID=твой_project_id{'\n'}VITE_FIREBASE_APP_ID=твой_app_id</pre>
      <p className="setup-note">После сохранения .env.local перезапусти Vite командой <code>npm run dev</code>. Этот файл не нужно загружать в GitHub.</p>
      <a className="button button-primary setup-button" href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">Открыть Firebase Console</a>
    </section>
  </main>
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [shipmentName, setShipmentName] = useState('Новая посылка')
  const [packagingWeightGrams, setPackagingWeightGrams] = useState('0')
  const [items, setItems] = useState<Item[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', unitWeightGrams: '', quantity: '1', unitPriceCents: '' })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [localImport, setLocalImport] = useState<Shipment[] | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!firebaseConfigured) {
      setAuthLoading(false)
      return
    }

    try {
      const { auth } = getFirebaseServices()
      return onAuthStateChanged(auth, nextUser => {
        setUser(nextUser)
        setAuthError('')
        setAuthLoading(false)
      }, error => {
        setAuthError(error.message)
        setAuthLoading(false)
      })
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Не удалось подключить Firebase.')
      setAuthLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setShipments([])
      setLocalImport(null)
      setLoading(false)
      setActiveId('')
      setItems([])
      return
    }

    let active = true
    setLoading(true)
    setCloudError('')
    setStatusMessage('')

    const unsubscribe = watchShipments(user.uid, data => {
      if (!active) return
      setShipments(data)
      setLoading(false)
    }, error => {
      if (!active) return
      setCloudError(friendlyCloudError(error))
      setLoading(false)
    })

    const key = migrationKey(user.uid)
    if (!localStorage.getItem(key)) {
      getLocalShipments().then(local => {
        if (!active) return
        if (local.length > 0) setLocalImport(local)
        else localStorage.setItem(key, 'done')
      }).catch(error => {
        if (active) setCloudError(`Не удалось проверить старые локальные посылки: ${friendlyCloudError(error)}`)
      })
    }

    return () => {
      active = false
      unsubscribe()
    }
  }, [user])

  const totals = useMemo(() => items.reduce((acc, item) => ({
    quantity: acc.quantity + item.quantity,
    weightGrams: acc.weightGrams + item.unitWeightGrams * item.quantity,
    priceCents: acc.priceCents + item.unitPriceCents * item.quantity,
  }), { quantity: 0, weightGrams: 0, priceCents: 0 }), [items])
  const packagingGrams = Math.max(0, Math.round(Number(packagingWeightGrams) || 0))
  const fullWeightGrams = totals.weightGrams + packagingGrams

  const resetForm = () => {
    setForm({ name: '', unitWeightGrams: '', quantity: '1', unitPriceCents: '' })
    setEditingId(null)
  }

  const addItem = () => {
    const weight = Number(form.unitWeightGrams)
    const quantity = Number(form.quantity)
    const price = Number(form.unitPriceCents)
    if (
      !form.name.trim() || form.unitWeightGrams.trim() === '' || form.quantity.trim() === '' || form.unitPriceCents.trim() === '' ||
      !Number.isInteger(weight) || !Number.isInteger(quantity) || !Number.isInteger(price) ||
      weight < 0 || quantity <= 0 || price < 0
    ) return

    const item: Item = {
      id: editingId || uid(),
      name: form.name.trim(),
      unitWeightGrams: weight,
      quantity,
      unitPriceCents: price,
    }
    setItems(current => editingId ? current.map(x => x.id === editingId ? item : x) : [...current, item])
    resetForm()
  }

  const editItem = (item: Item) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      unitWeightGrams: String(item.unitWeightGrams),
      quantity: String(item.quantity),
      unitPriceCents: String(item.unitPriceCents),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveCurrent = async () => {
    if (!user) return
    setSaving(true)
    setCloudError('')
    setStatusMessage('')
    try {
      const shipment: Shipment = {
        id: activeId || uid(),
        name: shipmentName.trim() || 'Посылка без названия',
        createdAt: shipments.find(item => item.id === activeId)?.createdAt ?? new Date().toISOString(),
        packagingWeightGrams: packagingGrams,
        items,
      }
      await saveCloudShipment(user.uid, shipment)
      setActiveId(shipment.id)
      setStatusMessage('Посылка сохранена в облаке.')
    } catch (error) {
      setCloudError(friendlyCloudError(error as Error))
    } finally {
      setSaving(false)
    }
  }

  const newShipment = () => {
    setActiveId('')
    setShipmentName('Новая посылка')
    setPackagingWeightGrams('0')
    setItems([])
    resetForm()
    setStatusMessage('')
  }

  const openShipment = (shipment: Shipment) => {
    setActiveId(shipment.id)
    setShipmentName(shipment.name)
    setPackagingWeightGrams(String(shipment.packagingWeightGrams))
    setItems(shipment.items)
    resetForm()
    setStatusMessage('')
  }

  const removeShipment = async (id: string) => {
    if (!user || !confirm('Удалить эту посылку без возможности восстановления?')) return
    try {
      await deleteCloudShipment(user.uid, id)
      if (activeId === id) newShipment()
      setStatusMessage('Посылка удалена из облака.')
    } catch (error) {
      setCloudError(friendlyCloudError(error as Error))
    }
  }

  const handleLocalImport = async () => {
    if (!user || !localImport) return
    setImporting(true)
    setCloudError('')
    try {
      const result = await importLocalShipments(user.uid, localImport)
      localStorage.setItem(migrationKey(user.uid), 'done')
      setLocalImport(null)
      setStatusMessage(`Перенос завершён. Добавлено посылок: ${result.imported}. Уже находилось в облаке: ${result.alreadyInCloud}.`)
    } catch (error) {
      setCloudError(friendlyCloudError(error as Error))
    } finally {
      setImporting(false)
    }
  }

  const dismissLocalImport = () => {
    if (user) localStorage.setItem(migrationKey(user.uid), 'done')
    setLocalImport(null)
  }

  const handleSignOut = async () => {
    try {
      const { auth } = getFirebaseServices()
      await signOut(auth)
      newShipment()
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : 'Не удалось выйти из аккаунта.')
    }
  }

  if (!firebaseConfigured) return <FirebaseSetup />
  if (authLoading) return <main className="auth-shell"><div className="auth-loading">Подключение к аккаунту…</div></main>
  if (!user) return <><AuthPanel />{authError && <div className="auth-global-error">{authError}</div>}</>

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="brand-icon"><PackagePlus size={22}/></div><div><div className="brand-title">Мои посылки</div><div className="brand-subtitle">Личный калькулятор отправлений</div></div></div>
      <div className="account-actions"><span className="account-email" title={user.email ?? ''}>{user.email}</span><button className="button button-light" onClick={handleSignOut}><LogOut size={16}/> Выйти</button><button className="button button-light" onClick={newShipment}><Plus size={17}/> Новая посылка</button></div>
    </header>

    <div className="cloud-status"><Cloud size={15}/> Данные синхронизируются через Firebase и доступны на всех устройствах с этим аккаунтом.</div>
    {cloudError && <div className="app-alert error">{cloudError}</div>}
    {statusMessage && <div className="app-alert success">{statusMessage}</div>}

    {localImport && <section className="migration-card">
      <div><b>Найдены старые посылки на этом устройстве</b><p>Можно перенести {localImport.length} {localImport.length === 1 ? 'посылку' : 'посылок'} из прежней локальной базы в Firebase. Уже существующие облачные записи не будут перезаписаны.</p></div>
      <div className="migration-actions"><button className="button button-primary" onClick={handleLocalImport} disabled={importing}>{importing ? 'Перенос…' : 'Перенести в аккаунт'}</button><button className="button button-ghost" onClick={dismissLocalImport} disabled={importing}>Не переносить</button></div>
    </section>}

    <section className="summary-grid">
      <div className="summary-card">
        <div className="summary-label"><Scale size={16}/> Общий вес с упаковкой</div>
        <div className="summary-value">{weightGrams(fullWeightGrams)} <small>{weightKg(fullWeightGrams)}</small></div>
        <div className="summary-note">Товары: {weightGrams(totals.weightGrams)} · Упаковка: {weightGrams(packagingGrams)}</div>
      </div>
      <div className="summary-card">
        <div className="summary-label"><Euro size={16}/> Стоимость товаров</div>
        <div className="summary-value">{euros(totals.priceCents)}</div>
        <div className="summary-note">{integer(totals.priceCents)} центов · {totals.quantity} шт. всего</div>
      </div>
    </section>

    <div className="layout">
      <section className="panel main-panel">
        <div className="section-heading"><div><div className="eyebrow">ТЕКУЩЕЕ ОТПРАВЛЕНИЕ</div><h1>Состав посылки</h1></div><span className="count-pill">{items.length} поз.</span></div>
        <div className="shipment-fields">
          <label className="field"><span>Название посылки</span><input value={shipmentName} onChange={event => setShipmentName(event.target.value)} placeholder="Например, Посылка ноябрь" /></label>
          <label className="field packaging"><span>Вес упаковки, г</span><input type="number" min="0" step="1" value={packagingWeightGrams} onChange={event => setPackagingWeightGrams(event.target.value)} placeholder="300" /></label>
        </div>

        <div className="form-card">
          <div className="form-title">{editingId ? 'Редактировать товар' : 'Добавить товар'}</div>
          <div className="item-form">
            <label className="field name-field"><span>Название товара</span><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Например, кофемашина" /></label>
            <label className="field"><span>Вес 1 шт., грамм</span><input type="number" min="0" step="1" value={form.unitWeightGrams} onChange={event => setForm({ ...form, unitWeightGrams: event.target.value })} placeholder="300" /></label>
            <label className="field"><span>Количество, шт.</span><input type="number" min="1" step="1" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} /></label>
            <label className="field"><span>Цена 1 шт., центов</span><input type="number" min="0" step="1" value={form.unitPriceCents} onChange={event => setForm({ ...form, unitPriceCents: event.target.value })} placeholder="99" /></label>
          </div>
          <div className="form-actions">{editingId && <button className="button button-ghost" onClick={resetForm}><X size={16}/> Отмена</button>}<button className="button button-primary" onClick={addItem}>{editingId ? <Save size={16}/> : <Plus size={17}/>} {editingId ? 'Сохранить изменения' : 'Добавить в посылку'}</button></div>
          <div className="input-hint">Вводи вес в граммах (например, 300), цену — в центах (например, 99).</div>
        </div>

        <div className="table-wrap">
          <table><thead><tr><th>Товар</th><th>Вес 1 шт., г</th><th>Кол-во</th><th>Общий вес, г</th><th>Цена 1 шт.</th><th>Сумма позиции</th><th></th></tr></thead>
            <tbody>{items.map(item => <tr key={item.id}>
              <td className="product-name">{item.name}</td>
              <td>{weightGrams(item.unitWeightGrams)}</td>
              <td>{item.quantity}</td>
              <td className="strong">{weightGrams(item.unitWeightGrams * item.quantity)}</td>
              <td><MoneyValue cents={item.unitPriceCents}/></td>
              <td className="strong"><MoneyValue cents={item.unitPriceCents * item.quantity}/></td>
              <td><div className="row-actions"><button title="Редактировать" className="icon-button" onClick={() => editItem(item)}><Pencil size={15}/></button><button title="Удалить" className="icon-button danger" onClick={() => setItems(current => current.filter(x => x.id !== item.id))}><Trash2 size={15}/></button></div></td>
            </tr>)}</tbody>
          </table>
          {items.length === 0 && <div className="empty"><Box size={30}/><b>Пока нет товаров</b><span>Добавь первый товар с его весом в граммах и ценой в центах.</span></div>}
          {items.length > 0 && <div className="table-total"><b>ИТОГО</b><b>{totals.quantity} шт.</b><b>{weightGrams(totals.weightGrams)}</b><b><MoneyValue cents={totals.priceCents}/></b><span></span></div>}
        </div>
        <div className="bottom-actions"><div className="autosave-hint">Посылки сохраняются в облаке Firebase и синхронизируются между устройствами.</div><button className="button button-primary" onClick={saveCurrent} disabled={saving}><Save size={17}/> {saving ? 'Сохранение…' : 'Сохранить посылку'}</button></div>
      </section>

      <aside className="panel history-panel"><div className="history-heading"><div><div className="eyebrow">ОБЛАЧНАЯ БАЗА</div><h2><Archive size={19}/> Мои посылки</h2></div><span className="count-pill">{shipments.length}</span></div>
        {loading ? <p className="muted">Загрузка из облака…</p> : shipments.length === 0 ? <div className="history-empty">Сохранённых посылок пока нет.</div> : <div className="history-list">{shipments.map(shipment => {
          const weight = shipment.items.reduce((sum, item) => sum + item.unitWeightGrams * item.quantity, 0)
          const price = shipment.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)
          return <div className={`history-item ${activeId === shipment.id ? 'selected' : ''}`} key={shipment.id}><button className="history-open" onClick={() => openShipment(shipment)}><b>{shipment.name}</b><span>{new Date(shipment.createdAt).toLocaleDateString('ru-RU')}</span><small>{weightGrams(weight + shipment.packagingWeightGrams)} · {euros(price)}</small></button><button className="icon-button danger" title="Удалить посылку" onClick={() => removeShipment(shipment.id)}><Trash2 size={15}/></button></div>
        })}</div>}
        <div className="privacy-note"><CloudOff size={13}/> Каждый пользователь видит только свои посылки. Для синхронизации между устройствами нужен интернет.</div>
      </aside>
    </div>
    <footer>Мои посылки · Firebase Authentication · Cloud Firestore</footer>
  </main>
}
